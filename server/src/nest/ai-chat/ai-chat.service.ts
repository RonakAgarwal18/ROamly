import { readEnv } from '../../app-config';
import { safeFetchLlm } from '../../utils/ssrfGuard';
import { AssignmentsService } from '../assignments/assignments.service';
import { DatabaseService } from '../database/database.service';
import { DayNotesService } from '../day-notes/day-notes.service';
import { DayRemovalService, DayDeleteError } from '../days/day-removal.service';
import { DaysService } from '../days/days.service';
import { parseLenientJson } from '../llm-parse/lenient-json';
import { createLlmClient } from '../llm-parse/llm-client.factory';
import { LlmConfigResolver } from '../llm-parse/llm-config.resolver';
import { ToolsNotSupportedError } from '../llm-parse/llm-provider.interface';
import type { LlmChatMessage, LlmExtractionClient } from '../llm-parse/llm-provider.interface';
import { PlacesService } from '../places/places.service';
import { AI_CHAT_TOOLS } from './ai-chat.tools';
import { HttpException, Injectable } from '@nestjs/common';
import {
  AI_CHAT_LLM_FAILED,
  AI_CHAT_LLM_NOT_CONFIGURED,
  addNoteArgsSchema,
  addPlaceArgsSchema,
  createDayArgsSchema,
  deleteDayArgsSchema,
  deletePlaceArgsSchema,
  updateDayArgsSchema,
  updatePlaceArgsSchema,
  aiChatToolArgsSchemas,
  type AiChatAction,
  type AiChatHistoryMessage,
  type AiChatResponse,
  type AiChatToolName,
} from '@roamly/shared';

const MAX_TOOL_ITERATIONS = 12;

interface ToolResult {
  ok: boolean;
  tool: AiChatToolName;
  summary: string;
  error?: string;
  data?: Record<string, unknown>;
}

/**
 * Roamly AI — agentic trip chat.
 *
 * The server sends the user message plus a compact trip context to the user's
 * configured LLM (Settings → LLM connection, resolved by LlmConfigResolver —
 * the same connection the booking import uses). The model calls trip-mutating
 * tools; each call is re-validated against the @roamly/shared Zod schemas and
 * executed through the existing DaysService/PlacesService/AssignmentsService/
 * DayNotesService so permissions, broadcasts and cascades behave exactly like
 * the UI paths. A model/server without tool calling falls back to a strict-JSON
 * single-shot parsed with lenient-json.
 */
@Injectable()
export class AiChatService {
  constructor(
    private readonly configResolver: LlmConfigResolver,
    private readonly days: DaysService,
    private readonly dayRemoval: DayRemovalService,
    private readonly places: PlacesService,
    private readonly assignments: AssignmentsService,
    private readonly dayNotes: DayNotesService,
    private readonly db: DatabaseService,
  ) {}

  async chat(
    tripId: string,
    userId: number,
    message: string,
    history: AiChatHistoryMessage[],
  ): Promise<AiChatResponse> {
    const config = this.configResolver.resolve(userId);
    if (!config) {
      throw new HttpException({ error: AI_CHAT_LLM_NOT_CONFIGURED }, 409);
    }
    const context = this.buildTripContext(tripId);
    const system = buildSystemPrompt(context);
    const convo: LlmChatMessage[] = [
      { role: 'system', content: system },
      ...history.map((h): LlmChatMessage => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const client: LlmExtractionClient = createLlmClient(config);
    const actions: AiChatAction[] = [];
    try {
      let reply: string;
      if (typeof client.chat === 'function') {
        try {
          reply = await this.toolLoop(client, config, convo, tripId, userId, actions);
        } catch (err) {
          if (!(err instanceof ToolsNotSupportedError)) throw err;
          actions.length = 0;
          reply = await this.strictJsonFallback(config, system, convo, tripId, userId, actions);
        }
      } else {
        reply = await this.strictJsonFallback(config, system, convo, tripId, userId, actions);
      }
      return { reply, actions, model: config.model };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException({ error: AI_CHAT_LLM_FAILED }, 502);
    }
  }

  // ------------------------------------------------------------------ context

  /** Compact trip snapshot the model reasons over: days, places, notes, members. */
  private buildTripContext(tripId: string): string {
    const trip = this.db.get<{ title: string; start_date: string | null; end_date: string | null }>(
      'SELECT title, start_date, end_date FROM trips WHERE id = ?',
      tripId,
    );
    const memberCount =
      this.db.get<{ n: number }>('SELECT COUNT(*) as n FROM trip_members WHERE trip_id = ?', tripId)?.n ?? 0;
    const { days } = this.days.list(tripId);
    const compact = {
      trip: {
        title: trip?.title ?? '',
        start_date: trip?.start_date ?? null,
        end_date: trip?.end_date ?? null,
        memberCount,
      },
      days: days.map((d) => ({
        id: d.id,
        dayNumber: d.day_number,
        date: d.date,
        title: d.title,
        notes: d.notes,
        places: d.assignments.map((a) => ({
          id: a.place_id,
          name: a.place.name,
          time: a.assignment_time ?? a.place.place_time,
          durationMinutes: a.place.duration_minutes,
          note: a.place.notes,
        })),
        notesItems: d.notes_items.map((n) => ({ text: n.text, time: n.time })),
      })),
    };
    return JSON.stringify(compact);
  }

  // ---------------------------------------------------------------- tool loop

  private async toolLoop(
    client: LlmExtractionClient,
    config: { model: string; baseUrl?: string; apiKey?: string },
    convo: LlmChatMessage[],
    tripId: string,
    userId: number,
    actions: AiChatAction[],
  ): Promise<string> {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const out = await client.chat!({
        model: config.model,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        messages: convo,
        tools: AI_CHAT_TOOLS,
      });
      if (out.toolCalls.length === 0) {
        return out.content.trim() || 'Done — no changes were needed.';
      }
      const results: string[] = [];
      for (const tc of out.toolCalls) {
        const r = await this.executeTool(tripId, userId, tc.name, tc.arguments);
        actions.push({ tool: r.tool, summary: r.summary });
        results.push(
          JSON.stringify({
            tool: tc.name,
            ok: r.ok,
            ...(r.ok ? {} : { error: r.error }),
            ...(r.data ? { data: r.data } : {}),
          }),
        );
      }
      convo.push({ role: 'assistant', content: out.content || 'Working on it…' });
      convo.push({
        role: 'user',
        content:
          `Tool results:\n${results.join('\n')}\n\n` +
          'Continue: call more tools if the request needs it, otherwise write the final reply summarizing what changed. Keep it short.',
      });
    }
    // Iteration cap hit — ask for a closing summary without further tools.
    const out = await client.chat!({
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      messages: [
        ...convo,
        { role: 'user', content: 'You have made many changes. Write the final summary reply now, no more tool calls.' },
      ],
      tools: [],
    });
    return out.content.trim() || 'Done.';
  }

  // ------------------------------------------------------- strict-JSON fallback

  /**
   * For models/servers without tool calling: one strict-JSON single-shot.
   * The prompt demands {"reply","actions":[{"tool","args"}]}; actions are
   * validated against the same Zod schemas as tool calls and executed in order.
   */
  private async strictJsonFallback(
    config: { provider: string; model: string; baseUrl?: string; apiKey?: string },
    system: string,
    convo: LlmChatMessage[],
    tripId: string,
    userId: number,
    actions: AiChatAction[],
  ): Promise<string> {
    const toolList = AI_CHAT_TOOLS.map((t) => `- ${t.name}: ${t.description}`).join('\n');
    const prompt =
      `${system}\n\nYou cannot call tools. Reply with ONLY a JSON object of this shape:\n` +
      `{"reply": "short summary for the user", "actions": [{"tool": "<tool name>", "args": {…}}]}\n` +
      `Available tools:\n${toolList}\n` +
      `Use "args" matching each tool's documented parameters. For pure questions, return {"reply": "…", "actions": []}.`;
    const messages = [{ role: 'system', content: prompt }, ...convo.filter((m) => m.role !== 'system')];
    const raw = await this.rawCompletion(config, messages);
    const parsed = parseLenientJson(raw) as { reply?: unknown; actions?: unknown } | null;
    const reply = typeof parsed?.reply === 'string' ? parsed.reply : '';
    const rawActions = Array.isArray(parsed?.actions) ? parsed.actions : [];
    for (const a of rawActions) {
      if (typeof a !== 'object' || a === null) continue;
      const { tool, args } = a as { tool?: unknown; args?: unknown };
      if (typeof tool !== 'string') continue;
      const r = await this.executeTool(tripId, userId, tool, args);
      actions.push({ tool: r.tool, summary: r.summary });
    }
    return reply.trim() || 'Done.';
  }

  /** Minimal provider-aware completion for the strict-JSON fallback path. */
  private async rawCompletion(
    config: { provider: string; model: string; baseUrl?: string; apiKey?: string },
    messages: { role: string; content: string }[],
  ): Promise<string> {
    const timeoutMs = readEnv().integrations.llmTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (config.provider === 'anthropic') {
        const base = (config.baseUrl ?? 'https://api.anthropic.com').replace(/(?<!\/)\/+$/, '');
        const system = messages
          .filter((m) => m.role === 'system')
          .map((m) => m.content)
          .join('\n\n');
        const res = await safeFetchLlm(`${base}/v1/messages`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            'x-api-key': config.apiKey ?? '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: 8192,
            ...(system ? { system } : {}),
            messages: messages.filter((m) => m.role !== 'system'),
          }),
        });
        if (!res.ok) throw new Error(`Anthropic request failed (${res.status})`);
        const data = (await res.json()) as { content?: { type: string; text?: string }[] };
        return (data.content ?? [])
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('');
      }
      const base = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/(?<!\/)\/+$/, '');
      const res = await safeFetchLlm(`${base}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 8192,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages,
        }),
      });
      if (!res.ok) throw new Error(`LLM request failed (${res.status})`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timer);
    }
  }

  // ------------------------------------------------------------------ tools

  private async executeTool(tripId: string, userId: number, toolName: string, args: unknown): Promise<ToolResult> {
    if (!(toolName in aiChatToolArgsSchemas)) {
      return {
        ok: false,
        tool: 'add_note',
        summary: `Unknown tool "${toolName}" — skipped.`,
        error: `unknown tool: ${toolName}`,
      };
    }
    const tool = toolName as AiChatToolName;
    const invalidArgs = (t: AiChatToolName, message: string): ToolResult => ({
      ok: false,
      tool: t,
      summary: `Invalid arguments for ${t} — skipped.`,
      error: message,
    });
    try {
      // Parse inside each case: the schema map returns a union type that does
      // not narrow on the tool name, so each branch validates its own args.
      switch (tool) {
        case 'create_day': {
          const parsed = createDayArgsSchema.safeParse(args);
          if (!parsed.success) return invalidArgs(tool, parsed.error.message);
          return this.toolCreateDay(tripId, parsed.data);
        }
        case 'update_day': {
          const parsed = updateDayArgsSchema.safeParse(args);
          if (!parsed.success) return invalidArgs(tool, parsed.error.message);
          return this.toolUpdateDay(tripId, parsed.data);
        }
        case 'delete_day': {
          const parsed = deleteDayArgsSchema.safeParse(args);
          if (!parsed.success) return invalidArgs(tool, parsed.error.message);
          return this.toolDeleteDay(tripId, userId, parsed.data);
        }
        case 'add_place': {
          const parsed = addPlaceArgsSchema.safeParse(args);
          if (!parsed.success) return invalidArgs(tool, parsed.error.message);
          return await this.toolAddPlace(tripId, parsed.data);
        }
        case 'update_place': {
          const parsed = updatePlaceArgsSchema.safeParse(args);
          if (!parsed.success) return invalidArgs(tool, parsed.error.message);
          return await this.toolUpdatePlace(tripId, parsed.data);
        }
        case 'delete_place': {
          const parsed = deletePlaceArgsSchema.safeParse(args);
          if (!parsed.success) return invalidArgs(tool, parsed.error.message);
          return await this.toolDeletePlace(tripId, parsed.data);
        }
        case 'add_note': {
          const parsed = addNoteArgsSchema.safeParse(args);
          if (!parsed.success) return invalidArgs(tool, parsed.error.message);
          return this.toolAddNote(tripId, parsed.data);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, tool, summary: `${tool} failed: ${msg}`, error: msg };
    }
  }

  private toolCreateDay(
    tripId: string,
    args: { date?: string; title?: string; notes?: string; position?: number },
  ): ToolResult {
    let day: { id: number; day_number: number; date: string | null };
    if (args.position !== undefined) {
      const inserted = this.days.insert(tripId, args.position) as {
        id: number;
        day_number: number;
        date: string | null;
      };
      day = inserted;
      // An insert shuffles dates/positions of other days — collaborators refetch.
      this.days.broadcast(tripId, 'day:reordered', { day }, undefined);
    } else {
      const created = this.days.create(tripId, args.date, args.notes) as {
        id: number;
        day_number: number;
        date: string | null;
      };
      day = created;
      this.days.broadcast(tripId, 'day:created', { day }, undefined);
    }
    if (args.title) {
      const current = this.days.getDay(day.id, tripId);
      if (current) {
        const updated = this.days.update(day.id, current as never, { title: args.title });
        this.days.broadcast(tripId, 'day:updated', { day: updated }, undefined);
      }
    }
    const label = `Day ${day.day_number}${(args.date ?? day.date) ? ` (${args.date ?? day.date})` : ''}${args.title ? ` — ${args.title}` : ''}`;
    return {
      ok: true,
      tool: 'create_day',
      summary: `Created ${label}.`,
      data: { dayId: day.id, dayNumber: day.day_number },
    };
  }

  private toolUpdateDay(
    tripId: string,
    args: { dayId: number; title?: string | null; notes?: string | null; date?: string | null },
  ): ToolResult {
    const current = this.days.getDay(args.dayId, tripId);
    if (!current) {
      return {
        ok: false,
        tool: 'update_day',
        summary: `Day ${args.dayId} not found — skipped.`,
        error: 'Day not found',
      };
    }
    const fields: { title?: string | null; notes?: string | null } = {};
    if (args.title !== undefined) fields.title = args.title;
    if (args.notes !== undefined) fields.notes = args.notes;
    const updated = this.days.update(args.dayId, current as never, fields);
    if (args.date !== undefined) {
      this.db.run('UPDATE days SET date = ? WHERE id = ?', args.date, args.dayId);
    }
    this.days.broadcast(tripId, 'day:updated', { day: updated }, undefined);
    return {
      ok: true,
      tool: 'update_day',
      summary: `Updated Day ${current.day_number}${args.title ? ` — now "${args.title}"` : ''}.`,
    };
  }

  private toolDeleteDay(tripId: string, userId: number, args: { dayId: number }): ToolResult {
    const current = this.days.getDay(args.dayId, tripId);
    if (!current) {
      return {
        ok: false,
        tool: 'delete_day',
        summary: `Day ${args.dayId} not found — skipped.`,
        error: 'Day not found',
      };
    }
    try {
      const removal = this.dayRemoval.remove(tripId, args.dayId, { userId });
      this.dayRemoval.announce(tripId, removal, {
        all: (event, payload) => this.days.broadcast(tripId, event, payload, undefined),
        others: (event, payload) => this.days.broadcast(tripId, event, payload, undefined),
        socketId: undefined,
      });
    } catch (err) {
      if (err instanceof DayDeleteError) {
        return {
          ok: false,
          tool: 'delete_day',
          summary: `Could not delete Day ${current.day_number}: ${err.message}`,
          error: err.message,
        };
      }
      throw err;
    }
    return { ok: true, tool: 'delete_day', summary: `Deleted Day ${current.day_number}.` };
  }

  private async toolAddPlace(
    tripId: string,
    args: {
      dayId: number;
      name: string;
      time?: string;
      durationMinutes?: number;
      note?: string;
      lat?: number;
      lng?: number;
      address?: string;
    },
  ): Promise<ToolResult> {
    const day = this.days.getDay(args.dayId, tripId);
    if (!day) {
      return {
        ok: false,
        tool: 'add_place',
        summary: `Day ${args.dayId} not found — skipped.`,
        error: 'Day not found',
      };
    }
    const place = this.places.create(tripId, {
      name: args.name,
      place_time: args.time,
      duration_minutes: args.durationMinutes,
      notes: args.note,
      lat: args.lat,
      lng: args.lng,
      address: args.address,
    });
    this.assignments.createAssignment(day.id, place.id);
    this.places.onCreated(tripId, place.id);
    this.places.broadcast(tripId, 'place:created', { place }, undefined);
    const when = args.time ? ` · ${formatTime(args.time)}` : '';
    return {
      ok: true,
      tool: 'add_place',
      summary: `Added ${args.name} to Day ${day.day_number}${when}.`,
      data: { placeId: place.id },
    };
  }

  private async toolUpdatePlace(
    tripId: string,
    args: {
      placeId: number;
      name?: string;
      time?: string | null;
      durationMinutes?: number | null;
      note?: string | null;
      dayId?: number;
    },
  ): Promise<ToolResult> {
    const existing = this.places.get(tripId, String(args.placeId));
    if (!existing) {
      return {
        ok: false,
        tool: 'update_place',
        summary: `Place ${args.placeId} not found — skipped.`,
        error: 'Place not found',
      };
    }
    const body: { name?: string; place_time?: string | null; duration_minutes?: number | null; notes?: string | null } =
      {};
    if (args.name !== undefined) body.name = args.name;
    if (args.time !== undefined) body.place_time = args.time;
    if (args.durationMinutes !== undefined) body.duration_minutes = args.durationMinutes;
    if (args.note !== undefined) body.notes = args.note;
    if (Object.keys(body).length > 0) {
      await this.places.update(tripId, String(args.placeId), body);
      const updated = this.places.get(tripId, String(args.placeId));
      if (updated) this.places.broadcast(tripId, 'place:updated', { place: updated }, undefined);
    }
    if (args.dayId !== undefined) {
      const targetDay = this.days.getDay(args.dayId, tripId);
      if (!targetDay) {
        return {
          ok: false,
          tool: 'update_place',
          summary: `Day ${args.dayId} not found — place not moved.`,
          error: 'Day not found',
        };
      }
      const rows = this.db.all<{ id: number; day_id: number }>(
        'SELECT da.id, da.day_id FROM day_assignments da JOIN days d ON da.day_id = d.id WHERE da.place_id = ? AND d.trip_id = ?',
        args.placeId,
        tripId,
      );
      if (rows.length === 1) {
        this.assignments.moveAssignment(rows[0].id, targetDay.id, null);
      } else {
        for (const r of rows) this.assignments.deleteAssignment(r.id);
        this.assignments.createAssignment(targetDay.id, args.placeId);
      }
      this.places.broadcast(
        tripId,
        'place:updated',
        { place: this.places.get(tripId, String(args.placeId)) },
        undefined,
      );
      return {
        ok: true,
        tool: 'update_place',
        summary: `Moved ${existing.name} to Day ${targetDay.day_number}${args.time ? ` · ${formatTime(args.time)}` : ''}.`,
      };
    }
    return { ok: true, tool: 'update_place', summary: `Updated ${args.name ?? existing.name}.` };
  }

  private async toolDeletePlace(tripId: string, args: { placeId: number }): Promise<ToolResult> {
    const existing = this.places.get(tripId, String(args.placeId));
    if (!existing) {
      return {
        ok: false,
        tool: 'delete_place',
        summary: `Place ${args.placeId} not found — skipped.`,
        error: 'Place not found',
      };
    }
    await this.places.remove(tripId, String(args.placeId));
    this.places.broadcast(tripId, 'place:deleted', { placeId: args.placeId }, undefined);
    return { ok: true, tool: 'delete_place', summary: `Removed ${existing.name}.` };
  }

  private toolAddNote(tripId: string, args: { dayId: number; text: string; time?: string }): ToolResult {
    const day = this.days.getDay(args.dayId, tripId);
    if (!day) {
      return { ok: false, tool: 'add_note', summary: `Day ${args.dayId} not found — skipped.`, error: 'Day not found' };
    }
    const note = this.dayNotes.create(args.dayId, tripId, args.text, args.time ?? null);
    this.dayNotes.broadcast(tripId, 'dayNote:created', { dayId: Number(args.dayId), note }, undefined);
    return { ok: true, tool: 'add_note', summary: `Added note to Day ${day.day_number}.` };
  }
}

/** The system prompt: role, tools, trip context, and ground rules. */
function buildSystemPrompt(tripContextJson: string): string {
  return [
    'You are Roamly AI, a trip-planning assistant inside the Roamly app. You help the user build and edit their trip itinerary.',
    '',
    'You have these tools: create_day, update_day, delete_day, add_place, update_place, delete_place, add_note. Call them to make changes; do not just describe changes.',
    'Rules:',
    '- Use day/place ids from the trip context below. Never invent ids.',
    '- Times are 24h HH:MM. Durations are in minutes.',
    '- When the user pastes a full itinerary, build it completely: create_day for each day (with date and title), then add_place for every stop with its time and duration, and add_note for logistics reminders. Match dates to the trip range when the text gives them.',
    '- For feasibility questions, reason from the times, order and notes in the context. Be honest about what you cannot verify (e.g. road conditions).',
    '- For pure questions, answer directly without calling tools.',
    '- Keep the final reply short: one or two sentences per change, then stop.',
    '',
    `Trip context (JSON):\n${tripContextJson}`,
  ].join('\n');
}

/** "09:30" → "9:30 AM" for human-readable action summaries. */
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Roamly AI chat service: the agent loop over the user's own LLM connection.
 *
 * The LLM client factory and the raw-fetch path are mocked; the trip services
 * are stubbed. Nothing here touches the network or a real database.
 */
import { AiChatService } from '../../../src/nest/ai-chat/ai-chat.service';
import type { AssignmentsService } from '../../../src/nest/assignments/assignments.service';
import type { DatabaseService } from '../../../src/nest/database/database.service';
import type { DayNotesService } from '../../../src/nest/day-notes/day-notes.service';
import type { DayRemovalService } from '../../../src/nest/days/day-removal.service';
import type { DaysService } from '../../../src/nest/days/days.service';
import { createLlmClient } from '../../../src/nest/llm-parse/llm-client.factory';
import type { LlmConfigResolver } from '../../../src/nest/llm-parse/llm-config.resolver';
import type { LlmExtractionClient } from '../../../src/nest/llm-parse/llm-provider.interface';
import type { PlacesService } from '../../../src/nest/places/places.service';
import { safeFetchLlm } from '../../../src/utils/ssrfGuard';
import { HttpException } from '@nestjs/common';
import { AI_CHAT_LLM_NOT_CONFIGURED, AI_CHAT_LLM_FAILED } from '@roamly/shared';

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/nest/llm-parse/llm-client.factory', () => ({
  createLlmClient: vi.fn(),
}));
vi.mock('../../../src/utils/ssrfGuard', () => ({
  safeFetchLlm: vi.fn(),
}));

const mockCreateLlmClient = vi.mocked(createLlmClient);
const mockSafeFetchLlm = vi.mocked(safeFetchLlm);

const CONFIG = { provider: 'openai', model: 'gpt-test', baseUrl: 'https://llm.test/v1', apiKey: 'k' };

function build(config: typeof CONFIG | null = CONFIG) {
  const configResolver = { resolve: vi.fn(() => config) } as unknown as LlmConfigResolver;
  const days = {
    list: vi.fn(() => ({ days: [] })),
    getDay: vi.fn((dayId: number) => ({ id: dayId, day_number: dayId, trip_id: 1 })),
  } as unknown as DaysService;
  const dayRemoval = {} as unknown as DayRemovalService;
  const places = {} as unknown as PlacesService;
  const assignments = {} as unknown as AssignmentsService;
  const dayNotes = {
    create: vi.fn((dayId: number, tripId: string, text: string) => ({ id: 7, day_id: dayId, trip_id: tripId, text })),
    broadcast: vi.fn(),
  } as unknown as DayNotesService & { create: ReturnType<typeof vi.fn>; broadcast: ReturnType<typeof vi.fn> };
  const db = {
    get: vi.fn((sql: string) => (sql.includes('trips') ? { title: 'T', start_date: null, end_date: null } : { n: 0 })),
  } as unknown as DatabaseService;
  const service = new AiChatService(configResolver, days, dayRemoval, places, assignments, dayNotes, db);
  return { service, configResolver, days, dayNotes, db };
}

function chatClient(impl: Partial<LlmExtractionClient>): LlmExtractionClient {
  return { extract: vi.fn(), ...impl } as unknown as LlmExtractionClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AiChatService.chat', () => {
  it('409s with llm_not_configured when the user has no LLM connection', async () => {
    const { service } = build(null);
    const err = await service.chat('1', 42, 'hello', []).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toEqual({ error: AI_CHAT_LLM_NOT_CONFIGURED });
    expect(mockCreateLlmClient).not.toHaveBeenCalled();
  });

  it('answers a pure question without mutating anything', async () => {
    const { service, dayNotes } = build();
    const client = chatClient({
      chat: vi.fn().mockResolvedValue({ content: 'Yes, the drive is feasible.', toolCalls: [] }),
    });
    mockCreateLlmClient.mockReturnValue(client);
    const res = await service.chat('1', 42, 'is the Oct 15 drive feasible?', []);
    expect(res.reply).toBe('Yes, the drive is feasible.');
    expect(res.actions).toEqual([]);
    expect(res.model).toBe('gpt-test');
    expect(dayNotes.create).not.toHaveBeenCalled();
  });

  it('runs the tool loop: executes add_note and surfaces the action', async () => {
    const { service, dayNotes } = build();
    const chat = vi
      .fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 't1', name: 'add_note', arguments: { dayId: 3, text: 'Permits ready', time: '17:00' } }],
      })
      .mockResolvedValueOnce({ content: 'Added your note to Day 3.', toolCalls: [] });
    mockCreateLlmClient.mockReturnValue(chatClient({ chat }));
    const res = await service.chat('1', 42, 'note on day 3 that permits are ready', []);
    expect(dayNotes.create).toHaveBeenCalledWith(3, '1', 'Permits ready', '17:00');
    expect(dayNotes.broadcast).toHaveBeenCalledWith('1', 'dayNote:created', expect.anything(), undefined);
    expect(res.actions).toHaveLength(1);
    expect(res.actions[0].tool).toBe('add_note');
    expect(res.actions[0].summary).toContain('Day 3');
    expect(res.reply).toBe('Added your note to Day 3.');
  });

  it('reports an unknown tool to the model instead of crashing', async () => {
    const { service } = build();
    const chat = vi
      .fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 't2', name: 'teleport', arguments: {} }],
      })
      .mockResolvedValueOnce({ content: 'I cannot do that.', toolCalls: [] });
    mockCreateLlmClient.mockReturnValue(chatClient({ chat }));
    const res = await service.chat('1', 42, 'teleport me', []);
    expect(res.actions).toHaveLength(1);
    expect(res.actions[0].summary).toContain('Unknown tool');
    // The error result is fed back so the model can recover.
    const toolResultsMsg = (chat.mock.calls[1][0].messages as { role: string; content: string }[]).find(
      (m) => m.role === 'user' && m.content.startsWith('Tool results:'),
    );
    expect(toolResultsMsg?.content).toContain('teleport');
    expect(res.reply).toBe('I cannot do that.');
  });

  it('falls back to strict JSON when the client has no chat() (no tool calling)', async () => {
    const { service, dayNotes } = build();
    mockCreateLlmClient.mockReturnValue(chatClient({}));
    mockSafeFetchLlm.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'Noted on Day 2.',
                  actions: [{ tool: 'add_note', args: { dayId: 2, text: 'Buy permits' } }],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const res = await service.chat('1', 42, 'remind me about permits on day 2', []);
    expect(dayNotes.create).toHaveBeenCalledWith(2, '1', 'Buy permits', null);
    expect(res.reply).toBe('Noted on Day 2.');
    expect(res.actions).toHaveLength(1);
  });

  it('502s with llm_request_failed when the model call throws', async () => {
    const { service } = build();
    const client = chatClient({ chat: vi.fn().mockRejectedValue(new Error('boom')) });
    mockCreateLlmClient.mockReturnValue(client);
    const err = await service.chat('1', 42, 'hello', []).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(502);
    expect(err.getResponse()).toEqual({ error: AI_CHAT_LLM_FAILED });
  });
});

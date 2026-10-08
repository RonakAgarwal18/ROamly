import { z } from 'zod';

/**
 * Roamly AI chat API contract — single source of truth for
 * POST /api/trips/:tripId/ai/chat.
 *
 * Trip-scoped, gated by the 'day_edit' permission (the chat can mutate days and
 * places). Served by the Nest AiChatController (server/src/nest/ai-chat/).
 *
 * The chat is an agentic loop: the server sends the user message plus a compact
 * trip context to the user's configured LLM (see Settings → LLM connection),
 * the model calls trip-mutating tools, the server executes them through the
 * existing DaysService/PlacesService, and the final reply plus a per-action
 * summary list come back for inline display ("Added Tsomgo Lake to Day 4").
 */

/** One turn of conversation history supplied by the client. */
export const aiChatHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(8000),
});
export type AiChatHistoryMessage = z.infer<typeof aiChatHistoryMessageSchema>;

export const aiChatRequestSchema = z.object({
  /** The user's new message: a question, an edit instruction, or a pasted itinerary. */
  message: z.string().min(1).max(4000),
  /** Prior turns, oldest first; the server prepends its own system prompt. */
  history: z.array(aiChatHistoryMessageSchema).max(20).default([]),
});
export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;

/** Tool names the model may invoke during the agentic loop. */
export const aiChatToolNames = [
  'create_day',
  'update_day',
  'delete_day',
  'add_place',
  'update_place',
  'delete_place',
  'add_note',
] as const;
export const aiChatToolNameSchema = z.enum(aiChatToolNames);
export type AiChatToolName = z.infer<typeof aiChatToolNameSchema>;

/** Arguments for create_day. */
export const createDayArgsSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
  title: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  position: z.number().int().min(1).optional(),
});
export type CreateDayArgs = z.infer<typeof createDayArgsSchema>;

/** Arguments for update_day. */
export const updateDayArgsSchema = z.object({
  dayId: z.number().int().positive(),
  title: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .nullable()
    .optional(),
});
export type UpdateDayArgs = z.infer<typeof updateDayArgsSchema>;

/** Arguments for delete_day. */
export const deleteDayArgsSchema = z.object({
  dayId: z.number().int().positive(),
});
export type DeleteDayArgs = z.infer<typeof deleteDayArgsSchema>;

/** Arguments for add_place. `dayId` refers to a day of this trip. */
export const addPlaceArgsSchema = z.object({
  dayId: z.number().int().positive(),
  name: z.string().min(1).max(300),
  /** Start time as HH:MM (24h). */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM')
    .optional(),
  durationMinutes: z.number().int().min(5).max(1440).optional(),
  note: z.string().max(2000).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  address: z.string().max(500).optional(),
});
export type AddPlaceArgs = z.infer<typeof addPlaceArgsSchema>;

/** Arguments for update_place. `dayId` moves the place to another day. */
export const updatePlaceArgsSchema = z.object({
  placeId: z.number().int().positive(),
  name: z.string().min(1).max(300).optional(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM')
    .nullable()
    .optional(),
  durationMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  dayId: z.number().int().positive().optional(),
});
export type UpdatePlaceArgs = z.infer<typeof updatePlaceArgsSchema>;

/** Arguments for delete_place. */
export const deletePlaceArgsSchema = z.object({
  placeId: z.number().int().positive(),
});
export type DeletePlaceArgs = z.infer<typeof deletePlaceArgsSchema>;

/** Arguments for add_note (a day note, e.g. "REUNION at Namchi Central Park"). */
export const addNoteArgsSchema = z.object({
  dayId: z.number().int().positive(),
  text: z.string().min(1).max(2000),
  time: z.string().max(200).optional(),
});
export type AddNoteArgs = z.infer<typeof addNoteArgsSchema>;

/** Maps each tool name to its argument schema for server-side validation. */
export const aiChatToolArgsSchemas = {
  create_day: createDayArgsSchema,
  update_day: updateDayArgsSchema,
  delete_day: deleteDayArgsSchema,
  add_place: addPlaceArgsSchema,
  update_place: updatePlaceArgsSchema,
  delete_place: deletePlaceArgsSchema,
  add_note: addNoteArgsSchema,
} as const;

/** One tool call the agent executed, rendered inline in the chat. */
export const aiChatActionSchema = z.object({
  tool: aiChatToolNameSchema,
  /** Human-readable one-liner, e.g. "Added Tsomgo Lake to Day 4 · 9:30–10:30". */
  summary: z.string(),
});
export type AiChatAction = z.infer<typeof aiChatActionSchema>;

export const aiChatResponseSchema = z.object({
  /** The assistant's final reply text. */
  reply: z.string(),
  /** Tool calls executed, in order, for inline display. */
  actions: z.array(aiChatActionSchema),
  /** Model that answered, for the "powered by" hint. */
  model: z.string(),
});
export type AiChatResponse = z.infer<typeof aiChatResponseSchema>;

/** Bespoke error code when no LLM connection is configured (HTTP 409). */
export const AI_CHAT_LLM_NOT_CONFIGURED = 'llm_not_configured';
/** Bespoke error code when the model call fails after retries (HTTP 502). */
export const AI_CHAT_LLM_FAILED = 'llm_request_failed';

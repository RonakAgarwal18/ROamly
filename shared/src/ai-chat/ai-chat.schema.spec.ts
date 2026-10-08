import { aiChatRequestSchema, aiChatResponseSchema, aiChatToolArgsSchemas, addPlaceArgsSchema } from './ai-chat.schema';

import { describe, it, expect } from 'vitest';

describe('aiChatRequestSchema', () => {
  it('accepts a message with empty history default', () => {
    const parsed = aiChatRequestSchema.parse({ message: 'add a day in Pelling' });
    expect(parsed.history).toEqual([]);
  });

  it('rejects an empty message', () => {
    expect(() => aiChatRequestSchema.parse({ message: '' })).toThrow();
  });

  it('caps history at 20 turns', () => {
    const history = Array.from({ length: 21 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: 'hi',
    }));
    expect(() => aiChatRequestSchema.parse({ message: 'hi', history })).toThrow();
  });
});

describe('aiChatToolArgsSchemas', () => {
  it('validates add_place time as HH:MM', () => {
    expect(addPlaceArgsSchema.safeParse({ dayId: 1, name: 'X', time: '9:30' }).success).toBe(false);
    expect(addPlaceArgsSchema.safeParse({ dayId: 1, name: 'X', time: '09:30' }).success).toBe(true);
  });

  it('validates create_day date as YYYY-MM-DD', () => {
    expect(aiChatToolArgsSchemas.create_day.safeParse({ date: '11-10-2026' }).success).toBe(false);
    expect(aiChatToolArgsSchemas.create_day.safeParse({ date: '2026-10-11' }).success).toBe(true);
  });

  it('rejects unknown tool names', () => {
    expect('book_flight' in aiChatToolArgsSchemas).toBe(false);
  });
});

describe('aiChatResponseSchema', () => {
  it('accepts a reply with actions', () => {
    const parsed = aiChatResponseSchema.parse({
      reply: 'Done.',
      actions: [{ tool: 'add_place', summary: 'Added X to Day 1' }],
      model: 'test-model',
    });
    expect(parsed.actions).toHaveLength(1);
  });
});

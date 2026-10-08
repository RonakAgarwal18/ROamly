import type { LlmChatTool } from '../llm-parse/llm-provider.interface';

/**
 * The tool set Roamly AI may call. Each tool maps 1:1 to a Zod argument schema
 * in @roamly/shared (aiChatToolArgsSchemas) — the server re-validates every call
 * against those before executing, so the JSON Schema here is only the model's
 * view of the same contract.
 */
export const AI_CHAT_TOOLS: LlmChatTool[] = [
  {
    name: 'create_day',
    description:
      'Create a new day on the trip. Appends at the end unless position is given (1-based). Returns the new day with its id and day number.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Calendar date as YYYY-MM-DD.' },
        title: { type: 'string', description: 'Short day title, e.g. "Scooty Run 1".' },
        notes: { type: 'string', description: 'Free-text notes for the day.' },
        position: { type: 'integer', description: '1-based position to insert at; omit to append.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'update_day',
    description: 'Rename a day, change its notes, or change its date. Use the day id from the trip context.',
    parameters: {
      type: 'object',
      properties: {
        dayId: { type: 'integer', description: 'The day id from the trip context.' },
        title: { type: 'string', description: 'New title (null to clear).' },
        notes: { type: 'string', description: 'New notes (null to clear).' },
        date: { type: 'string', description: 'New date as YYYY-MM-DD (null to clear).' },
      },
      required: ['dayId'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_day',
    description: 'Delete a day and everything on it. Cannot delete the last remaining day.',
    parameters: {
      type: 'object',
      properties: {
        dayId: { type: 'integer', description: 'The day id from the trip context.' },
      },
      required: ['dayId'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_place',
    description: 'Add a place (attraction, restaurant, hotel, viewpoint, drive stop) to a day. Times are 24h HH:MM.',
    parameters: {
      type: 'object',
      properties: {
        dayId: { type: 'integer', description: 'The day id from the trip context.' },
        name: { type: 'string', description: 'Place name, e.g. "Tsomgo Lake".' },
        time: { type: 'string', description: 'Start time as HH:MM (24h), e.g. "09:30".' },
        durationMinutes: { type: 'integer', description: 'How long the visit lasts, in minutes.' },
        note: { type: 'string', description: 'Short note shown with the place (altitude, tips, cost).' },
        lat: { type: 'number', description: 'Latitude, when known.' },
        lng: { type: 'number', description: 'Longitude, when known.' },
        address: { type: 'string', description: 'Address, when known.' },
      },
      required: ['dayId', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_place',
    description: 'Edit a place: rename it, change its time/duration/note, or move it to another day via dayId.',
    parameters: {
      type: 'object',
      properties: {
        placeId: { type: 'integer', description: 'The place id from the trip context.' },
        name: { type: 'string', description: 'New name.' },
        time: { type: 'string', description: 'New start time as HH:MM (24h); null to clear.' },
        durationMinutes: { type: 'integer', description: 'New duration in minutes; null to clear.' },
        note: { type: 'string', description: 'New note; null to clear.' },
        dayId: { type: 'integer', description: 'Move the place to this day id.' },
      },
      required: ['placeId'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_place',
    description: 'Remove a place from the trip entirely.',
    parameters: {
      type: 'object',
      properties: {
        placeId: { type: 'integer', description: 'The place id from the trip context.' },
      },
      required: ['placeId'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_note',
    description: 'Add a free-text note to a day (logistics reminders, reunion points, warnings).',
    parameters: {
      type: 'object',
      properties: {
        dayId: { type: 'integer', description: 'The day id from the trip context.' },
        text: { type: 'string', description: 'The note text.' },
        time: { type: 'string', description: 'Optional time label, e.g. "12:00 PM".' },
      },
      required: ['dayId', 'text'],
      additionalProperties: false,
    },
  },
];

import { aiChatRequestSchema } from '@roamly/shared';

import { createZodDto } from 'nestjs-zod';

/**
 * Server-side createZodDto wrapper over the @roamly/shared Roamly AI chat
 * contract. The global ZodValidationPipe validates the @Body() by metatype —
 * the Zod schema in shared/ remains the single source of truth.
 */
export class AiChatRequestDto extends createZodDto(aiChatRequestSchema) {}

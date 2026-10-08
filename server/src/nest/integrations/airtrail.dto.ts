/**
 * Server-side createZodDto wrappers over the @roamly/shared AirTrail contracts,
 * so the global ZodValidationPipe (APP_PIPE) validates bodies by metatype —
 * the shared Zod schemas stay the single source of truth.
 */
import { createZodDto } from 'nestjs-zod';
import { airtrailImportSchema, airtrailSettingsSchema } from '@roamly/shared';

export class AirtrailSettingsDto extends createZodDto(airtrailSettingsSchema) {}
export class AirtrailImportDto extends createZodDto(airtrailImportSchema) {}

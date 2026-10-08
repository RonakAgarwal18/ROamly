import { createZodDto } from 'nestjs-zod';
import { mapsPlaceEnrichmentRequestSchema } from '@roamly/shared';

/**
 * Server-side createZodDto wrapper over the @roamly/shared enrichment contract.
 * The global ZodValidationPipe validates the body by metatype — the Zod schema
 * in shared/ stays the single source of truth for the wire contract.
 */
export class PlaceEnrichmentDto extends createZodDto(mapsPlaceEnrichmentRequestSchema) {}

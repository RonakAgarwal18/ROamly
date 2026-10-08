import { createZodDto } from 'nestjs-zod';
import { placeShadowPickRequestSchema } from '@roamly/shared';

/**
 * Zod-pipe wrapper for the shadow log body. Same pattern as every other write
 * endpoint: the contract lives in @roamly/shared, the class exists so a
 * controller parameter can be typed with it.
 */
export class PlaceShadowPickDto extends createZodDto(placeShadowPickRequestSchema) {}

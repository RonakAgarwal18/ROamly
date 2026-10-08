import { createZodDto } from 'nestjs-zod';
import { routeUsageReportRequestSchema } from '@roamly/shared';

/**
 * Zod-pipe wrapper for a batch of counters. Same pattern as every other write
 * endpoint: the contract lives in @roamly/shared, the class exists so a controller
 * parameter can be typed with it.
 */
export class RouteUsageReportDto extends createZodDto(routeUsageReportRequestSchema) {}

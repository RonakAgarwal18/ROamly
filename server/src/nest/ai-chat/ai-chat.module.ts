import { AssignmentsDomainModule } from '../assignments/assignments-domain.module';
import { DayNotesModule } from '../day-notes/day-notes.module';
import { DaysModule } from '../days/days.module';
import { LlmParseModule } from '../llm-parse/llm-parse.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PlacesModule } from '../places/places.module';
import { AiChatController } from './ai-chat.controller';
import { AiChatService } from './ai-chat.service';
import { Module } from '@nestjs/common';

/**
 * Roamly AI chat domain, mounted at /api/trips/:tripId/ai.
 *
 * A leaf module: it consumes DaysService, PlacesService, DayNotesService,
 * AssignmentsService and LlmConfigResolver but nothing imports it, so no
 * module cycle can close through it. DayRemovalService is imported via
 * DaysModule (exported for this consumer).
 */
@Module({
  imports: [DaysModule, PlacesModule, DayNotesModule, AssignmentsDomainModule, LlmParseModule, PermissionsModule],
  controllers: [AiChatController],
  providers: [AiChatService],
})
export class AiChatModule {}

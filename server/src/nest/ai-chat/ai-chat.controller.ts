import type { User } from '../../types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission, TripAccessGuard } from '../permissions/trip-access.guard';
import { AiChatRequestDto } from './ai-chat.dto';
import { AiChatService } from './ai-chat.service';
import { Body, Controller, HttpCode, Post, Param, UseGuards } from '@nestjs/common';

/**
 * POST /api/trips/:tripId/ai/chat — Roamly AI agentic trip chat.
 *
 * Trip access (404 "Trip not found") plus the 'day_edit' permission (403): the
 * chat can mutate days and places, so read-only collaborators cannot use it.
 * Answers 200 with { reply, actions, model }; 409 { error: 'llm_not_configured' }
 * when no LLM connection is configured; 502 { error: 'llm_request_failed' }
 * when the model call fails.
 */
@Controller('api/trips/:tripId/ai')
@UseGuards(JwtAuthGuard, TripAccessGuard)
export class AiChatController {
  constructor(private readonly aiChat: AiChatService) {}

  @RequirePermission('day_edit')
  @Post('chat')
  @HttpCode(200)
  chat(@CurrentUser() user: User, @Param('tripId') tripId: string, @Body() body: AiChatRequestDto) {
    return this.aiChat.chat(tripId, user.id, body.message, body.history ?? []);
  }
}

import type { AiChatAction, AiChatHistoryMessage } from '@roamly/shared';
import { AI_CHAT_LLM_NOT_CONFIGURED } from '@roamly/shared';
import { useCallback, useRef, useState } from 'react';
import { aiChatApi } from '../../api/client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: AiChatAction[];
}

/**
 * Roamly AI chat state machine. Messages live here; the widget is purely
 * presentational. History sent to the server is capped so a long session can't
 * blow past the model's context.
 */
export function useAiChat(tripId: string | number) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const sendingRef = useRef(false);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sendingRef.current) return;
      sendingRef.current = true;
      setLoading(true);
      setNotConfigured(false);
      setFailed(null);
      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      try {
        const history: AiChatHistoryMessage[] = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
        const res = await aiChatApi.chat(tripId, { message: trimmed, history });
        setMessages((prev) => [...prev, { role: 'assistant', content: res.reply, actions: res.actions }]);
      } catch (err) {
        const status = (err as { response?: { status?: number; data?: { error?: string } } })?.response;
        if (status?.status === 409 && status?.data?.error === AI_CHAT_LLM_NOT_CONFIGURED) {
          setNotConfigured(true);
        } else {
          setFailed(trimmed);
        }
        // Roll the failed user message back off so a retry doesn't duplicate it.
        setMessages((prev) => prev.filter((m) => m !== userMsg));
      } finally {
        setLoading(false);
        sendingRef.current = false;
      }
    },
    [tripId, messages]
  );

  const retry = useCallback(() => {
    if (failed) void send(failed);
  }, [failed, send]);

  const dismissError = useCallback(() => setFailed(null), []);

  return { messages, input, setInput, send, retry, dismissError, loading, notConfigured, failed };
}

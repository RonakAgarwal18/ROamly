import { Check, Send, Settings, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from '../../i18n';
import { useAiChat, type ChatMessage } from './useAiChat';

/**
 * Roamly AI floating chat. Rendered on trip pages (desktop + mobile shells
 * share this one component); the hook owns all state so the shells only mount
 * markup. Hidden when the viewer lacks day-edit rights — the endpoint would
 * 403 anyway, so the button never promises what it can't do.
 */
export function AiChatWidget({ tripId, canEdit }: { tripId: string | number; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  if (!canEdit) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('aiChat.title')}
        title={t('aiChat.title')}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-text shadow-lg transition-transform hover:scale-105"
      >
        {open ? <X size={24} /> : <Sparkles size={24} />}
      </button>
      {open && <AiChatPanel tripId={tripId} onClose={() => setOpen(false)} />}
    </>
  );
}

function AiChatPanel({ tripId, onClose }: { tripId: string | number; onClose: () => void }) {
  const { t } = useTranslation();
  const { messages, input, setInput, send, retry, dismissError, loading, notConfigured, failed } = useAiChat(tripId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => void send(input);

  return (
    <div
      role="dialog"
      aria-label={t('aiChat.title')}
      className="fixed bottom-24 right-5 z-50 flex h-[540px] max-h-[72vh] w-[384px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-edge bg-surface-elevated shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-edge px-4 py-3">
        <Sparkles size={18} className="text-accent" />
        <span className="text-sm font-semibold text-content">{t('aiChat.title')}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="ml-auto rounded-full p-1 text-content-faint hover:bg-surface-tertiary"
        >
          <X size={18} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {notConfigured ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Sparkles size={32} className="text-content-faint" />
            <p className="text-sm font-semibold text-content">{t('aiChat.notConfiguredTitle')}</p>
            <p className="text-[13px] text-content-faint">{t('aiChat.notConfiguredBody')}</p>
            <Link
              to="/settings"
              className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-text"
            >
              <Settings size={15} />
              {t('aiChat.openSettings')}
            </Link>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Sparkles size={32} className="text-accent" />
            <p className="text-sm font-semibold text-content">{t('aiChat.emptyTitle')}</p>
            <p className="text-[13px] leading-relaxed text-content-faint">{t('aiChat.emptyBody')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}
            {loading && (
              <div className="flex items-center gap-2 self-start rounded-2xl bg-surface-secondary px-3 py-2">
                <span className="text-[13px] text-content-faint">{t('aiChat.thinking')}</span>
                <ThinkingDots />
              </div>
            )}
            {failed && (
              <div className="flex items-center gap-2 self-start rounded-2xl border border-edge bg-surface-secondary px-3 py-2">
                <span className="text-[13px] text-content">{t('aiChat.errorBody')}</span>
                <button
                  type="button"
                  onClick={retry}
                  className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-text"
                >
                  {t('aiChat.retry')}
                </button>
                <button
                  type="button"
                  onClick={dismissError}
                  aria-label={t('common.close')}
                  className="shrink-0 rounded-full p-1 text-content-faint hover:bg-surface-tertiary"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {!notConfigured && (
        <div className="border-t border-edge p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder={t('aiChat.placeholder')}
              disabled={loading}
              className="max-h-28 flex-1 resize-none rounded-xl border border-edge bg-surface px-3 py-2 text-[13px] text-content placeholder:text-content-faint focus:outline-none"
            />
            <button
              type="button"
              onClick={submit}
              disabled={loading || !input.trim()}
              aria-label={t('aiChat.send')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-text disabled:opacity-40"
            >
              <Send size={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
          isUser ? 'bg-accent text-accent-text' : 'bg-surface-secondary text-content'
        }`}
      >
        {message.content}
      </div>
      {message.actions?.map((a, i) => (
        <div
          key={i}
          className="flex max-w-[85%] items-start gap-1.5 rounded-xl border border-edge bg-surface px-2.5 py-1.5"
        >
          <Check size={13} className="mt-0.5 shrink-0 text-accent" />
          <span className="text-xs text-content-faint">{a.summary}</span>
        </div>
      ))}
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="flex gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-content-faint"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

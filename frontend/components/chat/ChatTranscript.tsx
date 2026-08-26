'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/format';
import type { AvailabilitySummary, ChatMessage } from '@/types/api';

/**
 * Reads the availability list off a turn's structured output.
 *
 * `structured` is free-form JSON from the database, so it is narrowed rather
 * than cast — a turn without a list, or one written before this existed, has
 * to fall back to the plain text rather than throw.
 */
function availabilityOf(structured: unknown): AvailabilitySummary[] | null {
  if (typeof structured !== 'object' || structured === null) return null;
  const list = (structured as { availability?: unknown }).availability;
  if (!Array.isArray(list) || list.length === 0) return null;

  const isSummary = (item: unknown): item is AvailabilitySummary =>
    typeof item === 'object' &&
    item !== null &&
    typeof (item as AvailabilitySummary).name === 'string' &&
    Array.isArray((item as AvailabilitySummary).hours);

  return list.every(isSummary) ? list : null;
}

function AvailabilityList({ services }: { services: AvailabilitySummary[] }) {
  return (
    <ul className="mt-3 space-y-3">
      {services.map((service) => (
        <li key={service.name}>
          <div className="flex items-baseline gap-2">
            <h3 className="text-[13px] font-semibold text-ink">{service.name}</h3>
            <span className="text-[11px] text-ink-3">{service.defaultDurationMinutes} min</span>
          </div>
          {service.hours.length === 0 ? (
            <p className="text-[13px] text-ink-3">No opening hours set</p>
          ) : (
            <ul className="mt-0.5 space-y-0.5">
              {service.hours.map((line) => (
                <li key={line} className="flex gap-2 text-[13px] text-ink-2">
                  {/* Split so the days column lines up down the list. */}
                  <span className="w-[52px] shrink-0 tabular-nums">{line.split(' ')[0]}</span>
                  <span>{line.slice(line.indexOf(' ') + 1)}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'USER';
  const availability = isUser ? null : availabilityOf(message.structured);
  // When there is a list to render, the stored text already contains it — show
  // only the model's lead-in sentence above the laid-out version.
  const text = availability ? message.content.split('\n\n')[0] : message.content;

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'rounded-br-md bg-navy text-white'
            : 'rounded-bl-md border border-line bg-surface text-ink shadow-card',
        )}
      >
        {/* Server-written replies list opening hours across several lines. */}
        <span className="whitespace-pre-line">{text}</span>
        {availability && <AvailabilityList services={availability} />}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-3">
        <span className="dot-1 h-1.5 w-1.5 rounded-full bg-ink-3" />
        <span className="dot-2 h-1.5 w-1.5 rounded-full bg-ink-3" />
        <span className="dot-3 h-1.5 w-1.5 rounded-full bg-ink-3" />
        <span className="sr-only">The assistant is replying</span>
      </div>
    </div>
  );
}

export function ChatTranscript({
  messages,
  isSending,
}: {
  messages: ChatMessage[];
  isSending: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows, including while the reply is pending.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isSending]);

  // Paper behind the transcript so the assistant's white bubbles read as
  // bubbles instead of dissolving into the card.
  return (
    <div
      className="flex-1 space-y-3 overflow-y-auto bg-paper px-4 py-4"
      role="log"
      aria-live="polite"
      aria-label="Conversation with the booking assistant"
    >
      {messages.map((message) => (
        <Bubble key={message.id} message={message} />
      ))}
      {isSending && <TypingIndicator />}
      <div ref={endRef} />
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/format';
import type { ChatMessage } from '@/types/api';

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'USER';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'rounded-br-md bg-accent text-white'
            : 'rounded-bl-md border border-line bg-surface text-ink',
        )}
      >
        {message.content}
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

  return (
    <div
      className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
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

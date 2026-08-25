'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button, Textarea } from '@/components/ui';

const MAX_LENGTH = 2000;

export function ChatComposer({
  onSend,
  disabled,
  isSending,
  placeholder = 'Tell me what you want to book…',
}: {
  onSend: (content: string) => void;
  disabled: boolean;
  isSending: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState('');
  const canSend = value.trim().length > 0 && !disabled && !isSending;

  function submit() {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  // Enter sends, Shift+Enter starts a new line — the convention people expect
  // from a chat box rather than a textarea.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-line bg-surface p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Message the booking assistant"
          className="max-h-32 min-h-10 resize-none"
        />
        <Button type="submit" disabled={!canSend} loading={isSending}>
          Send
        </Button>
      </div>
    </form>
  );
}

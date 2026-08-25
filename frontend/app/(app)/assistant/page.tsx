'use client';

import Link from 'next/link';
import { Alert, Button, Card, Spinner } from '@/components/ui';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatTranscript } from '@/components/chat/ChatTranscript';
import { DraftPanel } from '@/components/chat/DraftPanel';
import { useChat } from '@/hooks/useChat';

const MANUAL_FALLBACK_CTA = (
  <Link href="/book">
    <Button variant="secondary" size="sm">
      Continue with manual booking
    </Button>
  </Link>
);

export default function AssistantPage() {
  const chat = useChat();

  const conversationClosed = Boolean(chat.bookedAppointment);
  const aiDown = !chat.aiAvailable;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard" className="text-[13px] text-ink-3 hover:text-ink">
          ← Dashboard
        </Link>
        <h1 className="mt-3 font-display text-[32px] leading-tight text-ink">AI assistant</h1>
        <p className="mt-1 text-sm text-ink-2">
          Describe the appointment you want. Nothing is booked until you confirm it.
        </p>
      </div>

      {aiDown && (
        <Alert tone="error" title="AI booking is temporarily unavailable" action={MANUAL_FALLBACK_CTA}>
          The assistant can&apos;t be reached right now. The manual form works as usual.
        </Alert>
      )}

      {!aiDown && chat.suggestManual && !conversationClosed && (
        <Alert tone="info" title="Not getting anywhere?" action={MANUAL_FALLBACK_CTA}>
          The assistant still needs more detail. The form may be quicker.
        </Alert>
      )}

      {chat.error && !aiDown && <Alert tone="error">{chat.error}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Card className="flex h-[520px] flex-col overflow-hidden">
          {chat.isStarting ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner className="text-ink-3" />
              <span className="sr-only">Starting the conversation</span>
            </div>
          ) : (
            <>
              <ChatTranscript messages={chat.messages} isSending={chat.isSending} />
              <ChatComposer
                onSend={chat.send}
                disabled={aiDown || conversationClosed || !chat.sessionId}
                isSending={chat.isSending}
                placeholder={
                  conversationClosed
                    ? 'This booking is done — start another from the panel.'
                    : aiDown
                      ? 'The assistant is unavailable right now.'
                      : 'Tell me what you want to book…'
                }
              />
            </>
          )}
        </Card>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <DraftPanel
            draft={chat.draft}
            missingFields={chat.missingFields}
            readyToConfirm={chat.readyToConfirm}
            isConfirming={chat.isConfirming}
            bookedAppointment={chat.bookedAppointment}
            onConfirm={chat.confirm}
            onRestart={chat.restart}
          />
        </aside>
      </div>
    </div>
  );
}

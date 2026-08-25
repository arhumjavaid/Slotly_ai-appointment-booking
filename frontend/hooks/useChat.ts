'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, errorMessage } from '@/lib/api';
import { chatService } from '@/services/chat';
import { APPOINTMENTS_KEY } from '@/hooks/useAppointments';
import type { Appointment, BookingDraft, ChatMessage } from '@/types/api';

interface ChatState {
  sessionId: string | null;
  messages: ChatMessage[];
  draft: BookingDraft | null;
  missingFields: string[];
  readyToConfirm: boolean;
  suggestManual: boolean;
  aiAvailable: boolean;
  bookedAppointment: Appointment | null;
}

const INITIAL_STATE: ChatState = {
  sessionId: null,
  messages: [],
  draft: null,
  missingFields: [],
  readyToConfirm: false,
  suggestManual: false,
  aiAvailable: true,
  bookedAppointment: null,
};

/**
 * Conversation state for the assistant screen.
 *
 * The transcript is kept locally and appended to as turns complete, so the
 * screen never flickers back to a refetched list mid-conversation. Everything
 * that matters — the draft, what is still missing, whether it can be confirmed
 * — comes from the server on every turn, because the server owns it.
 */
export function useChat() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ChatState>(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const startSession = useMutation({
    mutationFn: () => chatService.createSession(),
    onSuccess: ({ session }) => {
      setState({
        ...INITIAL_STATE,
        sessionId: session.id,
        messages: session.messages,
        draft: session.draft,
        missingFields: session.missingFields,
        aiAvailable: session.aiAvailable,
      });
      setError(null);
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  // One session per visit to the screen.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startSession.mutate();
  }, [startSession]);

  const sendMessage = useMutation({
    mutationFn: ({ sessionId, content }: { sessionId: string; content: string }) =>
      chatService.sendMessage(sessionId, content),
    onSuccess: (result) => {
      setState((previous) => ({
        ...previous,
        messages: [...previous.messages, result.message],
        draft: result.draft,
        missingFields: result.missingFields,
        readyToConfirm: result.readyToConfirm,
        suggestManual: result.suggestManual,
        aiAvailable: result.aiAvailable,
        bookedAppointment: result.appointment ?? previous.bookedAppointment,
      }));
      if (result.appointment) {
        void queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
      }
      setError(null);
    },
    onError: (mutationError) => {
      setError(errorMessage(mutationError));
      if (mutationError instanceof ApiError && mutationError.isAiFailure) {
        setState((previous) => ({ ...previous, suggestManual: true, aiAvailable: false }));
      }
    },
  });

  const confirmBooking = useMutation({
    mutationFn: (sessionId: string) => chatService.confirm(sessionId),
    onSuccess: ({ appointment }) => {
      setState((previous) => ({
        ...previous,
        bookedAppointment: appointment,
        readyToConfirm: false,
      }));
      void queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
      setError(null);
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const send = useCallback(
    (content: string) => {
      if (!state.sessionId || sendMessage.isPending) return;

      // Show the user's own words immediately; the id is replaced when the
      // turn completes and the persisted transcript comes back.
      const optimistic: ChatMessage = {
        id: `pending-${Date.now()}`,
        role: 'USER',
        content,
        createdAt: new Date().toISOString(),
        structured: null,
      };
      setState((previous) => ({ ...previous, messages: [...previous.messages, optimistic] }));
      sendMessage.mutate({ sessionId: state.sessionId, content });
    },
    [sendMessage, state.sessionId],
  );

  const confirm = useCallback(() => {
    if (state.sessionId) confirmBooking.mutate(state.sessionId);
  }, [confirmBooking, state.sessionId]);

  const restart = useCallback(() => {
    setState(INITIAL_STATE);
    setError(null);
    startSession.mutate();
  }, [startSession]);

  return {
    ...state,
    error,
    isStarting: startSession.isPending,
    isSending: sendMessage.isPending,
    isConfirming: confirmBooking.isPending,
    send,
    confirm,
    restart,
  };
}

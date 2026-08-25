import { apiRequest, browserTimezone } from '@/lib/api';
import type { Appointment, ChatSession, ChatTurnResult } from '@/types/api';

export const chatService = {
  createSession() {
    return apiRequest<{ session: ChatSession }>('/chat/sessions', {
      method: 'POST',
      body: { timezone: browserTimezone() },
    });
  },

  getSession(id: string) {
    return apiRequest<{ session: ChatSession }>(`/chat/sessions/${id}`);
  },

  sendMessage(sessionId: string, content: string) {
    return apiRequest<ChatTurnResult>(`/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: { content, timezone: browserTimezone() },
    });
  },

  confirm(sessionId: string) {
    return apiRequest<{ appointment: Appointment }>(`/chat/sessions/${sessionId}/confirm`, {
      method: 'POST',
      body: { timezone: browserTimezone() },
    });
  },
};

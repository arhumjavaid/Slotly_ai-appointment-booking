import { apiRequest } from '@/lib/api';
import type { User } from '@/types/api';

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export const authService = {
  register(payload: RegisterPayload) {
    return apiRequest<{ user: User }>('/auth/register', { method: 'POST', body: payload });
  },

  login(payload: LoginPayload) {
    return apiRequest<{ user: User }>('/auth/login', { method: 'POST', body: payload });
  },

  me() {
    return apiRequest<{ user: User }>('/auth/me');
  },

  logout() {
    return apiRequest<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' });
  },
};

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

/** Email is absent by design — it is fixed at registration. */
export interface UpdateProfilePayload {
  name?: string;
  defaultDurationMinutes?: number;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
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

  updateProfile(payload: UpdateProfilePayload) {
    return apiRequest<{ user: User }>('/auth/me', { method: 'PATCH', body: payload });
  },

  changePassword(payload: ChangePasswordPayload) {
    return apiRequest<{ user: User }>('/auth/change-password', { method: 'POST', body: payload });
  },

  deleteAccount(password: string) {
    return apiRequest<{ deleted: boolean }>('/auth/me', {
      method: 'DELETE',
      body: { password },
    });
  },

  logout() {
    return apiRequest<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' });
  },
};

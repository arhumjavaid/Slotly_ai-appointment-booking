import { apiRequest, browserTimezone } from '@/lib/api';
import type {
  Appointment,
  AppointmentListResult,
  CreateAppointmentPayload,
  UpdateAppointmentPayload,
} from '@/types/api';

export interface AppointmentFilters {
  status?: string;
  scope?: 'all' | 'upcoming' | 'past';
  limit?: number;
}

function toQuery(filters: AppointmentFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.scope) params.set('scope', filters.scope);
  if (filters.limit) params.set('limit', String(filters.limit));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const appointmentService = {
  list(filters: AppointmentFilters = {}) {
    return apiRequest<AppointmentListResult>(`/appointments${toQuery(filters)}`);
  },

  getById(id: string) {
    return apiRequest<{ appointment: Appointment }>(`/appointments/${id}`);
  },

  create(payload: CreateAppointmentPayload) {
    return apiRequest<{ appointment: Appointment }>('/appointments', {
      method: 'POST',
      body: { timezone: browserTimezone(), ...payload },
    });
  },

  update(id: string, payload: UpdateAppointmentPayload) {
    return apiRequest<{ appointment: Appointment }>(`/appointments/${id}`, {
      method: 'PATCH',
      body: payload,
    });
  },

  cancel(id: string) {
    return apiRequest<{ appointment: Appointment }>(`/appointments/${id}`, {
      method: 'PATCH',
      body: { status: 'CANCELLED' },
    });
  },

  remove(id: string) {
    return apiRequest<void>(`/appointments/${id}`, { method: 'DELETE' });
  },
};

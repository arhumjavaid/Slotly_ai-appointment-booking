/** Mirrors the backend's public response contracts. */

export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
export type AppointmentSource = 'MANUAL' | 'AI';

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  /** Booking preferences, applied when a request does not state its own. */
  timezone: string;
  defaultDurationMinutes: number;
}

export interface Appointment {
  id: string;
  appointmentType: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  timezone: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
  status: AppointmentStatus;
  source: AppointmentSource;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
}

export interface AppointmentListResult {
  appointments: Appointment[];
  pagination: Pagination;
}

export interface CreateAppointmentPayload {
  appointmentType: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  notes?: string | null;
  timezone?: string;
}

export type UpdateAppointmentPayload = Partial<CreateAppointmentPayload> & {
  status?: AppointmentStatus;
};

export interface ChatMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  structured: unknown;
}

export interface BookingDraft {
  appointmentType: string | null;
  date: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  notes: string | null;
  timezone: string;
}

export interface ChatSession {
  id: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  createdAt: string;
  messages: ChatMessage[];
  draft: BookingDraft;
  missingFields: string[];
  readyToConfirm: boolean;
  aiAvailable: boolean;
}

export interface ChatTurnResult {
  message: ChatMessage;
  draft: BookingDraft;
  missingFields: string[];
  readyToConfirm: boolean;
  suggestManual: boolean;
  aiAvailable: boolean;
  appointment: Appointment | null;
  sessionStatus: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
}

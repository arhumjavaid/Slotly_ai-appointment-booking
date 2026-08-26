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

/** One service's hours as the assistant reports them. */
export interface AvailabilitySummary {
  name: string;
  defaultDurationMinutes: number;
  /** One entry per run of days: "Mon-Fri 09:00-12:00 and 14:00-18:00". */
  hours: string[];
}

export interface ChatMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  /**
   * The turn's validated model output, plus anything the server attached.
   * `unknown` because it is stored as free-form JSON — read it through a
   * narrowing helper rather than casting.
   */
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

export interface AvailabilityWindow {
  startTime: string;
  endTime: string;
}

export interface DayAvailability {
  weekday: number;
  /** Empty means closed that day. */
  windows: AvailabilityWindow[];
}

export interface ServiceType {
  id: string;
  name: string;
  slug: string;
  defaultDurationMinutes: number;
  /** Always seven entries, Sunday first. */
  days: DayAvailability[];
}

/** Stable, client-facing error codes. The frontend maps these to copy. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  APPOINTMENT_CONFLICT: 'APPOINTMENT_CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  AI_INVALID_OUTPUT: 'AI_INVALID_OUTPUT',
  DRAFT_INCOMPLETE: 'DRAFT_INCOMPLETE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorDetail {
  field: string;
  message: string;
}

/**
 * Application error carrying an HTTP status and a stable code.
 *
 * Anything thrown that is *not* an ApiError is treated as unexpected by the
 * global error handler and reported to the client as a generic 500.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCodeValue;
  readonly details?: ApiErrorDetail[];

  constructor(status: number, code: ErrorCodeValue, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message: string, details?: ApiErrorDetail[]) {
    return new ApiError(400, ErrorCode.VALIDATION_ERROR, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, ErrorCode.UNAUTHORIZED, message);
  }

  static invalidCredentials(message = 'Invalid email or password') {
    return new ApiError(401, ErrorCode.INVALID_CREDENTIALS, message);
  }

  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(403, ErrorCode.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, ErrorCode.NOT_FOUND, message);
  }

  static conflict(code: ErrorCodeValue, message: string) {
    return new ApiError(409, code, message);
  }

  static aiUnavailable(message = 'AI booking is temporarily unavailable') {
    return new ApiError(503, ErrorCode.AI_UNAVAILABLE, message);
  }

  static internal(message = 'Something went wrong') {
    return new ApiError(500, ErrorCode.INTERNAL_ERROR, message);
  }
}

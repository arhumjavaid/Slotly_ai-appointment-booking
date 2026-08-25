import { z } from 'zod';
import { isValidDateString, isValidTimeString, isValidTimezone } from '../utils/time';

export const uuidSchema = z.string().uuid('Must be a valid identifier');

export const idParamSchema = z.object({ id: uuidSchema });

export const dateStringSchema = z
  .string()
  .refine(isValidDateString, 'Date must be a valid calendar date in YYYY-MM-DD format');

export const timeStringSchema = z
  .string()
  .refine(isValidTimeString, 'Time must be in 24-hour HH:mm format');

export const timezoneSchema = z
  .string()
  .max(64)
  .refine(isValidTimezone, 'Unknown IANA timezone');

/** Allowed appointment lengths: 15 minutes to 8 hours, on a 5-minute grid. */
export const durationSchema = z
  .number()
  .int('Duration must be a whole number of minutes')
  .min(15, 'Appointments must be at least 15 minutes')
  .max(480, 'Appointments cannot exceed 8 hours')
  .refine((value) => value % 5 === 0, 'Duration must be a multiple of 5 minutes');

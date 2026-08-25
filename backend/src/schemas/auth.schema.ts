import { z } from 'zod';
import { durationSchema, timezoneSchema } from './common.schema';

const nameSchema = z.string().trim().min(2, 'Name must be at least 2 characters').max(120);
const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(255);

/** One definition of the password policy, shared by sign-up and by changing it. */
const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a number');

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: strongPasswordSchema,
});

/**
 * Account settings. Every field is optional so each section of the settings
 * screen can submit only what it owns, but an empty body is rejected rather
 * than treated as a no-op write.
 *
 * `email` is deliberately absent: it is the account's sign-in identity and is
 * fixed after registration. Leaving it out of the schema means `validate`
 * strips it from the body, so a client that sends one anyway cannot reach the
 * service with it — the disabled field on the settings screen is the courtesy,
 * this is the rule.
 */
export const updateProfileSchema = z
  .object({
    name: nameSchema.optional(),
    timezone: timezoneSchema.optional(),
    defaultDurationMinutes: durationSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: strongPasswordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'Choose a password different from your current one',
    path: ['newPassword'],
  });

/** Deleting an account is irreversible, so it is re-authenticated. */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm').max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255),
  password: z.string().min(1, 'Password is required').max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

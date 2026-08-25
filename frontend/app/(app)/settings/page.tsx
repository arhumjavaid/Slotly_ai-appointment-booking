'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { errorMessage } from '@/lib/api';
import { Alert, Button, Card, Field, Input, Select } from '@/components/ui';
import { DURATION_OPTIONS, formatDuration } from '@/lib/format';
import {
  useChangePassword,
  useCurrentUser,
  useDeleteAccount,
  useUpdateProfile,
} from '@/hooks/useAuth';

/*
 * Account settings.
 *
 * Each section owns one concern and submits only its own fields, so saving a
 * preference can never quietly rewrite a name, and a failure in one section
 * leaves the others untouched. The API accepts partial updates for exactly
 * this reason.
 */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{description}</p>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

/** Shown for a few seconds after a save, then cleared. */
function useTransientFlag(): [boolean, () => void] {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(false), 4000);
    return () => clearTimeout(timer);
  }, [shown]);

  return [shown, () => setShown(true)];
}

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120, 'Keep this under 120 characters'),
});

function ProfileSection({ name, email }: { name: string; email: string }) {
  const updateProfile = useUpdateProfile();
  const [saved, markSaved] = useTransientFlag();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    values: { name },
  });

  const onSubmit = handleSubmit((values) =>
    updateProfile.mutate(values, {
      onSuccess: (result) => {
        // Re-baseline the form so the Save button goes back to disabled.
        reset({ name: result.user.name });
        markSaved();
      },
    }),
  );

  return (
    <Section title="Profile" description="Your name, and the address you sign in with.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {updateProfile.isError && (
          <Alert tone="error">{errorMessage(updateProfile.error, "Couldn't save your profile.")}</Alert>
        )}
        {saved && !updateProfile.isError && <Alert tone="success">Profile saved.</Alert>}

        <Field label="Name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" invalid={Boolean(errors.name)} {...register('name')} />
        </Field>

        {/*
         * Shown so the account is identifiable, but outside the form entirely:
         * it is not registered, so there is nothing for a submit to carry. The
         * API drops an email from this route regardless.
         */}
        <Field label="Email" htmlFor="email" hint="Your sign-in address. This cannot be changed.">
          <Input id="email" type="email" value={email} disabled readOnly />
        </Field>

        <Button type="submit" loading={updateProfile.isPending} disabled={!isDirty}>
          Save profile
        </Button>
      </form>
    </Section>
  );
}

const preferencesSchema = z.object({
  timezone: z.string().trim().min(1, 'Choose a timezone'),
  defaultDurationMinutes: z.coerce.number().int().min(15).max(480),
});

function PreferencesSection({
  timezone,
  defaultDurationMinutes,
}: {
  timezone: string;
  defaultDurationMinutes: number;
}) {
  const updateProfile = useUpdateProfile();
  const [saved, markSaved] = useTransientFlag();

  // Whatever the browser reports, plus whatever is already saved — so the
  // current value is always selectable even from a different machine.
  const [zones] = useState(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const supported =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    return [...new Set([detected, timezone, ...supported])].filter(Boolean).sort();
  });

  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<z.input<typeof preferencesSchema>>({
    resolver: zodResolver(preferencesSchema),
    values: { timezone, defaultDurationMinutes },
  });

  const onSubmit = handleSubmit((values) =>
    updateProfile.mutate(
      {
        timezone: values.timezone,
        defaultDurationMinutes: Number(values.defaultDurationMinutes),
      },
      {
        onSuccess: (result) => {
          reset({
            timezone: result.user.timezone,
            defaultDurationMinutes: result.user.defaultDurationMinutes,
          });
          markSaved();
        },
      },
    ),
  );

  return (
    <Section
      title="Booking preferences"
      description="Applied whenever a booking does not say otherwise — by form or by chat."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {updateProfile.isError && (
          <Alert tone="error">
            {errorMessage(updateProfile.error, "Couldn't save your preferences.")}
          </Alert>
        )}
        {saved && !updateProfile.isError && <Alert tone="success">Preferences saved.</Alert>}

        <Field
          label="Timezone"
          htmlFor="timezone"
          error={errors.timezone?.message}
          hint={`Appointment times are stored and shown in this zone. This device reports ${detected}.`}
        >
          <Select id="timezone" invalid={Boolean(errors.timezone)} {...register('timezone')}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Default appointment length"
          htmlFor="defaultDurationMinutes"
          error={errors.defaultDurationMinutes?.message}
          hint="Pre-fills the booking form, and is what the assistant books when you don't state a length."
        >
          <Select
            id="defaultDurationMinutes"
            invalid={Boolean(errors.defaultDurationMinutes)}
            {...register('defaultDurationMinutes')}
          >
            {DURATION_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {formatDuration(minutes)}
              </option>
            ))}
          </Select>
        </Field>

        <Button type="submit" loading={updateProfile.isPending} disabled={!isDirty}>
          Save preferences
        </Button>
      </form>
    </Section>
  );
}

// Mirrors the backend's policy so the rules are visible before submit.
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'Use at least 8 characters')
      .max(128, 'Keep this under 128 characters')
      .regex(/[a-z]/, 'Include a lowercase letter')
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/\d/, 'Include a number'),
    confirmPassword: z.string().min(1, 'Repeat the new password'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'This does not match the new password',
    path: ['confirmPassword'],
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'Choose a password different from your current one',
    path: ['newPassword'],
  });

function PasswordSection() {
  const changePassword = useChangePassword();
  const [saved, markSaved] = useTransientFlag();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit((values) =>
    changePassword.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        onSuccess: () => {
          // Never leave a password sitting in a form field after it is saved.
          reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
          markSaved();
        },
      },
    ),
  );

  return (
    <Section
      title="Password"
      description="You stay signed in on this device. Other devices keep their session until it expires."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {changePassword.isError && (
          <Alert tone="error">
            {errorMessage(changePassword.error, "Couldn't change your password.")}
          </Alert>
        )}
        {saved && !changePassword.isError && <Alert tone="success">Password changed.</Alert>}

        <Field
          label="Current password"
          htmlFor="currentPassword"
          error={errors.currentPassword?.message}
        >
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            invalid={Boolean(errors.currentPassword)}
            {...register('currentPassword')}
          />
        </Field>

        <Field
          label="New password"
          htmlFor="newPassword"
          error={errors.newPassword?.message}
          hint="At least 8 characters, with an uppercase and a number."
        >
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            invalid={Boolean(errors.newPassword)}
            {...register('newPassword')}
          />
        </Field>

        <Field
          label="Repeat new password"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
        >
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            invalid={Boolean(errors.confirmPassword)}
            {...register('confirmPassword')}
          />
        </Field>

        <Button type="submit" loading={changePassword.isPending}>
          Change password
        </Button>
      </form>
    </Section>
  );
}

const CONFIRM_PHRASE = 'delete my account';

function DangerSection({ email }: { email: string }) {
  const deleteAccount = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');

  // Two independent gates: the typed phrase proves intent, the password proves
  // it is the account holder doing it.
  const canDelete = phrase.trim().toLowerCase() === CONFIRM_PHRASE && password.length > 0;

  return (
    <div className="rounded-xl border border-danger/25 bg-surface p-6 shadow-card">
      <h2 className="text-[15px] font-semibold text-danger">Delete account</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        Permanently deletes {email}, every appointment on it, and your chat history. This cannot be
        undone.
      </p>

      {!open ? (
        <Button variant="danger" className="mt-5" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      ) : (
        <form
          className="mt-5 space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (canDelete) deleteAccount.mutate(password);
          }}
        >
          {deleteAccount.isError && (
            <Alert tone="error">
              {errorMessage(deleteAccount.error, "Couldn't delete your account.")}
            </Alert>
          )}

          <Field label={`Type "${CONFIRM_PHRASE}" to confirm`} htmlFor="confirmPhrase">
            <Input
              id="confirmPhrase"
              value={phrase}
              autoComplete="off"
              onChange={(event) => setPhrase(event.target.value)}
            />
          </Field>

          <Field label="Your password" htmlFor="deletePassword">
            <Input
              id="deletePassword"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <div className="flex gap-2">
            <Button
              type="submit"
              variant="danger"
              disabled={!canDelete}
              loading={deleteAccount.isPending}
            >
              Delete account permanently
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setPhrase('');
                setPassword('');
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useCurrentUser();

  // The app shell already blocks on loading the session, so by here there is a
  // user; this keeps the types honest without a second spinner.
  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-2">Manage your account and how appointments are booked.</p>
      </div>

      <ProfileSection name={user.name} email={user.email} />
      <PreferencesSection
        timezone={user.timezone}
        defaultDurationMinutes={user.defaultDurationMinutes}
      />
      <PasswordSection />
      <DangerSection email={user.email} />
    </div>
  );
}

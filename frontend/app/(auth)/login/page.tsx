'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { errorMessage } from '@/lib/api';
import { Alert, Button, Field, Input } from '@/components/ui';
import { useLogin } from '@/hooks/useAuth';

const loginFormSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export default function LoginPage() {
  const login = useLogin();
  // Password reset has no backend yet, so the control says so rather than
  // leading to a dead route.
  const [resetUnavailable, setResetUnavailable] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => login.mutate(values));

  return (
    <div>
      <h1 className="font-display text-[34px] leading-[1.1] text-ink sm:text-[40px]">
        Welcome back
      </h1>
      <p className="mt-2 text-sm text-ink-2">Sign in to continue booking appointments.</p>

      <form onSubmit={onSubmit} noValidate className="mt-7 space-y-4">
        {login.isError && (
          <Alert tone="error">{errorMessage(login.error, "Couldn't sign you in.")}</Alert>
        )}

        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="e.g., you@example.com"
            invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            invalid={Boolean(errors.password)}
            {...register('password')}
          />
        </Field>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setResetUnavailable(true)}
            className="text-[13px] font-medium text-navy underline-offset-4 hover:underline"
          >
            Forgot password?
          </button>
        </div>

        {resetUnavailable && (
          <Alert tone="info">
            Password reset isn&apos;t available yet. Create a new account if you cannot get in.
          </Alert>
        )}

        <Button
          type="submit"
          size="lg"
          loading={login.isPending}
          className="mt-2 h-11 w-full"
        >
          Sign in
        </Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-ink-2">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-semibold text-ink underline-offset-4 hover:underline">
          Create account
        </Link>
      </p>
    </div>
  );
}

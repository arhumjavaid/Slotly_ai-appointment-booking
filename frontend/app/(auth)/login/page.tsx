'use client';

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
      <h1 className="font-display text-[32px] leading-tight text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-ink-2">Pick up where you left off.</p>

      <form onSubmit={onSubmit} noValidate className="mt-7 space-y-4">
        {login.isError && (
          <Alert tone="error">{errorMessage(login.error, "Couldn't sign you in.")}</Alert>
        )}

        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            invalid={Boolean(errors.password)}
            {...register('password')}
          />
        </Field>

        <Button type="submit" size="lg" loading={login.isPending} className="w-full">
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-[13px] text-ink-2">
        New here?{' '}
        <Link href="/register" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

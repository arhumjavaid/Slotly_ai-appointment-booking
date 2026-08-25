'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { errorMessage } from '@/lib/api';
import { Alert, Button, Field, Input } from '@/components/ui';
import { useRegister } from '@/hooks/useAuth';

// Mirrors the backend's password policy so the rules are visible before submit.
const registerFormSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120, 'Keep this under 120 characters'),
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(128, 'Keep this under 128 characters')
    .regex(/[a-z]/, 'Include a lowercase letter')
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/\d/, 'Include a number'),
});

type RegisterFormValues = z.infer<typeof registerFormSchema>;

export default function RegisterPage() {
  const registerUser = useRegister();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => registerUser.mutate(values));

  return (
    <div>
      <h1 className="font-display text-[34px] leading-[1.1] text-ink sm:text-[40px]">
        Create your account
      </h1>
      <p className="mt-2 text-sm text-ink-2">Book appointments by chat or by form.</p>

      <form onSubmit={onSubmit} noValidate className="mt-7 space-y-4">
        {registerUser.isError && (
          <Alert tone="error">
            {errorMessage(registerUser.error, "Couldn't create your account.")}
          </Alert>
        )}

        <Field label="Name" htmlFor="name" error={errors.name?.message}>
          <Input
            id="name"
            autoComplete="name"
            placeholder="e.g., Alex Morgan"
            invalid={Boolean(errors.name)}
            {...register('name')}
          />
        </Field>

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
            autoComplete="new-password"
            placeholder="At least 8 characters, with an uppercase and a number"
            invalid={Boolean(errors.password)}
            {...register('password')}
          />
        </Field>

        <Button
          type="submit"
          size="lg"
          loading={registerUser.isPending}
          className="mt-2 h-11 w-full"
        >
          Create account
        </Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-ink-2">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-ink underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import {
  authService,
  type ChangePasswordPayload,
  type LoginPayload,
  type RegisterPayload,
  type UpdateProfilePayload,
} from '@/services/auth';
import type { User } from '@/types/api';

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

/**
 * Current session, resolved from the HttpOnly cookie by asking the API.
 *
 * There is no client-readable token to inspect, so "am I signed in?" is a
 * server question — which is also the only answer that can be trusted.
 */
export function useCurrentUser() {
  const query = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => authService.me().then((result) => result.user),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const isUnauthenticated = query.error instanceof ApiError && query.error.isUnauthorized;

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isUnauthenticated,
    error: isUnauthenticated ? null : query.error,
  };
}

function useAuthMutation<TPayload>(
  action: (payload: TPayload) => Promise<{ user: User }>,
  redirectTo: string,
) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: action,
    onSuccess: (result) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, result.user);
      router.replace(redirectTo);
    },
  });
}

export function useLogin() {
  return useAuthMutation<LoginPayload>(authService.login, '/dashboard');
}

export function useRegister() {
  return useAuthMutation<RegisterPayload>(authService.register, '/dashboard');
}

/**
 * Settings writes return the updated user, so each one seeds the auth cache
 * directly rather than invalidating it and waiting for a round trip. The header
 * and every other reader update in the same tick as the success message.
 */
function useProfileMutation<TPayload>(action: (payload: TPayload) => Promise<{ user: User }>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: action,
    onSuccess: (result) => queryClient.setQueryData(AUTH_QUERY_KEY, result.user),
  });
}

export function useUpdateProfile() {
  return useProfileMutation<UpdateProfilePayload>(authService.updateProfile);
}

export function useChangePassword() {
  return useProfileMutation<ChangePasswordPayload>(authService.changePassword);
}

export function useDeleteAccount() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (password: string) => authService.deleteAccount(password),
    onSuccess: () => {
      // The account is gone; drop every cached response with it so nothing of
      // it survives into the next session on this device.
      queryClient.clear();
      router.replace('/register');
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authService.logout(),
    // Clear cached server state on the way out so a subsequent sign-in never
    // shows the previous user's appointments.
    onSettled: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });
}

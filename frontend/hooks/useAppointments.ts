'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appointmentService, type AppointmentFilters } from '@/services/appointments';
import type { CreateAppointmentPayload, UpdateAppointmentPayload } from '@/types/api';

export const APPOINTMENTS_KEY = ['appointments'] as const;

export function useAppointments(filters: AppointmentFilters = {}) {
  return useQuery({
    queryKey: [...APPOINTMENTS_KEY, filters],
    queryFn: () => appointmentService.list(filters),
  });
}

/** Any successful write invalidates every appointment list currently cached. */
function useAppointmentMutation<TVariables, TResult>(
  action: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();

  return useMutation<TResult, Error, TVariables>({
    mutationFn: action,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY }),
  });
}

export function useCreateAppointment() {
  return useAppointmentMutation((payload: CreateAppointmentPayload) =>
    appointmentService.create(payload),
  );
}

export function useUpdateAppointment() {
  return useAppointmentMutation(({ id, ...payload }: UpdateAppointmentPayload & { id: string }) =>
    appointmentService.update(id, payload),
  );
}

export function useCancelAppointment() {
  return useAppointmentMutation((id: string) => appointmentService.cancel(id));
}

export function useDeleteAppointment() {
  return useAppointmentMutation((id: string) => appointmentService.remove(id));
}

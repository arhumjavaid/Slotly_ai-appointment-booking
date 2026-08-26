'use client';

import { useQuery } from '@tanstack/react-query';
import { availabilityService } from '@/services/availability';

export const AVAILABILITY_KEY = ['availability'] as const;

/**
 * The service catalogue and its opening hours.
 *
 * Seeded reference data that no part of the app can change, so it is cached
 * for the session rather than refetched on every mount.
 */
export function useAvailability() {
  return useQuery({
    queryKey: AVAILABILITY_KEY,
    queryFn: () => availabilityService.list(),
    staleTime: Infinity,
  });
}

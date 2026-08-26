import { apiRequest } from '@/lib/api';
import type { ServiceType } from '@/types/api';

export const availabilityService = {
  list() {
    return apiRequest<{ services: ServiceType[] }>('/availability');
  },
};

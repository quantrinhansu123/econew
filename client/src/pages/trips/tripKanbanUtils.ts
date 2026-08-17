import type { TripAction } from './types';

export const getPrimaryTripAction = (status?: string | null): TripAction | null => {
  if (status === 'PLANNED') return 'start';
  if (status === 'IN_TRANSIT') return 'arrive';
  if (status === 'ARRIVED') return 'complete';
  return null;
};

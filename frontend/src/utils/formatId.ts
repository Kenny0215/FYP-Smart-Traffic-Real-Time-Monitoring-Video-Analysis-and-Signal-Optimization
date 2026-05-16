export const formatId = (
  prefix: 'US' | 'AD' | 'FD' | 'CP',
  id: number
): string => `${prefix}${String(id).padStart(3, '0')}`;
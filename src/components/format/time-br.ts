import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { TZ } from '@/server/domain/dates';

/** "14:32" no fuso America/Sao_Paulo. */
export function formatTimeBR(iso: string): string {
  return format(new TZDate(new Date(iso).getTime(), TZ), 'HH:mm');
}

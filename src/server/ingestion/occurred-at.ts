import { TZDate } from '@date-fns/tz';
import { TZ } from '../domain/dates';

/**
 * Pluggy manda `date` como ISO. Muitos conectores mandam só o dia, à meia-noite.
 * Devolve o ISO (UTC) quando há hora real; null quando é só data.
 */
export function occurredAtFromPluggy(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return null;
  }
  const local = new TZDate(d.getTime(), TZ);
  if (local.getHours() === 0 && local.getMinutes() === 0 && local.getSeconds() === 0 && local.getMilliseconds() === 0) {
    return null;
  }
  return d.toISOString();
}

/** Horas que os bancos gravam no OFX quando não sabem a hora do lançamento. */
const OFX_NO_TIME = new Set(['000000', '120000']);

/** DTPOSTED do OFX: YYYYMMDD[HHMMSS[.XXX]][[offset:TZ]]. Sem fuso entre colchetes, vale São Paulo. */
export function occurredAtFromOfx(dtPosted: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(dtPosted.trim());
  if (!m) return null;
  if (OFX_NO_TIME.has(m.slice(4, 7).join(''))) return null;
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];

  const tz = /\[\s*([+-]?\d+(?:\.\d+)?)/.exec(dtPosted);
  if (tz?.[1] !== undefined) {
    const offsetMinutes = Math.round(Number(tz[1]) * 60);
    return new Date(Date.UTC(y, mo - 1, d, h, mi, se) - offsetMinutes * 60_000).toISOString();
  }
  return new Date(new TZDate(y, mo - 1, d, h, mi, se, TZ).getTime()).toISOString();
}

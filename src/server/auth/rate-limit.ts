// Freio contra adivinhação de senha. Vive na memória do processo: basta para um servidor só
// (local, Railway). Em hospedagem com várias instâncias (Vercel), cada uma tem o seu contador;
// o limite global ainda segura, mas o ideal lá é guardar as falhas no banco (ver Fase 5).

export interface LoginLimiterOptions {
  /** Falhas por IP dentro da janela antes de bloquear aquele IP. */
  perIpMax: number;
  perIpWindowMs: number;
  /** Falhas somando todos os IPs (ataque distribuído) antes de bloquear o login inteiro. */
  globalMax: number;
  globalWindowMs: number;
  lockMs: number;
}

const MINUTE = 60_000;

export const DEFAULT_LOGIN_LIMITS: LoginLimiterOptions = {
  perIpMax: 5,
  perIpWindowMs: 15 * MINUTE,
  globalMax: 20,
  globalWindowMs: 60 * MINUTE,
  lockMs: 15 * MINUTE,
};

export class LoginLimiter {
  private failuresByIp = new Map<string, number[]>();
  private globalFailures: number[] = [];
  private lockedUntilByIp = new Map<string, number>();
  private globalLockedUntil = 0;

  constructor(
    private readonly opts: LoginLimiterOptions = DEFAULT_LOGIN_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Milissegundos até poder tentar de novo; 0 = liberado. */
  retryAfterMs(ip: string): number {
    const t = this.now();
    return Math.max(0, (this.lockedUntilByIp.get(ip) ?? 0) - t, this.globalLockedUntil - t);
  }

  recordFailure(ip: string): void {
    const t = this.now();
    const recent = (this.failuresByIp.get(ip) ?? []).filter((at) => t - at < this.opts.perIpWindowMs);
    recent.push(t);
    this.failuresByIp.set(ip, recent);
    if (recent.length >= this.opts.perIpMax) this.lockedUntilByIp.set(ip, t + this.opts.lockMs);

    this.globalFailures = this.globalFailures.filter((at) => t - at < this.opts.globalWindowMs);
    this.globalFailures.push(t);
    if (this.globalFailures.length >= this.opts.globalMax) this.globalLockedUntil = t + this.opts.lockMs;

    this.prune(t);
  }

  recordSuccess(ip: string): void {
    this.failuresByIp.delete(ip);
    this.lockedUntilByIp.delete(ip);
  }

  // Evita crescer sem limite com muitos IPs diferentes.
  private prune(t: number): void {
    if (this.failuresByIp.size < 1000) return;
    for (const [ip, list] of this.failuresByIp) {
      const last = list[list.length - 1] ?? 0;
      if (t - last >= this.opts.perIpWindowMs && (this.lockedUntilByIp.get(ip) ?? 0) <= t) {
        this.failuresByIp.delete(ip);
        this.lockedUntilByIp.delete(ip);
      }
    }
  }
}

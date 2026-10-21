import { describe, expect, it } from 'vitest';
import { LoginLimiter } from './rate-limit';

const MIN = 60_000;

function setup() {
  let t = 0;
  const limiter = new LoginLimiter(
    { perIpMax: 3, perIpWindowMs: 10 * MIN, globalMax: 5, globalWindowMs: 60 * MIN, lockMs: 15 * MIN },
    () => t,
  );
  return { limiter, advance: (ms: number) => (t += ms) };
}

describe('LoginLimiter', () => {
  it('bloqueia o IP após N falhas e libera depois do bloqueio', () => {
    const { limiter, advance } = setup();
    limiter.recordFailure('1.1.1.1');
    limiter.recordFailure('1.1.1.1');
    expect(limiter.retryAfterMs('1.1.1.1')).toBe(0);
    limiter.recordFailure('1.1.1.1');
    expect(limiter.retryAfterMs('1.1.1.1')).toBe(15 * MIN);
    expect(limiter.retryAfterMs('2.2.2.2')).toBe(0);
    advance(15 * MIN);
    expect(limiter.retryAfterMs('1.1.1.1')).toBe(0);
  });

  it('falhas antigas saem da janela', () => {
    const { limiter, advance } = setup();
    limiter.recordFailure('1.1.1.1');
    limiter.recordFailure('1.1.1.1');
    advance(11 * MIN);
    limiter.recordFailure('1.1.1.1');
    expect(limiter.retryAfterMs('1.1.1.1')).toBe(0);
  });

  it('acerto zera as falhas do IP', () => {
    const { limiter } = setup();
    limiter.recordFailure('1.1.1.1');
    limiter.recordFailure('1.1.1.1');
    limiter.recordSuccess('1.1.1.1');
    limiter.recordFailure('1.1.1.1');
    expect(limiter.retryAfterMs('1.1.1.1')).toBe(0);
  });

  it('limite global bloqueia todos quando as falhas vêm de IPs diferentes', () => {
    const { limiter } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure(`10.0.0.${i}`);
    expect(limiter.retryAfterMs('10.0.0.99')).toBe(15 * MIN);
  });
});

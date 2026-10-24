import { describe, expect, it, vi } from 'vitest';
import { logServerError, logServerWarn, redact } from './log';

describe('redact (A6-10)', () => {
  it('remove Bearer token da mensagem', () => {
    const input = 'Falha com Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 no header';
    const output = redact(input);
    expect(output).not.toContain('Bearer');
    expect(output).not.toContain('eyJhbGci');
    expect(output).toContain('[redacted]');
    expect(output).toContain('Falha com Authorization:');
    expect(output).toContain('no header');
  });

  it('remove token=, secret= e key= em parâmetros de query string', () => {
    const input = 'GET https://api.pluggy.ai/items?token=my_secret_token_123&foo=bar&secret=abc&key=def';
    const output = redact(input);
    expect(output).not.toContain('token=');
    expect(output).not.toContain('secret=');
    expect(output).not.toContain('key=');
    expect(output).not.toContain('my_secret_token_123');
    expect(output).toContain('https://api.pluggy.ai/items?');
    expect(output).toContain('foo=bar');
  });

  it('remove URLs com credenciais (formato com @)', () => {
    const input = 'Conexão falhou com postgres://postgres:senhaSuperSecreta@localhost:5432/banco';
    const output = redact(input);
    expect(output).not.toContain('postgres:senhaSuperSecreta@localhost:5432/banco');
    expect(output).not.toContain('senhaSuperSecreta');
    expect(output).toBe('Conexão falhou com [redacted]');
  });

  it('remove chaves longas com formato base64url de 40+ caracteres', () => {
    const longKey = 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2'; // 44 chars
    const input = `Chave de API inválida: ${longKey} para o serviço`;
    const output = redact(input);
    expect(output).not.toContain(longKey);
    expect(output).toBe('Chave de API inválida: [redacted] para o serviço');
  });

  it('preserva texto comum sem dados sensíveis', () => {
    const normal = 'Sincronização da conta 123 concluída com 15 novas transações em 2026-10-24';
    expect(redact(normal)).toBe(normal);
  });
});

describe('logServerError and logServerWarn', () => {
  it('formata logServerError em linha única com redação e contexto', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const err = new Error('Falha HTTP com Bearer token-secreto\nlinha extra');
    err.name = 'FetchError';

    logServerError('sync', err, { connectionId: 'conn-1', attempts: 3 });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logged = consoleSpy.mock.calls[0]?.[0] as string;
    expect(logged).toContain('[sync] FetchError: Falha HTTP com [redacted] linha extra');
    expect(logged).toContain('{"connectionId":"conn-1","attempts":3}');
    expect(logged).not.toContain('\n');
    expect(logged).not.toContain('token-secreto');

    consoleSpy.mockRestore();
  });

  it('formata logServerWarn em linha única com redação', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logServerWarn('ingestion', 'tipo não reconhecido secret=secreto123');

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logged = consoleSpy.mock.calls[0]?.[0] as string;
    expect(logged).toBe('[ingestion] tipo não reconhecido [redacted]');
    expect(logged).not.toContain('secreto123');

    consoleSpy.mockRestore();
  });
});

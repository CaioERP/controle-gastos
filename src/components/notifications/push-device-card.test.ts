import { describe, expect, it } from 'vitest';
import { getDeviceLabel, urlBase64ToUint8Array } from './push-device-card';

describe('push-device-card utils', () => {
  it('urlBase64ToUint8Array converte string base64url corretamente em Uint8Array', () => {
    // Exemplo de base64url
    const base64Url = 'AQAB'; // 'AQAB' em base64 = [1, 0, 1]
    const uint8 = urlBase64ToUint8Array(base64Url);
    expect(uint8).toBeInstanceOf(Uint8Array);
    expect(uint8.length).toBe(3);
    expect(uint8[0]).toBe(1);
    expect(uint8[1]).toBe(0);
    expect(uint8[2]).toBe(1);
  });

  it('getDeviceLabel identifica iPhone, iPad, Android e navegadores desktop', () => {
    expect(
      getDeviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone');

    expect(
      getDeviceLabel(
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPad');

    expect(
      getDeviceLabel(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
      ),
    ).toBe('Android');

    expect(
      getDeviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      ),
    ).toBe('Chrome no Windows');

    expect(
      getDeviceLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      ),
    ).toBe('Safari no Mac');

    expect(
      getDeviceLabel(
        'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
      ),
    ).toBe('Firefox no Linux');
  });
});

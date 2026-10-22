import { describe, expect, it } from 'vitest';
import { pushEnabledFor } from './defaults';
import { toPayload } from './send';

describe('push notifications', () => {
  describe('pushEnabledFor', () => {
    it('sem preferência gravada: ativa apenas os tipos padrão (threshold_100, sync_error, consent_expiring)', () => {
      expect(pushEnabledFor('threshold_100')).toBe(true);
      expect(pushEnabledFor('sync_error')).toBe(true);
      expect(pushEnabledFor('consent_expiring')).toBe(true);

      // Demais tipos desligados por padrão
      expect(pushEnabledFor('threshold_80')).toBe(false);
      expect(pushEnabledFor('pace_warning')).toBe(false);
      expect(pushEnabledFor('invoice_due_soon')).toBe(false);
    });

    it('com enabled=false: retorna false mesmo se push=true', () => {
      expect(pushEnabledFor('threshold_100', { enabled: false, push: true })).toBe(false);
      expect(pushEnabledFor('sync_error', { enabled: false, push: false })).toBe(false);
    });

    it('com push=true e enabled=true: retorna true para qualquer tipo', () => {
      expect(pushEnabledFor('threshold_80', { enabled: true, push: true })).toBe(true);
      expect(pushEnabledFor('pace_warning', { enabled: true, push: true })).toBe(true);
    });

    it('com push=false e enabled=true: retorna false', () => {
      expect(pushEnabledFor('threshold_100', { enabled: true, push: false })).toBe(false);
    });
  });

  describe('toPayload', () => {
    it('usa actionUrl quando fornecido', () => {
      const payload = toPayload({
        id: '1',
        type: 'threshold_100',
        title: 'Meta estourada',
        message: 'Você gastou 105% da meta',
        actionUrl: '/transacoes?cat=alimentacao',
      });

      expect(payload).toEqual({
        title: 'Meta estourada',
        body: 'Você gastou 105% da meta',
        url: '/transacoes?cat=alimentacao',
        tag: 'threshold_100',
      });
    });

    it('usa /notificacoes como fallback quando actionUrl é nulo', () => {
      const payload = toPayload({
        id: '2',
        type: 'sync_error',
        title: 'Erro de sincronização',
        message: 'Falha ao sincronizar Nubank',
        actionUrl: null,
      });

      expect(payload).toEqual({
        title: 'Erro de sincronização',
        body: 'Falha ao sincronizar Nubank',
        url: '/notificacoes',
        tag: 'sync_error',
      });
    });
  });
});

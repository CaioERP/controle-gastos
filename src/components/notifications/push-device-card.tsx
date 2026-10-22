'use client';

import * as React from 'react';
import { Smartphone, Bell, BellOff, Send, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { subscribePush, unsubscribePush, testPush } from '@/app/(app)/notificacoes/push-actions';

export type PushDeviceCardProps = {
  vapidPublicKey: string | null;
  className?: string;
};

type PushStatus =
  | 'loading'
  | 'no_vapid'
  | 'unsupported'
  | 'ios_not_standalone'
  | 'permission_denied'
  | 'unsubscribed'
  | 'subscribed';

export function getDeviceLabel(
  ua = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): string {
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';

  const isMac = /Macintosh|Mac OS X/.test(ua);
  const isWindows = /Windows/.test(ua);
  const isLinux = /Linux/.test(ua);

  let browser = 'Navegador';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';

  let os = '';
  if (isWindows) os = 'no Windows';
  else if (isMac) os = 'no Mac';
  else if (isLinux) os = 'no Linux';

  return os ? `${browser} ${os}` : browser;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const atobFn = typeof window !== 'undefined' ? window.atob : globalThis.atob;
  const rawData = atobFn(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function checkPushSupport(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function checkIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function checkStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export function PushDeviceCard({ vapidPublicKey, className }: PushDeviceCardProps) {
  const isMounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [subLoading, setSubLoading] = React.useState(true);
  const [subscription, setSubscription] = React.useState<PushSubscription | null>(null);
  const [permissionDenied, setPermissionDenied] = React.useState(false);
  const [isPending, setIsPending] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    async function initSubscription() {
      if (!checkPushSupport()) {
        if (active) setSubLoading(false);
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (active) {
          setSubscription(sub);
          setSubLoading(false);
        }
      } catch (err) {
        console.error('[push] Erro ao carregar inscrição:', err);
        if (active) setSubLoading(false);
      }
    }
    void initSubscription();
    return () => {
      active = false;
    };
  }, []);

  // Determinação dos 6 estados em ordem estrita
  const status: PushStatus = React.useMemo(() => {
    if (!vapidPublicKey) return 'no_vapid';
    if (!isMounted) return 'loading';
    if (!checkPushSupport()) return 'unsupported';
    if (checkIos() && !checkStandalone()) return 'ios_not_standalone';
    if (permissionDenied || Notification.permission === 'denied') return 'permission_denied';
    if (subLoading) return 'loading';
    if (subscription) return 'subscribed';
    return 'unsubscribed';
  }, [vapidPublicKey, isMounted, permissionDenied, subLoading, subscription]);

  async function handleSubscribe() {
    if (!vapidPublicKey) return;
    setIsPending(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        setPermissionDenied(true);
        toast.error('As notificações foram bloqueadas nas permissões do navegador');
        return;
      }
      if (permission !== 'granted') {
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const key = urlBase64ToUint8Array(vapidPublicKey);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key as unknown as BufferSource,
      });

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Chaves da inscrição push incompletas');
      }

      const res = await subscribePush({
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        deviceLabel: getDeviceLabel(),
      });

      if (!res.ok) {
        throw new Error(res.error.message || 'Erro ao registrar inscrição no servidor');
      }

      setSubscription(sub);
      toast.success('Notificações push ativadas neste aparelho');
    } catch (err) {
      console.error('[push] Falha ao ativar push:', err);
      toast.error((err as Error)?.message || 'Erro ao ativar notificações');
    } finally {
      setIsPending(false);
    }
  }

  async function handleUnsubscribe() {
    setIsPending(true);
    try {
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await unsubscribePush(endpoint);
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          await unsubscribePush(endpoint);
        }
      }
      setSubscription(null);
      toast.success('Notificações desativadas neste aparelho');
    } catch (err) {
      console.error('[push] Erro ao desativar push:', err);
      toast.error('Erro ao desativar notificações');
    } finally {
      setIsPending(false);
    }
  }

  async function handleTestPush() {
    setIsPending(true);
    try {
      const res = await testPush();
      if (res.ok) {
        if (res.data.sent > 0) {
          toast.success('Notificação de teste enviada!');
        } else {
          toast.info('Nenhum aparelho inscrito para receber o teste');
        }
      } else {
        toast.error(res.error.message || 'Erro ao enviar notificação de teste');
      }
    } catch {
      toast.error('Erro de conexão ao enviar notificação de teste');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className={className} data-testid="push-device-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="size-4 text-primary" aria-hidden />
            <CardTitle className="text-base font-semibold">
              Notificações neste aparelho
            </CardTitle>
          </div>
          {status === 'subscribed' && (
            <Badge variant="outline" className="text-xs border-primary/40 text-primary gap-1">
              <CheckCircle2 className="size-3" />
              <span>Ativo</span>
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          Receba avisos instantâneos de limites estourados, faturas e sincronizações diretamente no seu dispositivo.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        {status === 'loading' ? (
          <p className="text-xs text-muted-foreground">Verificando suporte a notificações push...</p>
        ) : status === 'no_vapid' ? (
          <div className="flex items-start gap-2.5 text-amber-600 dark:text-amber-400 bg-amber-500/10 p-3 rounded-lg text-xs">
            <ShieldAlert className="size-4 shrink-0 mt-0.5" />
            <p>
              Push não configurado. Gere as chaves com <code className="font-mono bg-background/60 px-1 py-0.5 rounded">npx tsx scripts/vapid-keys.ts</code> e reinicie o app.
            </p>
          </div>
        ) : status === 'unsupported' ? (
          <div className="flex items-start gap-2.5 text-muted-foreground bg-muted/50 p-3 rounded-lg text-xs">
            <BellOff className="size-4 shrink-0 mt-0.5" />
            <p>Este navegador não aceita notificações push.</p>
          </div>
        ) : status === 'ios_not_standalone' ? (
          <div className="flex items-start gap-2.5 text-blue-600 dark:text-blue-400 bg-blue-500/10 p-3 rounded-lg text-xs">
            <Smartphone className="size-4 shrink-0 mt-0.5" />
            <p>
              No iPhone, primeiro adicione o app à tela inicial (Compartilhar → Adicionar à Tela de Início) e abra por lá.
            </p>
          </div>
        ) : status === 'permission_denied' ? (
          <div className="flex items-start gap-2.5 text-destructive bg-destructive/10 p-3 rounded-lg text-xs">
            <BellOff className="size-4 shrink-0 mt-0.5" />
            <p>As notificações foram bloqueadas. Libere nas configurações do navegador.</p>
          </div>
        ) : status === 'unsubscribed' ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted-foreground">
              Ative as notificações push neste aparelho para ser avisado sem precisar estar com o aplicativo aberto.
            </p>
            <Button
              onClick={handleSubscribe}
              disabled={isPending}
              size="sm"
              className="gap-1.5 shrink-0"
              data-testid="enable-push-btn"
            >
              <Bell className="size-3.5" />
              <span>{isPending ? 'Ativando...' : 'Ativar neste aparelho'}</span>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <span>Ativado neste aparelho</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Dispositivo reconhecido como: <span className="font-medium">{getDeviceLabel()}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestPush}
                disabled={isPending}
                className="gap-1.5 text-xs"
                data-testid="test-push-btn"
              >
                <Send className="size-3.5" />
                <span>Enviar teste</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUnsubscribe}
                disabled={isPending}
                className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                data-testid="disable-push-btn"
              >
                <BellOff className="size-3.5" />
                <span>Desativar</span>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import type { NotificationPreferenceRow } from '@/server/queries/notifications';
import { updateNotificationPreferencesAction } from '@/app/(app)/notificacoes/actions';

type NotificationPreferencesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: NotificationPreferenceRow[];
  onSuccess?: () => void;
};

type GroupedPrefs = {
  title: string;
  items: NotificationPreferenceRow[];
};

type PreferencesFormProps = {
  preferences: NotificationPreferenceRow[];
  onCancel: () => void;
  onSuccess?: () => void;
};

function PreferencesForm({ preferences: initialPrefs, onCancel, onSuccess }: PreferencesFormProps) {
  const [prefs, setPrefs] = React.useState<NotificationPreferenceRow[]>(initialPrefs);
  const [isPending, startTransition] = React.useTransition();

  function handleToggle(type: NotificationPreferenceRow['type'], enabled: boolean) {
    setPrefs((prev) =>
      prev.map((p) => (p.type === type ? { ...p, enabled, inApp: enabled } : p)),
    );
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const payload = prefs.map((p) => ({
          type: p.type,
          enabled: p.enabled,
          inApp: p.inApp,
          telegram: p.telegram,
        }));

        const res = await updateNotificationPreferencesAction({ preferences: payload });
        if (res.ok) {
          toast.success('Preferências de notificação salvas');
          onSuccess?.();
        } else {
          toast.error(res.error.message || 'Erro ao salvar preferências');
        }
      } catch {
        toast.error('Erro de conexão ao salvar preferências');
      }
    });
  }

  // Agrupamento temático das preferências
  const groups: GroupedPrefs[] = React.useMemo(() => {
    const limitsTypes = ['threshold_80', 'threshold_100', 'pace_warning'];
    const recurrenceTypes = ['price_hike', 'cancelled_subscription'];
    const connectionTypes = ['invoice_due_soon', 'consent_expiring', 'sync_error', 'unusual_expense'];

    return [
      {
        title: 'Limites e Orçamentos',
        items: prefs.filter((p) => limitsTypes.includes(p.type)),
      },
      {
        title: 'Assinaturas e Recorrências',
        items: prefs.filter((p) => recurrenceTypes.includes(p.type)),
      },
      {
        title: 'Contas, Conexões e Gastos',
        items: prefs.filter((p) => connectionTypes.includes(p.type)),
      },
    ];
  }, [prefs]);

  return (
    <>
      <div className="space-y-6 py-2">
        {groups.map((group) => (
          <div key={group.title} className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </h4>
            <div className="rounded-lg border divide-y divide-border/60">
              {group.items.map((item) => (
                <div
                  key={item.type}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <label
                      htmlFor={`pref-${item.type}`}
                      className="font-medium text-foreground text-xs sm:text-sm cursor-pointer block"
                    >
                      {item.label}
                    </label>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                  <Switch
                    id={`pref-${item.type}`}
                    checked={item.enabled}
                    onCheckedChange={(checked) => handleToggle(item.type, checked)}
                    size="sm"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? 'Salvando...' : 'Salvar preferências'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function NotificationPreferencesDialog({
  open,
  onOpenChange,
  preferences,
  onSuccess,
}: NotificationPreferencesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Settings2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Preferências de Alerta</DialogTitle>
              <DialogDescription>
                Escolha quais notificações e alertas inteligentes você deseja receber no aplicativo.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {open && (
          <PreferencesForm
            preferences={preferences}
            onCancel={() => onOpenChange(false)}
            onSuccess={() => {
              onOpenChange(false);
              onSuccess?.();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

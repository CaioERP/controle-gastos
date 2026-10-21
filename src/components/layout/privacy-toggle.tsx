'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PRIVACY_STORAGE_KEY } from './privacy-script';

// Fonte da verdade: o atributo data-privacy no <html>, que o CSS usa para borrar os valores
// marcados com data-sensitive. O localStorage só lembra a escolha entre visitas.
const listeners = new Set<() => void>();

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

function isHidden() {
  return document.documentElement.dataset.privacy === 'on';
}

function setHidden(hidden: boolean) {
  if (hidden) document.documentElement.dataset.privacy = 'on';
  else delete document.documentElement.dataset.privacy;
  try {
    window.localStorage.setItem(PRIVACY_STORAGE_KEY, hidden ? 'on' : 'off');
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }
  listeners.forEach((notify) => notify());
}

export function PrivacyToggle() {
  const hidden = React.useSyncExternalStore(subscribe, isHidden, () => false);
  const label = hidden ? 'Mostrar valores' : 'Esconder valores';

  return (
    <Button
      variant="outline"
      size="icon"
      className="h-9 w-9 shrink-0"
      aria-label={label}
      aria-pressed={hidden}
      title={label}
      onClick={() => setHidden(!hidden)}
    >
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </Button>
  );
}

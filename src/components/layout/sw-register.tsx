'use client';

import * as React from 'react';

/**
 * Registra o Service Worker (/sw.js) exclusivamente em produção ou quando
 * NEXT_PUBLIC_ENABLE_SW='true' for definido explicitamente, evitando interferir
 * no hot reload do Turbopack em desenvolvimento local.
 */
export function SwRegister() {
  React.useEffect(() => {
    const isProd = process.env.NODE_ENV === 'production';
    const isExplicitlyEnabled = process.env.NEXT_PUBLIC_ENABLE_SW === 'true';

    if ('serviceWorker' in navigator && (isProd || isExplicitlyEnabled)) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('Falha ao registrar Service Worker:', err);
      });
    }
  }, []);

  return null;
}

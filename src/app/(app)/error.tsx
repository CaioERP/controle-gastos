'use client';

import * as React from 'react';
import { ErrorState } from '@/components/states/error-state';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="py-12">
      <ErrorState message={error.message || 'Erro ao carregar a página.'} retry={reset} />
    </div>
  );
}

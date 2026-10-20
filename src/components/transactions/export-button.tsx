import * as React from 'react';
import { Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { serializeFilters } from '@/server/queries/url-filters';
import type { TxFilters } from '@/server/domain/filters';

type ExportButtonProps = {
  filters: TxFilters;
};

export function ExportButton({ filters }: ExportButtonProps) {
  const qs = serializeFilters(filters);
  const href = `/transacoes/exportar${qs ? `?${qs}` : ''}`;

  return (
    <a
      href={href}
      download
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      <Download className="mr-1.5 size-4" />
      Exportar CSV
    </a>
  );
}
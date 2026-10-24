'use client';

import * as React from 'react';
import { Download, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { serializeFilters } from '@/server/queries/url-filters';
import type { TxFilters } from '@/server/domain/filters';

export type ExportButtonProps = {
  filters: TxFilters;
};

export function ExportButton({ filters }: ExportButtonProps) {
  const qs = serializeFilters(filters);
  const href = `/transacoes/exportar${qs ? `?${qs}` : ''}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Mais opções" className="size-8 p-0">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          render={
            <a href={href} download className="flex w-full items-center gap-2 cursor-pointer">
              <Download className="size-4 text-muted-foreground" />
              <span>Exportar CSV</span>
            </a>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

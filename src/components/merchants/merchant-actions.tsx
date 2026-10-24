'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLinkIcon, MoreVerticalIcon, PencilIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MerchantDialog } from '@/components/catalog/merchant-dialog';
import type { CategoryOptionGroup } from '@/components/catalog/catalog-helpers';
import type { MerchantRow } from '@/server/queries/catalog';

type MerchantActionsProps = {
  merchant: {
    id: string;
    name: string;
    defaultCategory: { id: string; name: string; color: string } | null;
  };
  firstDate: string | null;
  lastDate: string | null;
  categoryGroups: CategoryOptionGroup[];
};

export function MerchantActions({
  merchant,
  firstDate,
  lastDate,
  categoryGroups,
}: MerchantActionsProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const viewStatementHref = React.useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('estab', merchant.id);
    if (firstDate) sp.set('de', firstDate);
    if (lastDate) sp.set('ate', lastDate);
    return `/transacoes?${sp.toString()}`;
  }, [merchant.id, firstDate, lastDate]);

  const merchantRow: MerchantRow = {
    id: merchant.id,
    name: merchant.name,
    defaultCategory: merchant.defaultCategory
      ? { id: merchant.defaultCategory.id, name: merchant.defaultCategory.name }
      : null,
    transactionCount: 0,
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Link
          href={viewStatementHref}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <ExternalLinkIcon className="size-3.5 mr-1.5" />
          <span>Ver no extrato</span>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Ações do estabelecimento">
                <MoreVerticalIcon className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDialogOpen(true)}>
              <PencilIcon className="size-4 mr-2" />
              <span>Editar estabelecimento</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MerchantDialog
        merchant={dialogOpen ? merchantRow : null}
        onClose={() => setDialogOpen(false)}
        categoryGroups={categoryGroups}
      />
    </>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getDb } from '@/server/db/client';
import { getMerchantHistory } from '@/server/queries/merchant-history';
import { listCategories, listTags } from '@/server/queries/catalog';
import { categoryOptionGroups } from '@/components/catalog/catalog-helpers';
import { listTransactions } from '@/server/queries/transactions';
import { today, formatDateBR } from '@/server/domain/dates';
import type { TxFilters } from '@/server/domain/filters';
import { buttonVariants } from '@/components/ui/button';
import { StatStrip, type StatItem } from '@/components/layout/stat-strip';
import { Section } from '@/components/layout/section';
import { Money } from '@/components/format/money';
import { MonthlySpendBars } from '@/components/merchants/monthly-spend-bars';
import { HorizontalBars } from '@/components/charts/horizontal-bars';
import { MerchantActions } from '@/components/merchants/merchant-actions';
import { TransactionList } from '@/components/transactions/transaction-list';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function MerchantDetailPage({ params }: Props) {
  const { id } = await params;
  const db = getDb();

  const [history, categories, tags] = await Promise.all([
    getMerchantHistory(db, id),
    listCategories(db),
    listTags(db),
  ]);

  if (!history) {
    notFound();
  }

  const categoryGroups = categoryOptionGroups(categories);

  const txFilters: TxFilters = {
    merchantIds: [id],
    from: history.firstDate ?? '2020-01-01',
    to: history.lastDate ?? today(),
  };

  const initialTransactions = await listTransactions(db, txFilters, { limit: 20 });

  let firstDateHint: string | undefined;
  if (history.firstDate) {
    try {
      const d = parseISO(history.firstDate);
      const mon = format(d, 'MMM', { locale: ptBR }).replace('.', '');
      const yy = format(d, 'yyyy');
      firstDateHint = `cliente desde ${mon.charAt(0).toUpperCase() + mon.slice(1)}/${yy}`;
    } catch {
      // fallback
    }
  }

  const statItems: StatItem[] = [
    {
      label: 'Gasto em 12 meses',
      value: <Money cents={history.last12.totalCents} />,
    },
    {
      label: 'Compras',
      value: history.last12.count.toLocaleString('pt-BR'),
    },
    {
      label: 'Ticket médio',
      value: <Money cents={history.last12.averageCents} />,
    },
    {
      label: 'Última compra',
      value: history.lastDate ? formatDateBR(history.lastDate) : '—',
      hint: firstDateHint,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/estabelecimentos"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}
        >
          <ArrowLeft className="size-4" />
          <span>Estabelecimentos</span>
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight text-foreground">
              {history.merchant.name}
            </h1>
            {history.merchant.defaultCategory ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border border-border/60 bg-muted/40">
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: history.merchant.defaultCategory.color }}
                  aria-hidden="true"
                />
                <span>{history.merchant.defaultCategory.name}</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Sem categoria padrão</span>
            )}
          </div>
        </div>

        <MerchantActions
          merchant={history.merchant}
          firstDate={history.firstDate}
          lastDate={history.lastDate}
          categoryGroups={categoryGroups}
        />
      </div>

      <StatStrip items={statItems} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Section title="Gasto por mês" description="Últimos 12 meses">
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <MonthlySpendBars monthly={history.monthly} />
            </div>
          </Section>
        </div>

        <div className="lg:col-span-5">
          <Section title="Como você paga ali" description="Últimos 12 meses">
            <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Forma de pagamento
                </h3>
                {history.byPaymentMethod.length > 0 ? (
                  <HorizontalBars
                    items={history.byPaymentMethod.map((item) => ({
                      ...item,
                      color: item.color ?? 'hsl(var(--primary))',
                      href: `/transacoes?estab=${history.merchant.id}&forma=${item.key}`,
                    }))}
                    totalCents={history.last12.totalCents}
                    ariaLabel="Gastos por forma de pagamento"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum gasto nos últimos 12 meses.</p>
                )}
              </div>

              {history.byAccount.length > 0 && (
                <div className="border-t border-border/50 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Conta ou cartão
                  </h3>
                  <HorizontalBars
                    items={history.byAccount.map((item) => ({
                      ...item,
                      color: item.color ?? 'hsl(var(--primary))',
                      href: `/transacoes?estab=${history.merchant.id}&contas=${item.key}`,
                    }))}
                    totalCents={history.last12.totalCents}
                    ariaLabel="Gastos por conta ou cartão"
                  />
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>

      <Section title="Histórico de transações" description="Todas as compras registradas neste estabelecimento">
        <TransactionList
          initialItems={initialTransactions.items}
          initialCursor={initialTransactions.nextCursor}
          filters={txFilters}
          categories={categories}
          tags={tags}
        />
      </Section>
    </div>
  );
}

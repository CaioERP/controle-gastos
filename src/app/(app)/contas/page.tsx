import { formatDistanceToNow, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getDb } from '@/server/db/client';
import { formatDateBR } from '@/server/domain/dates';
import { formatBRL } from '@/server/domain/money';
import { getAccountsOverview, type InstitutionWithAccounts } from '@/server/queries/accounts';
import { AccountRow } from '@/components/accounts/account-row';
import { CardAccountRow } from '@/components/accounts/card-account-row';
import { Money } from '@/components/format/money';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { StatStrip, type StatItem } from '@/components/layout/stat-strip';
import { ManualAccountDialog } from '@/components/manual/manual-account-dialog';
import { EmptyState } from '@/components/states/empty-state';

export const dynamic = 'force-dynamic';

export default async function ContasPage() {
  const db = getDb();
  const institutions = await getAccountsOverview(db, { includeHidden: true });

  let totalCashCents = 0;
  let checkingCount = 0;
  let totalOpenInvoicesCents = 0;
  let nextDueDate: string | null = null;
  let totalAvailableLimitCents = 0;
  let totalCreditLimitCents = 0;
  let totalInvestedCents = 0;
  let latestInvestmentDate: Date | null = null;

  type AccountItem = InstitutionWithAccounts['accounts'][number] & {
    institution: { name: string; color: string };
  };

  const checkingAccounts: AccountItem[] = [];
  const cardAccounts: AccountItem[] = [];
  const investmentAccounts: AccountItem[] = [];
  const hiddenAccounts: AccountItem[] = [];

  for (const inst of institutions) {
    for (const acc of inst.accounts) {
      const item: AccountItem = {
        ...acc,
        institution: {
          name: inst.institution.name,
          color: inst.institution.color,
        },
      };

      if (acc.isHidden) {
        hiddenAccounts.push(item);
        continue;
      }

      if (acc.type === 'credit_card') {
        cardAccounts.push(item);
        if (acc.includeInTotals) {
          const invTotal = Math.max(0, acc.credit?.openInvoice?.totalCents ?? 0);
          totalOpenInvoicesCents += invTotal;
          if (acc.credit?.openInvoice?.dueDate) {
            if (!nextDueDate || acc.credit.openInvoice.dueDate < nextDueDate) {
              nextDueDate = acc.credit.openInvoice.dueDate;
            }
          }
          totalAvailableLimitCents += Math.max(0, acc.credit?.availableCents ?? 0);
          totalCreditLimitCents += Math.max(0, acc.credit?.limitCents ?? 0);
        }
      } else if (acc.type === 'investment') {
        investmentAccounts.push(item);
        if (acc.includeInTotals) {
          totalInvestedCents += acc.balanceCents;
          if (acc.balanceUpdatedAt && isValid(new Date(acc.balanceUpdatedAt))) {
            const d = new Date(acc.balanceUpdatedAt);
            if (!latestInvestmentDate || d > latestInvestmentDate) {
              latestInvestmentDate = d;
            }
          }
        }
      } else {
        checkingAccounts.push(item);
        if (acc.includeInTotals) {
          totalCashCents += acc.balanceCents;
          checkingCount++;
        }
      }
    }
  }

  const statItems: StatItem[] = [
    {
      label: 'Em contas',
      value: <Money cents={totalCashCents} />,
      hint: `${checkingCount} conta${checkingCount !== 1 ? 's' : ''}`,
    },
    {
      label: 'Faturas abertas',
      value: <Money cents={totalOpenInvoicesCents} className="text-amber-600 dark:text-amber-400" />,
      hint: nextDueDate ? `próxima vence ${formatDateBR(nextDueDate).slice(0, 5)}` : 'nenhuma aberta',
    },
    {
      label: 'Limite disponível',
      value: <Money cents={totalAvailableLimitCents} />,
      hint: totalCreditLimitCents > 0 ? `de ${formatBRL(totalCreditLimitCents)}` : undefined,
    },
    {
      label: 'Investido',
      value: <Money cents={totalInvestedCents} />,
      hint: latestInvestmentDate
        ? `atualizado ${formatDistanceToNow(latestInvestmentDate, { addSuffix: true, locale: ptBR })}`
        : investmentAccounts.length > 0
          ? `${investmentAccounts.length} posições`
          : undefined,
    },
  ];

  const isEmpty =
    checkingAccounts.length === 0 &&
    cardAccounts.length === 0 &&
    investmentAccounts.length === 0 &&
    hiddenAccounts.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas e cartões"
        description="Gerencie suas contas correntes, poupanças, cartões de crédito e limites."
        actions={<ManualAccountDialog />}
      />

      {isEmpty ? (
        <EmptyState
          title="Nenhuma conta cadastrada"
          description="Conecte seu banco pelo Open Finance ou crie uma conta manual para gerenciar seus gastos."
        />
      ) : (
        <div className="space-y-6">
          {/* Faixa com 4 números principais */}
          <StatStrip items={statItems} />

          {/* Listas por tipo: desktop em 2 colunas, celular em 1 coluna (Contas, Cartões, Investimentos) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Coluna 1 (desktop): Contas e Investimentos */}
            <div className="space-y-8 order-1">
              {checkingAccounts.length > 0 && (
                <Section
                  title={
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Contas
                    </span>
                  }
                >
                  <div className="divide-y divide-border/40">
                    {checkingAccounts.map((acc) => (
                      <AccountRow key={acc.id} account={acc} institution={acc.institution} />
                    ))}
                  </div>
                </Section>
              )}

              {/* No desktop Investimentos fica na coluna da esquerda abaixo de Contas */}
              {investmentAccounts.length > 0 && (
                <div className="hidden lg:block">
                  <Section
                    title={
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Investimentos
                      </span>
                    }
                  >
                    <div className="divide-y divide-border/40">
                      {investmentAccounts.map((acc) => (
                        <AccountRow key={acc.id} account={acc} institution={acc.institution} />
                      ))}
                    </div>
                  </Section>
                </div>
              )}
            </div>

            {/* Coluna 2 (desktop): Cartões */}
            <div className="space-y-8 order-2">
              {cardAccounts.length > 0 && (
                <Section
                  title={
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Cartões
                    </span>
                  }
                >
                  <div className="divide-y divide-border/40">
                    {cardAccounts.map((acc) => (
                      <CardAccountRow key={acc.id} account={acc} institution={acc.institution} />
                    ))}
                  </div>
                </Section>
              )}

              {/* No celular Investimentos aparece na ordem Contas -> Cartões -> Investimentos */}
              {investmentAccounts.length > 0 && (
                <div className="lg:hidden">
                  <Section
                    title={
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Investimentos
                      </span>
                    }
                  >
                    <div className="divide-y divide-border/40">
                      {investmentAccounts.map((acc) => (
                        <AccountRow key={acc.id} account={acc} institution={acc.institution} />
                      ))}
                    </div>
                  </Section>
                </div>
              )}
            </div>
          </div>

          {/* Contas ocultas */}
          {hiddenAccounts.length > 0 && (
            <details className="group rounded-xl border bg-muted/30 p-4 transition-all">
              <summary className="flex cursor-pointer items-center justify-between font-medium text-xs text-muted-foreground hover:text-foreground">
                <span>Ocultas ({hiddenAccounts.length})</span>
                <span className="text-[11px] group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="mt-3 divide-y divide-border/40">
                {hiddenAccounts.map((acc) => {
                  if (acc.type === 'credit_card') {
                    return <CardAccountRow key={acc.id} account={acc} institution={acc.institution} />;
                  }
                  return <AccountRow key={acc.id} account={acc} institution={acc.institution} />;
                })}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

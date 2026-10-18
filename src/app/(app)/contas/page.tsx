import { getDb } from '@/server/db/client';
import { getAccountsOverview } from '@/server/queries/accounts';
import { InstitutionSection } from '@/components/accounts/institution-section';
import { AccountRow } from '@/components/accounts/account-row';
import { CardAccountRow } from '@/components/accounts/card-account-row';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export const dynamic = 'force-dynamic';

export default async function ContasPage() {
  const db = getDb();
  const institutions = await getAccountsOverview(db, { includeHidden: true });

  // Separa as contas ativas das contas ocultas
  const visibleInstitutions = institutions
    .map((inst) => ({
      ...inst,
      accounts: inst.accounts.filter((a) => !a.isHidden),
    }))
    .filter((inst) => inst.accounts.length > 0);

  const hiddenAccounts = institutions.flatMap((inst) =>
    inst.accounts.filter((a) => a.isHidden).map((acc) => ({ ...acc, institutionColor: inst.institution.color, institutionName: inst.institution.name }))
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas e cartões"
        description="Gerencie suas contas correntes, poupanças, cartões de crédito e limites."
      />

      {visibleInstitutions.length === 0 && hiddenAccounts.length === 0 ? (
        <EmptyState
          title="Nenhuma conta cadastrada"
          description="Conecte seu banco pelo Open Finance ou importe seus dados para visualizar suas contas aqui."
        />
      ) : (
        <div className="space-y-6">
          {visibleInstitutions.map((inst) => (
            <InstitutionSection key={inst.institution.id} data={inst} />
          ))}

          {hiddenAccounts.length > 0 && (
            <details className="group rounded-xl border bg-muted/30 p-4 transition-all">
              <summary className="flex cursor-pointer items-center justify-between font-medium text-xs text-muted-foreground hover:text-foreground">
                <span>Ocultas ({hiddenAccounts.length})</span>
                <span className="text-[11px] group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="mt-3 flex flex-col gap-2.5">
                {hiddenAccounts.map((acc) => {
                  if (acc.type === 'credit_card') {
                    return <CardAccountRow key={acc.id} account={acc} />;
                  }
                  return <AccountRow key={acc.id} account={acc} />;
                })}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

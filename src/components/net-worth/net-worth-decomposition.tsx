import * as React from 'react';
import Link from 'next/link';
import { Section } from '@/components/layout/section';
import { Money } from '@/components/format/money';
import type { NetWorthOverview } from '@/server/queries/net-worth';

type NetWorthDecompositionProps = {
  current: NetWorthOverview['current'];
  byInstitution: NetWorthOverview['byInstitution'];
};

export function NetWorthDecomposition({ current, byInstitution }: NetWorthDecompositionProps) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      {/* Coluna 1 — Composição de Ativos vs Passivos em Section */}
      <Section title="Composição de Ativos vs Passivos">
        <div className="space-y-6">
          {/* Seção de Ativos */}
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ativos (Bens e Direitos)
            </span>
            <div className="divide-y divide-border/40 text-sm">
              <div className="flex items-center justify-between py-2">
                <Link
                  href="/contas"
                  className="text-foreground hover:underline"
                >
                  Contas correntes, poupança e carteira
                </Link>
                <Money cents={current.cashAccountsCents} className="shrink-0 whitespace-nowrap pl-3" />
              </div>
              <div className="flex items-center justify-between py-2">
                <Link
                  href="/investimentos"
                  className="text-foreground hover:underline"
                >
                  Investimentos
                </Link>
                <Money cents={current.investmentsCents} />
              </div>
              <div className="flex items-center justify-between py-2 font-medium">
                <span className="text-muted-foreground">Total de Ativos</span>
                <Money cents={current.assetsCents} className="font-semibold text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </div>

          {/* Seção de Passivos / Dívidas */}
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Passivos (Compromissos e Dívidas)
            </span>
            <div className="divide-y divide-border/40 text-sm">
              <div className="flex items-center justify-between py-2">
                <Link
                  href="/faturas"
                  className="text-foreground hover:underline"
                >
                  (-) Faturas abertas e fechadas não pagas
                </Link>
                <Money cents={-current.openInvoicesCents} signed colored className="shrink-0 whitespace-nowrap pl-3" />
              </div>
              <div className="flex items-center justify-between py-2">
                <Link
                  href="/faturas"
                  className="text-foreground hover:underline"
                >
                  (-) Parcelas futuras projetadas
                </Link>
                <Money cents={-current.futureInstallmentsCents} signed colored className="shrink-0 whitespace-nowrap pl-3" />
              </div>
              <div className="flex items-center justify-between py-2 font-medium">
                <span className="text-muted-foreground">Total de Passivos</span>
                <Money cents={-current.liabilitiesCents} signed colored className="font-semibold" />
              </div>
            </div>
          </div>

          {/* Linha final de Patrimônio Líquido */}
          <div className="flex items-center justify-between border-t border-border/60 pt-4">
            <span className="font-semibold text-foreground">Patrimônio Líquido</span>
            <Money
              cents={current.netWorthCents}
              className="text-lg font-bold sm:text-xl text-foreground"
            />
          </div>
        </div>
      </Section>

      {/* Coluna 2 — Patrimônio por Instituição em Section */}
      <Section
        title="Patrimônio por Instituição"
        description={`${byInstitution.length} ${byInstitution.length === 1 ? 'instituição' : 'instituições'}`}
      >
        {byInstitution.length === 0 ? (
          <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
            Nenhuma instituição cadastrada
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {byInstitution.map((inst) => {
              const totalAssets = inst.cashCents + inst.investmentsCents;
              return (
                <div key={inst.institutionId} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: inst.color }}
                      />
                      {inst.name}
                    </span>
                    <Money cents={inst.netCents} className="font-semibold" />
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground pl-4.5">
                    <span>
                      Ativos: <Money cents={totalAssets} className="text-xs text-muted-foreground font-normal" />
                    </span>
                    {inst.liabilitiesCents > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        Dívidas: <Money cents={inst.liabilitiesCents} className="text-xs text-amber-600 dark:text-amber-400 font-normal" />
                      </span>
                    ) : (
                      <span>Sem dívidas</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

import * as React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { getDb } from '@/server/db/client';
import { getCashFlowProjection } from '@/server/queries/cashflow';
import { PageHeader } from '@/components/layout/page-header';
import { CashFlowSummaryCards } from '@/components/cashflow/cashflow-summary-cards';
import { CashFlowProjectionChart } from '@/components/cashflow/cashflow-projection-chart';
import { CashFlowBreakdownTable } from '@/components/cashflow/cashflow-breakdown-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/format/money';
import { formatMonthBR } from '@/server/domain/dates';

export const dynamic = 'force-dynamic';

export default async function ProjecaoPage() {
  const db = getDb();
  const projection = await getCashFlowProjection(db);

  const hasDeficit = projection.lowestProjectedBalanceCents < 0;
  const bandBreachMonth = projection.points.find((p) => p.lowerBandCents < 0)?.month;
  const bandBreachLabel = bandBreachMonth
    ? formatMonthBR(`${bandBreachMonth}-01`)
    : 'no período';
  const lowestMonthLabel = projection.lowestBalanceMonth
    ? formatMonthBR(`${projection.lowestBalanceMonth}-01`)
    : 'no período';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projeção de fluxo de caixa"
        description="Antecipe seu saldo financeiro para os próximos 6 meses com base em receitas recorrentes, despesas fixas e parcelas de cartão."
      />

      {/* Alerta em destaque caso haja risco de déficit ou saldo negativo */}
      {projection.hasDeficitRisk && (
        <Alert
          variant={hasDeficit ? 'destructive' : 'default'}
          className={
            !hasDeficit
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200'
              : undefined
          }
        >
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {hasDeficit
              ? 'Risco de saldo negativo identificado'
              : 'Atenção à faixa de incerteza da projeção'}
          </AlertTitle>
          <AlertDescription>
            {hasDeficit ? (
              <>
                O saldo projetado esperado atinge valor negativo em{' '}
                <strong>{lowestMonthLabel}</strong> (
                <Money cents={projection.lowestProjectedBalanceCents} className="font-semibold" />
                ). Avalie reduzir despesas fixas ou antecipar receitas para evitar saldo devedor.
              </>
            ) : (
              <>
                Embora o saldo médio esperado se mantenha positivo, a faixa inferior de incerteza (± 1,96σ)
                cruza o limite de zero já em <strong>{bandBreachLabel}</strong>. Acompanhe os gastos
                variáveis de perto.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Cards de resumo executivo */}
      <CashFlowSummaryCards projection={projection} />

      {/* Gráfico interativo com curva central e faixa sombreada de incerteza */}
      <CashFlowProjectionChart projection={projection} />

      {/* Tabela de composição mês a mês */}
      <CashFlowBreakdownTable points={projection.points} />

      {/* Nota metodológica explicativa */}
      <Card className="bg-muted/30 border-muted">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Info className="size-3.5" />
            Como a projeção é calculada
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1.5">
          <p>
            • <strong>Saldo inicial:</strong> Soma dos saldos de contas de caixa líquidas (corrente, poupança, carteira e benefícios) marcadas para inclusão nos totais.
          </p>
          <p>
            • <strong>Receitas e despesas fixas:</strong> Contratos ativos cadastrados na central de assinaturas e recorrências (cada ocorrência entra na data prevista, a partir da última cobrança; as anuais e trimestrais caem só no mês certo).
          </p>
          <p>
            • <strong>Cartão de crédito e parcelas:</strong> Faturas não pagas entram no mês do vencimento (regime de caixa), junto com as parcelas futuras já compromissadas. O que ainda vence neste mês entra no primeiro mês projetado.
          </p>
          <p>
            • <strong>Gastos variáveis e incerteza:</strong> Média móvel dos últimos 3 meses cheios (excluindo fixos e compras parceladas para evitar duplicidade). A faixa sombreada reflete 95% de confiança estatística com dispersão proporcional ao tempo (&plusmn; 1,96&sigma; &times; &radic;m).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

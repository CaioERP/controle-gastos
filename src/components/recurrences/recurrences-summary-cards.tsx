import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/format/money';
import { cn } from '@/lib/utils';

type RecurrencesSummaryCardsProps = {
  monthlyTotalCents: number;
  yearlyTotalCents: number;
  activeCount: number;
  priceHikesCount: number;
};

export function RecurrencesSummaryCards({
  monthlyTotalCents,
  yearlyTotalCents,
  activeCount,
  priceHikesCount,
}: RecurrencesSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Compromisso Mensal Fixo */}
      <Card size="sm" className="min-w-0" data-testid="kpi-mensal-fixo">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Compromisso Mensal Fixo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Money cents={monthlyTotalCents} className="block text-xl font-semibold sm:text-2xl" />
          <p className="text-xs text-muted-foreground">Total estimado por mês</p>
        </CardContent>
      </Card>

      {/* 2. Total Anual Estimado */}
      <Card size="sm" className="min-w-0" data-testid="kpi-anual-estimado">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Anual Estimado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Money cents={yearlyTotalCents} className="block text-xl font-semibold sm:text-2xl" />
          <p className="text-xs text-muted-foreground">Projeção em 12 meses</p>
        </CardContent>
      </Card>

      {/* 3. Assinaturas Ativas */}
      <Card size="sm" className="min-w-0" data-testid="kpi-assinaturas-ativas">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Assinaturas Ativas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <span className="block text-xl font-semibold tabular-nums sm:text-2xl text-foreground">
            {activeCount}
          </span>
          <p className="text-xs text-muted-foreground">
            {activeCount === 1 ? '1 assinatura ativa' : `${activeCount} assinaturas ativas`}
          </p>
        </CardContent>
      </Card>

      {/* 4. Aumentos Recentes */}
      <Card size="sm" className="min-w-0" data-testid="kpi-aumentos-recentes">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Aumentos Recentes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <span
            className={cn(
              'block text-xl font-semibold tabular-nums sm:text-2xl',
              priceHikesCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
            )}
          >
            {priceHikesCount}
          </span>
          <p className="text-xs text-muted-foreground">
            {priceHikesCount === 1 ? '1 aumento identificado' : `${priceHikesCount} aumentos identificados`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

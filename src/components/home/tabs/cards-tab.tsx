import * as React from 'react';
import { CreditCard } from 'lucide-react';
import { PeriodOnlyBar } from '@/components/home/period-only-bar';
import { EmptyState } from '@/components/states/empty-state';

export type CardsTabProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export async function CardsTab(props: CardsTabProps = {}) {
  void props;
  return (
    <div className="space-y-4">
      <PeriodOnlyBar />
      <EmptyState
        icon={CreditCard}
        title="Em breve"
        description="A visão detalhada de cartões e faturas estará disponível em breve."
      />
    </div>
  );
}

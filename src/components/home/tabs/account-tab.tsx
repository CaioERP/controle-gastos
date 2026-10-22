import * as React from 'react';
import { Landmark } from 'lucide-react';
import { PeriodOnlyBar } from '@/components/home/period-only-bar';
import { EmptyState } from '@/components/states/empty-state';

export type AccountTabProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export async function AccountTab(props: AccountTabProps = {}) {
  void props;
  return (
    <div className="space-y-4">
      <PeriodOnlyBar />
      <EmptyState
        icon={Landmark}
        title="Em breve"
        description="A visão detalhada de contas estará disponível em breve."
      />
    </div>
  );
}

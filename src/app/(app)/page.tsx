import Link from 'next/link';
import { PlugZap } from 'lucide-react';
import { getDb } from '@/server/db/client';
import { getRequestAccountsOverview } from '@/server/queries/request-cache';
import { getAttentionItems } from '@/server/home/attention';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { AttentionStrip } from '@/components/home/attention-strip';
import { HomeTabs, type HomeTab } from '@/components/home/home-tabs';
import { PeriodOnlyBar } from '@/components/home/period-only-bar';
import { OverviewTab } from '@/components/home/tabs/overview-tab';
import { AccountTab } from '@/components/home/tabs/account-tab';
import { CardsTab } from '@/components/home/tabs/cards-tab';

export const dynamic = 'force-dynamic';

const DEFAULT_TAB: HomeTab = 'conta';

const VALID_TABS = new Set<HomeTab>(['conta', 'cartoes', 'geral']);

function isValidTab(tab: unknown): tab is HomeTab {
  return typeof tab === 'string' && VALID_TABS.has(tab as HomeTab);
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams;
  const rawTab = typeof sp.aba === 'string' ? sp.aba : undefined;
  const tab: HomeTab = isValidTab(rawTab) ? rawTab : DEFAULT_TAB;

  const db = getDb();
  const overview = await getRequestAccountsOverview();
  const attention = await getAttentionItems(db, { overview });

  if (overview.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Início" description="Visão consolidada das suas finanças." />
        <EmptyState
          icon={PlugZap}
          title="Conecte seu primeiro banco"
          description="Assim que houver uma conta conectada, seus gastos, saldos e faturas aparecem aqui."
          action={
            <Link href="/conexoes" className={buttonVariants()}>
              Conectar banco
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Início"
        description="Visão consolidada do período, por categoria e forma de pagamento."
        className="hidden md:block"
      />

      {/* Desktop: Precisa de você abaixo do cabeçalho */}
      <AttentionStrip items={attention} mode="desktop-only" />

      {/* Abas e período na mesma linha */}
      <div className="flex items-center justify-between gap-2">
        <HomeTabs active={tab} className="flex-1 md:flex-initial" />
        <PeriodOnlyBar compact className={tab === 'geral' ? 'md:hidden' : undefined} />
      </div>

      {/* Celular: se não for a aba conta, mostra o Precisa de você aqui no topo */}
      {tab !== 'conta' && <AttentionStrip items={attention} mode="mobile-only" />}

      {tab === 'geral' && <OverviewTab searchParams={sp} />}
      {tab === 'conta' && <AccountTab searchParams={sp} attention={attention} />}
      {tab === 'cartoes' && <CardsTab searchParams={sp} />}
    </div>
  );
}

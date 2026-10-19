import { CreditCard } from 'lucide-react';
import { getDb } from '@/server/db/client';
import { today } from '@/server/domain/dates';
import { getAccountsOverview } from '@/server/queries/accounts';
import { getFutureInstallments } from '@/server/queries/installments';
import { getInvoiceExtras } from '@/server/queries/invoice-extras';
import { getInvoiceItems, getInvoices } from '@/server/queries/invoices';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { CardSelector, type CardOption } from '@/components/invoices/card-selector';
import { InvoiceTimeline } from '@/components/invoices/invoice-timeline';
import { InvoiceDetail } from '@/components/invoices/invoice-detail';
import { FutureInstallmentsChart } from '@/components/invoices/future-installments-chart';
import { fillInstallmentMonths, invoiceParam, pickDefaultInvoice } from '@/components/invoices/invoice-summary';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function single(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function FaturasPage({ searchParams }: Props) {
  const params = await searchParams;
  const db = getDb();
  const todayStr = today();

  const institutions = await getAccountsOverview(db, { includeHidden: true });
  const requestedCard = single(params.cartao);
  // Cartões ocultos só aparecem quando a URL aponta para eles (ex.: "Ver faturas" da tela de contas)
  const cards: CardOption[] = institutions.flatMap((inst) =>
    inst.accounts
      .filter((a) => a.type === 'credit_card' && (!a.isHidden || a.id === requestedCard))
      .map((a) => ({
        id: a.id,
        name: a.displayName ?? a.name,
        institutionName: inst.institution.name,
        institutionColor: inst.institution.color,
      })),
  );

  const header = (
    <PageHeader title="Faturas" description="Faturas abertas, fechadas e parcelamentos futuros de cartões." />
  );

  if (cards.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={CreditCard}
          title="Nenhum cartão de crédito"
          description="Conecte uma conta de cartão para acompanhar as faturas aqui."
        />
      </div>
    );
  }

  const card = cards.find((c) => c.id === requestedCard) ?? cards[0]!;
  const [invoices, cardInstallments, allInstallments] = await Promise.all([
    getInvoices(db, card.id),
    getFutureInstallments(db, { accountIds: [card.id] }),
    getFutureInstallments(db, { accountIds: cards.map((c) => c.id) }),
  ]);

  const requestedInvoice = single(params.fatura);
  const invoice =
    invoices.find((i) => invoiceParam(i.referenceMonth) === requestedInvoice) ??
    pickDefaultInvoice(invoices, todayStr);

  const [items, extras] = invoice
    ? await Promise.all([getInvoiceItems(db, invoice.id), getInvoiceExtras(db, invoice.id)])
    : [[], null];

  return (
    <div className="space-y-6">
      {header}
      <CardSelector cards={cards} selectedId={card.id} />

      {invoice ? (
        <>
          <InvoiceTimeline cardId={card.id} invoices={invoices} selectedId={invoice.id} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <InvoiceDetail invoice={invoice} extras={extras} items={items} />
            <div>
              <FutureInstallmentsChart
                card={fillInstallmentMonths(cardInstallments, todayStr)}
                all={fillInstallmentMonths(allInstallments, todayStr)}
                cardName={card.name}
                cardColor={card.institutionColor}
              />
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          icon={CreditCard}
          title="Nenhuma fatura neste cartão"
          description="As faturas aparecem aqui depois da primeira sincronização com compras no cartão."
        />
      )}
    </div>
  );
}

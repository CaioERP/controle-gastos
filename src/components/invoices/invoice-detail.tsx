import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DateBR } from '@/components/format/date-br';
import { Money } from '@/components/format/money';
import { EmptyState } from '@/components/states/empty-state';
import { formatDateBR } from '@/server/domain/dates';
import { INVOICE_STATUS_LABELS } from '@/server/domain/labels';
import type { InvoiceSummary } from '@/server/queries/invoices';
import type { InvoiceExtras } from '@/server/queries/invoice-extras';
import type { TransactionRow } from '@/server/queries/transaction-row';
import { cn } from '@/lib/utils';
import {
  formatMonthShort,
  groupItemsByDate,
  invoiceItemValue,
  isForecastInvoice,
  sumInvoiceItems,
  topCategories,
} from './invoice-summary';

type InvoiceDetailProps = {
  invoice: InvoiceSummary;
  extras: InvoiceExtras | null;
  items: TransactionRow[];
  /** Nome da categoria raiz → cor (de listCategories), para a mini-barra agregar com a cor do pai. */
  rootColors: ReadonlyMap<string, string>;
};

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

export function InvoiceDetail({ invoice, extras, items, rootColors }: InvoiceDetailProps) {
  const forecast = isForecastInvoice(invoice);
  const itemsTotal = sumInvoiceItems(items);
  const shares = topCategories(items, rootColors);
  const sharesTotal = shares.reduce((s, c) => s + c.totalCents, 0);
  const groups = groupItemsByDate(items);

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            Fatura de {formatMonthShort(invoice.referenceMonth)}
          </CardTitle>
          {forecast ? (
            <Badge variant="outline" className="border-dashed">
              Prevista
            </Badge>
          ) : (
            <Badge variant="secondary">{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total">
            <Money cents={invoice.totalCents} className="text-lg" data-testid="invoice-total" />
          </Stat>
          <Stat label="Fechamento">
            <DateBR date={invoice.closingDate} />
          </Stat>
          <Stat label="Vencimento">
            <DateBR date={invoice.dueDate} />
          </Stat>
          {extras?.minimumPaymentCents != null && (
            <Stat label="Pagamento mínimo">
              <Money cents={extras.minimumPaymentCents} />
            </Stat>
          )}
          {extras?.payment && (
            <Stat label="Pagamento">
              <Money cents={extras.payment.amountCents} /> em <DateBR date={extras.payment.date} />
            </Stat>
          )}
        </dl>
        {forecast && (
          <p className="text-xs text-muted-foreground">
            Esta fatura ainda não existe no banco: mostra só as parcelas futuras já previstas.
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <EmptyState title="Fatura sem lançamentos" description="Nenhuma compra foi registrada nesta fatura." />
        ) : (
          <>
            {sharesTotal > 0 && (
              <div className="space-y-2">
                <div
                  role="img"
                  aria-label={`Maiores categorias da fatura: ${shares
                    .map((s) => `${s.label} ${Math.round((s.totalCents / sharesTotal) * 100)}%`)
                    .join(', ')}`}
                  className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
                >
                  {shares.map((s) => (
                    <div
                      key={s.key}
                      title={s.label}
                      style={{ width: `${(s.totalCents / sharesTotal) * 100}%`, backgroundColor: s.color }}
                    />
                  ))}
                </div>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {shares.map((s) => (
                    <li key={s.key} className="flex items-center gap-1.5">
                      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-muted-foreground">{s.label}</span>
                      <Money cents={s.totalCents} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-4" data-testid="invoice-items">
              {groups.map((g) => (
                <section key={g.date} aria-label={`Compras de ${formatDateBR(g.date)}`}>
                  <div className="flex items-center justify-between border-b pb-1 text-xs text-muted-foreground">
                    <DateBR date={g.date} />
                    <Money cents={g.totalCents} className="font-normal" />
                  </div>
                  <ul className="divide-y">
                    {g.items.map((t) => {
                      const projected = t.status === 'projected';
                      return (
                        <li
                          key={t.id}
                          data-testid="invoice-item"
                          data-status={t.status}
                          className={cn('flex items-start justify-between gap-3 py-2', projected && 'italic text-muted-foreground')}
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5 text-sm">
                              <span className="truncate">{t.description}</span>
                              {t.installment && (
                                <Badge variant="outline" className="h-4 px-1 text-[10px] not-italic tabular-nums">
                                  {t.installment.number}/{t.installment.total}
                                </Badge>
                              )}
                              {projected && <span className="text-[10px]">(prevista)</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground not-italic">
                              {t.category ? (
                                <span className="flex items-center gap-1">
                                  <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: t.category.color }} />
                                  {t.category.parentName ? `${t.category.parentName} › ` : ''}
                                  {t.category.name}
                                </span>
                              ) : (
                                <span>Sem categoria</span>
                              )}
                              {t.card && (
                                <span>
                                  · cartão •{t.card.last4}
                                  {t.card.isVirtual ? ' virtual' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                          <Money
                            cents={invoiceItemValue(t)}
                            className={cn('shrink-0 text-sm', invoiceItemValue(t) < 0 && 'text-emerald-600 dark:text-emerald-400')}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">
                Soma dos {items.length} {items.length === 1 ? 'item' : 'itens'}
              </span>
              <Money cents={itemsTotal} data-testid="invoice-items-sum" />
            </div>
            {itemsTotal !== invoice.totalCents && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                A soma dos itens difere do total informado pelo banco (diferença de{' '}
                <Money cents={invoice.totalCents - itemsTotal} />
                ).
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

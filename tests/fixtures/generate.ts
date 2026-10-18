import type { CategorySource, PaymentMethod, TxKind, TxStatus } from '@/server/domain/enums';
import { addDaysISO, addMonthsISO, monthEnd, monthStart } from '@/server/domain/dates';
import { getInvoiceCycle } from '@/server/domain/invoice-cycle';
import { MERCHANTS } from './catalog';
import { createRng } from './random';

export type FixtureOptions = {
  referenceDate: string;
  months: number;
  seed: number;
};

export type FixtureAccount = {
  key: string;
  institutionSlug: string;
  type: 'checking' | 'credit_card';
  name: string;
  closingDay?: number;
  dueDay?: number;
  creditLimitCents?: number;
  cards?: Array<{ last4: string; name: string; isVirtual?: boolean }>;
};

export type FixtureInvoice = {
  key: string;
  accountKey: string;
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
  totalCents: number;
  status: 'open' | 'closed' | 'paid' | 'overdue';
};

export type FixtureTransaction = {
  accountKey: string;
  cardLast4?: string;
  invoiceKey?: string;
  date: string;
  amountCents: number;
  description: string;
  descriptionRaw: string;
  merchantName?: string;
  kind: TxKind;
  paymentMethod: PaymentMethod;
  status: TxStatus;
  categorySlug?: string | null;
  needsReview: boolean;
  installment?: {
    groupKey: string;
    number: number;
    total: number;
  };
  transferKey?: string;
  categorySource?: CategorySource;
  categoryConfidence?: number | null;
};

export type FixtureData = {
  accounts: FixtureAccount[];
  invoices: FixtureInvoice[];
  transactions: FixtureTransaction[];
};

export function generateFixtures(opts: FixtureOptions): FixtureData {
  const rng = createRng(opts.seed);
  const accounts: FixtureAccount[] = [
    {
      key: 'itau-cc',
      institutionSlug: 'itau',
      type: 'checking',
      name: 'Itaú CC',
    },
    {
      key: 'itau-click',
      institutionSlug: 'itau',
      type: 'credit_card',
      name: 'Itaú Click',
      closingDay: 3,
      dueDay: 10,
      creditLimitCents: 800000,
      cards: [{ last4: '9876', name: 'Itaú Click' }],
    },
    {
      key: 'itau-personnalite',
      institutionSlug: 'itau',
      type: 'credit_card',
      name: 'Itaú Personnalité',
      closingDay: 25,
      dueDay: 5,
      creditLimitCents: 1500000,
      cards: [{ last4: '4321', name: 'Itaú Personnalité' }],
    },
    {
      key: 'nubank-conta',
      institutionSlug: 'nubank',
      type: 'checking',
      name: 'Nubank Conta',
    },
    {
      key: 'nubank-card',
      institutionSlug: 'nubank',
      type: 'credit_card',
      name: 'Nubank',
      closingDay: 28,
      dueDay: 7,
      creditLimitCents: 600000,
      cards: [
        { last4: '1234', name: 'Físico', isVirtual: false },
        { last4: '5678', name: 'Virtual', isVirtual: true },
      ],
    },
    {
      key: 'mp-conta',
      institutionSlug: 'mercado-pago',
      type: 'checking',
      name: 'Mercado Pago Conta',
    },
    {
      key: 'mp-card',
      institutionSlug: 'mercado-pago',
      type: 'credit_card',
      name: 'Mercado Pago',
      closingDay: 15,
      dueDay: 22,
      creditLimitCents: 300000,
      cards: [{ last4: '9999', name: 'Mercado Pago' }],
    },
  ];

  const transactions: FixtureTransaction[] = [];
  const creditAccounts = accounts.filter((a) => a.type === 'credit_card');

  // Gerar meses de trás para frente até referenceDate
  const refMonthStart = monthStart(opts.referenceDate);
  const monthsList: string[] = [];
  for (let i = opts.months - 1; i >= 0; i--) {
    monthsList.push(monthStart(addMonthsISO(refMonthStart, -i)));
  }

  // Saldo inicial de cada conta corrente no primeiro dia do período (cobre a natureza 'adjustment')
  const periodStart = monthsList[0]!;
  const openingBalances: Array<[string, number]> = [
    ['itau-cc', 500000],
    ['nubank-conta', 200000],
    ['mp-conta', 150000],
  ];
  for (const [accountKey, cents] of openingBalances) {
    transactions.push({
      accountKey,
      date: periodStart,
      amountCents: cents,
      description: 'Saldo inicial',
      descriptionRaw: 'SALDO ANTERIOR',
      kind: 'adjustment',
      paymentMethod: 'other',
      status: 'posted',
      needsReview: false,
    });
  }

  // Eventos mensais regulares
  for (const mStart of monthsList) {
    const monthPrefix = mStart.slice(0, 7);
    const lastDayOfMonth = Number(monthEnd(mStart).slice(8, 10));

    // 1. Salário (dia 5) no Itaú CC (+R$ 8.500,00)
    const salDate = `${monthPrefix}-05`;
    if (salDate <= opts.referenceDate) {
      transactions.push({
        accountKey: 'itau-cc',
        date: salDate,
        amountCents: 850000,
        description: 'Salário',
        descriptionRaw: 'TED RECEBIDA SALARIO EMPRESA S/A',
        kind: 'income',
        paymentMethod: 'ted_doc',
        status: 'posted',
        categorySlug: 'salario',
        needsReview: false,
      });
    }

    // 2. Aluguel (dia 10) no Itaú CC (-R$ 2.200,00)
    const aluguelDate = `${monthPrefix}-10`;
    if (aluguelDate <= opts.referenceDate) {
      transactions.push({
        accountKey: 'itau-cc',
        date: aluguelDate,
        amountCents: -220000,
        description: 'Aluguel Apartamento',
        descriptionRaw: 'PIX TRANSF IMOBILIARIA NOVA VIDA LTDA',
        kind: 'expense',
        paymentMethod: 'pix',
        status: 'posted',
        categorySlug: 'moradia-aluguel',
        needsReview: false,
      });
    }

    // 3. Energia (dia 15) no Itaú CC (-R$ 180 a 260)
    const energiaDate = `${monthPrefix}-15`;
    if (energiaDate <= opts.referenceDate) {
      transactions.push({
        accountKey: 'itau-cc',
        date: energiaDate,
        amountCents: -rng.centsBetween(180, 260),
        description: 'Conta de Energia',
        descriptionRaw: 'PAGTO BOLETO ELEKTRO ELETRICIDADE',
        kind: 'expense',
        paymentMethod: 'boleto',
        status: 'posted',
        categorySlug: 'moradia-energia',
        needsReview: false,
      });
    }

    // 4. Internet (dia 12) na Nubank conta (-R$ 119,90)
    const internetDate = `${monthPrefix}-12`;
    if (internetDate <= opts.referenceDate) {
      transactions.push({
        accountKey: 'nubank-conta',
        date: internetDate,
        amountCents: -11990,
        description: 'Internet Fibra',
        descriptionRaw: 'DEB AUT CLARO FIBRA 500M',
        kind: 'expense',
        paymentMethod: 'direct_debit',
        status: 'posted',
        categorySlug: 'moradia-internet-telefone',
        needsReview: false,
      });
    }

    // 5. Transferência Itaú → Nubank (dia 6, R$ 1.500,00)
    const transfDate = `${monthPrefix}-06`;
    if (transfDate <= opts.referenceDate) {
      const transferKey = `transf-itau-nu-${monthPrefix}`;
      transactions.push({
        accountKey: 'itau-cc',
        date: transfDate,
        amountCents: -150000,
        description: 'Transferência para Nubank',
        descriptionRaw: 'PIX ENVIADO MESMA TITULARIDADE NUBANK',
        kind: 'transfer',
        paymentMethod: 'pix',
        status: 'posted',
        needsReview: false,
        transferKey,
      });
      transactions.push({
        accountKey: 'nubank-conta',
        date: transfDate,
        amountCents: 150000,
        description: 'Transferência recebida do Itaú',
        descriptionRaw: 'PIX RECEBIDO MESMA TITULARIDADE ITAU',
        kind: 'transfer',
        paymentMethod: 'pix',
        status: 'posted',
        needsReview: false,
        transferKey,
      });
    }

    // 5b. Transferência Itaú → Mercado Pago (dia 8, R$ 700,00), que paga a fatura do cartão MP
    const transfMpDate = `${monthPrefix}-08`;
    if (transfMpDate <= opts.referenceDate) {
      const transferKey = `transf-itau-mp-${monthPrefix}`;
      transactions.push({
        accountKey: 'itau-cc',
        date: transfMpDate,
        amountCents: -70000,
        description: 'Transferência para Mercado Pago',
        descriptionRaw: 'PIX ENVIADO MESMA TITULARIDADE MERCADO PAGO',
        kind: 'transfer',
        paymentMethod: 'pix',
        status: 'posted',
        needsReview: false,
        transferKey,
      });
      transactions.push({
        accountKey: 'mp-conta',
        date: transfMpDate,
        amountCents: 70000,
        description: 'Transferência recebida do Itaú',
        descriptionRaw: 'PIX RECEBIDO MESMA TITULARIDADE ITAU',
        kind: 'transfer',
        paymentMethod: 'pix',
        status: 'posted',
        needsReview: false,
        transferKey,
      });
    }

    // 6. Aporte em investimento (dia 7, -R$ 1.000,00)
    const invDate = `${monthPrefix}-07`;
    if (invDate <= opts.referenceDate) {
      transactions.push({
        accountKey: 'itau-cc',
        date: invDate,
        amountCents: -100000,
        description: 'Aporte Tesouro Direto',
        descriptionRaw: 'TED ENVIADA XP INVESTIMENTOS CCT',
        kind: 'investment',
        paymentMethod: 'ted_doc',
        status: 'posted',
        needsReview: false,
      });
    }

    // 7. Tarifa de conta (dia 1, -R$ 24,90)
    const tarifaDate = `${monthPrefix}-01`;
    if (tarifaDate <= opts.referenceDate) {
      transactions.push({
        accountKey: 'itau-cc',
        date: tarifaDate,
        amountCents: -2490,
        description: 'Tarifa Pacote Serviços',
        descriptionRaw: 'TAR PACOTE MENSAL ITAU',
        kind: 'expense',
        paymentMethod: 'account_fee',
        status: 'posted',
        categorySlug: 'impostos-taxas',
        needsReview: false,
      });
    }

    // 8. Assinaturas recorrentes (todo mês no mesmo dia e mesmo cartão)
    // Netflix (dia 10, Nubank cartão virtual)
    const netflixDate = `${monthPrefix}-10`;
    if (netflixDate <= opts.referenceDate) {
      transactions.push({
        accountKey: 'nubank-card',
        cardLast4: '5678',
        date: netflixDate,
        amountCents: -5590,
        description: 'Netflix',
        descriptionRaw: 'NETFLIX.COM',
        merchantName: 'Netflix',
        kind: 'expense',
        paymentMethod: 'credit_card_single',
        status: 'posted',
        categorySlug: 'lazer-streaming',
        needsReview: false,
      });
    }

    // Spotify (dia 18, Itaú Click)
    const spotifyDate = `${monthPrefix}-18`;
    if (spotifyDate <= opts.referenceDate) {
      transactions.push({
        accountKey: 'itau-click',
        cardLast4: '9876',
        date: spotifyDate,
        amountCents: -2190,
        description: 'Spotify',
        descriptionRaw: 'SPOTIFY',
        merchantName: 'Spotify',
        kind: 'expense',
        paymentMethod: 'credit_card_single',
        status: 'posted',
        categorySlug: 'lazer-streaming',
        needsReview: false,
      });
    }

    // Smart Fit (dia 22, Itaú Personnalité)
    const smartFitDate = `${monthPrefix}-22`;
    if (smartFitDate <= opts.referenceDate) {
      transactions.push({
        accountKey: 'itau-personnalite',
        cardLast4: '4321',
        date: smartFitDate,
        amountCents: -11990,
        description: 'Smart Fit',
        descriptionRaw: 'SMARTFIT',
        merchantName: 'Smart Fit',
        kind: 'expense',
        paymentMethod: 'credit_card_single',
        status: 'posted',
        categorySlug: 'saude-academia',
        needsReview: false,
      });
    }

    // 9. Compras variadas (25 a 40 compras)
    const comprasCount = rng.int(25, 40);
    for (let c = 0; c < comprasCount; c++) {
      const merchant = rng.pick(MERCHANTS);
      // Evitar duplicar assinaturas aqui
      if (['Netflix', 'Spotify', 'Smart Fit'].includes(merchant.name)) continue;

      const day = rng.int(1, lastDayOfMonth);
      const txDate = `${monthPrefix}-${String(day).padStart(2, '0')}`;
      if (txDate > opts.referenceDate) continue;

      const method = rng.pick(merchant.methods);
      const amountCents = -rng.centsBetween(merchant.min, merchant.max);

      if (method === 'credit_card_single') {
        const cardAcc = rng.pick(creditAccounts);
        let cardLast4 = cardAcc.cards?.[0]?.last4;
        if (cardAcc.key === 'nubank-card') {
          cardLast4 = rng.pick(cardAcc.cards!).last4;
        }
        transactions.push({
          accountKey: cardAcc.key,
          cardLast4,
          date: txDate,
          amountCents,
          description: merchant.name,
          descriptionRaw: merchant.raw,
          merchantName: merchant.name,
          kind: 'expense',
          paymentMethod: 'credit_card_single',
          status: 'posted',
          categorySlug: merchant.category,
          needsReview: false,
        });
      } else if (method === 'debit_card') {
        const accKey = rng.pick(['itau-cc', 'nubank-conta'] as const);
        transactions.push({
          accountKey: accKey,
          date: txDate,
          amountCents,
          description: merchant.name,
          descriptionRaw: merchant.raw,
          merchantName: merchant.name,
          kind: 'expense',
          paymentMethod: 'debit_card',
          status: 'posted',
          categorySlug: merchant.category,
          needsReview: false,
        });
      } else if (method === 'pix') {
        const accKey = rng.pick(['itau-cc', 'nubank-conta', 'mp-conta'] as const);
        transactions.push({
          accountKey: accKey,
          date: txDate,
          amountCents,
          description: merchant.name,
          descriptionRaw: `PIX ${merchant.raw}`,
          merchantName: merchant.name,
          kind: 'expense',
          paymentMethod: 'pix',
          status: 'posted',
          categorySlug: merchant.category,
          needsReview: false,
        });
      }
    }
  }

  // Casos especiais:
  // Caso 1: Compras parceladas
  // Notebook 10x R$ 450 (Itaú Personnalité, há 4 meses)
  const notebookStartMonth = (monthsList[Math.max(0, monthsList.length - 5)] ?? monthsList[0])!;
  const notebookStartDate = `${notebookStartMonth.slice(0, 7)}-12`;
  for (let n = 1; n <= 10; n++) {
    const pDate = addMonthsISO(notebookStartDate, n - 1);
    const isPosted = pDate <= opts.referenceDate;
    transactions.push({
      accountKey: 'itau-personnalite',
      cardLast4: '4321',
      date: pDate,
      amountCents: -45000,
      description: `Dell Computadores ${n}/10`,
      descriptionRaw: `DELL COMPUTADORES PARC ${String(n).padStart(2, '0')}/10`,
      merchantName: 'Dell',
      kind: 'expense',
      paymentMethod: 'credit_card_installment',
      status: isPosted ? 'posted' : 'projected',
      categorySlug: 'compras-eletronicos',
      needsReview: false,
      installment: {
        groupKey: 'inst-notebook',
        number: n,
        total: 10,
      },
    });
  }

  // Geladeira 12x R$ 320 (Nubank, há 2 meses)
  const geladeiraStartMonth = (monthsList[Math.max(0, monthsList.length - 3)] ?? monthsList[0])!;
  const geladeiraStartDate = `${geladeiraStartMonth.slice(0, 7)}-18`;
  for (let g = 1; g <= 12; g++) {
    const pDate = addMonthsISO(geladeiraStartDate, g - 1);
    const isPosted = pDate <= opts.referenceDate;
    transactions.push({
      accountKey: 'nubank-card',
      cardLast4: '1234',
      date: pDate,
      amountCents: -32000,
      description: `Magazine Luiza ${g}/12`,
      descriptionRaw: `MAGAZINE LUIZA PARC ${String(g).padStart(2, '0')}/12`,
      merchantName: 'Magazine Luiza',
      kind: 'expense',
      paymentMethod: 'credit_card_installment',
      status: isPosted ? 'posted' : 'projected',
      categorySlug: 'compras-casa',
      needsReview: false,
      installment: {
        groupKey: 'inst-geladeira',
        number: g,
        total: 12,
      },
    });
  }

  // Tênis 3x R$ 200 (Mercado Pago, mês passado)
  const tenisStartMonth = (monthsList[Math.max(0, monthsList.length - 2)] ?? monthsList[0])!;
  const tenisStartDate = `${tenisStartMonth.slice(0, 7)}-20`;
  for (let t = 1; t <= 3; t++) {
    const pDate = addMonthsISO(tenisStartDate, t - 1);
    const isPosted = pDate <= opts.referenceDate;
    transactions.push({
      accountKey: 'mp-card',
      cardLast4: '9999',
      date: pDate,
      amountCents: -20000,
      description: `Centauro Esportes ${t}/3`,
      descriptionRaw: `CENTAURO ESPORTES PARC ${String(t).padStart(2, '0')}/03`,
      merchantName: 'Centauro',
      kind: 'expense',
      paymentMethod: 'credit_card_installment',
      status: isPosted ? 'posted' : 'projected',
      categorySlug: 'compras-vestuario',
      needsReview: false,
      installment: {
        groupKey: 'inst-tenis',
        number: t,
        total: 3,
      },
    });
  }

  // Caso 2: 1 estorno (compra de R$ 150 em Amazon e estorno de +R$ 150 5 dias depois)
  const refundMonth = (monthsList[Math.max(0, monthsList.length - 3)] ?? monthsList[0])!;
  const amazonBuyDate = `${refundMonth.slice(0, 7)}-08`;
  const amazonRefundDate = addDaysISO(amazonBuyDate, 5);
  if (amazonRefundDate <= opts.referenceDate) {
    transactions.push({
      accountKey: 'itau-click',
      cardLast4: '9876',
      date: amazonBuyDate,
      amountCents: -15000,
      description: 'Amazon',
      descriptionRaw: 'AMAZON BR',
      merchantName: 'Amazon',
      kind: 'expense',
      paymentMethod: 'credit_card_single',
      status: 'posted',
      categorySlug: 'compras-casa',
      needsReview: false,
    });
    transactions.push({
      accountKey: 'itau-click',
      cardLast4: '9876',
      date: amazonRefundDate,
      amountCents: 15000,
      description: 'Estorno Amazon',
      descriptionRaw: 'ESTORNO AMAZON BR',
      merchantName: 'Amazon',
      kind: 'refund',
      paymentMethod: 'credit_card_single',
      status: 'posted',
      categorySlug: 'compras-casa',
      needsReview: false,
    });
  }

  // Caso 3: 8 transações recentes com category_id = null, needs_review = true, category_source = 'default'
  for (let r = 1; r <= 8; r++) {
    const revDate = addDaysISO(opts.referenceDate, -Math.min(r, 14));
    transactions.push({
      accountKey: 'itau-cc',
      date: revDate,
      amountCents: -rng.centsBetween(20, 150),
      description: `Estabelecimento Desconhecido ${r}`,
      descriptionRaw: `ESTAB DESCONHECIDO ${r} SP BR`,
      kind: 'expense',
      paymentMethod: 'pix',
      status: 'posted',
      categorySlug: null,
      needsReview: true,
    });
  }

  // Caso 4: 2 transações pending nos últimos 2 dias
  transactions.push({
    accountKey: 'nubank-conta',
    date: opts.referenceDate,
    amountCents: -4500,
    description: 'Padaria Manhã Pendente',
    descriptionRaw: 'COMPRA PENDENTE PADARIA',
    kind: 'expense',
    paymentMethod: 'debit_card',
    status: 'pending',
    categorySlug: 'alimentacao-padaria-cafe',
    needsReview: false,
  });
  transactions.push({
    accountKey: 'itau-cc',
    date: addDaysISO(opts.referenceDate, -1),
    amountCents: -3500,
    description: 'Farmácia Tarde Pendente',
    descriptionRaw: 'COMPRA PENDENTE DROGASIL',
    kind: 'expense',
    paymentMethod: 'pix',
    status: 'pending',
    categorySlug: 'saude-farmacia',
    needsReview: false,
  });

  // Origem e confiança das categorias, para exercitar os estados de "sugestão automática" da UI.
  // Distribuição: ~60% merchant, ~25% rule, ~10% llm, ~5% provider.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const reportable = new Set<TxKind>(['expense', 'income', 'refund']);
  let reviewIndex = 0;
  for (const t of transactions) {
    if (!reportable.has(t.kind)) {
      t.categorySource = 'default';
      t.categoryConfidence = null;
      continue;
    }
    if (t.needsReview && !t.categorySlug) {
      // Das transações para revisão: as 4 primeiras sem sugestão, as 4 seguintes com sugestão da IA de baixa confiança
      reviewIndex++;
      if (reviewIndex > 4) {
        t.categorySlug = rng.pick(MERCHANTS).category;
        t.categorySource = 'llm';
        t.categoryConfidence = round2(0.55 + rng.next() * 0.2);
      } else {
        t.categorySource = 'default';
        t.categoryConfidence = null;
      }
      continue;
    }
    if (!t.categorySlug) {
      t.categorySource = 'default';
      t.categoryConfidence = null;
      continue;
    }
    const r = rng.next();
    if (r < 0.6) {
      t.categorySource = 'merchant';
      t.categoryConfidence = 0.95;
    } else if (r < 0.85) {
      t.categorySource = 'rule';
      t.categoryConfidence = 1;
    } else if (r < 0.95) {
      t.categorySource = 'llm';
      t.categoryConfidence = round2(0.6 + rng.next() * 0.35);
      if (t.categoryConfidence < 0.8) t.needsReview = true;
    } else {
      t.categorySource = 'provider';
      t.categoryConfidence = 0.7;
      t.needsReview = true;
    }
  }

  // Faturas e invoiceKeys para transações de cartão
  const invoicesMap = new Map<string, FixtureInvoice>();
  const accountMap = new Map(accounts.map((a) => [a.key, a]));

  for (const tx of transactions) {
    const acc = accountMap.get(tx.accountKey);
    if (!acc || acc.type !== 'credit_card') continue;

    const cycle = getInvoiceCycle(tx.date, acc.closingDay!, acc.dueDay!);
    const invKey = `${acc.key}-${cycle.referenceMonth}`;
    tx.invoiceKey = invKey;

    if (!invoicesMap.has(invKey)) {
      invoicesMap.set(invKey, {
        key: invKey,
        accountKey: acc.key,
        referenceMonth: cycle.referenceMonth,
        closingDate: cycle.closingDate,
        dueDate: cycle.dueDate,
        totalCents: 0,
        status: 'open',
      });
    }
  }

  // Calcular totalCents e status de cada fatura
  for (const inv of invoicesMap.values()) {
    let sum = 0;
    const invTxs = transactions.filter((t) => t.invoiceKey === inv.key);
    for (const t of invTxs) {
      if (t.kind === 'refund') {
        sum -= Math.abs(t.amountCents);
      } else {
        sum += Math.abs(t.amountCents);
      }
    }
    inv.totalCents = Math.max(0, sum);

    if (inv.dueDate < opts.referenceDate) {
      inv.status = 'paid';
    } else if (inv.closingDate < opts.referenceDate && opts.referenceDate <= inv.dueDate) {
      inv.status = 'closed';
    } else {
      inv.status = 'open';
    }
  }

  // Gerar pagamentos de fatura para faturas 'paid'
  for (const inv of invoicesMap.values()) {
    if (inv.status !== 'paid' || inv.totalCents === 0) continue;

    let payingAcc = 'itau-cc';
    if (inv.accountKey === 'nubank-card') payingAcc = 'nubank-conta';
    if (inv.accountKey === 'mp-card') payingAcc = 'mp-conta';

    transactions.push({
      accountKey: payingAcc,
      date: inv.dueDate,
      amountCents: -inv.totalCents,
      description: `Pagamento de fatura ${inv.accountKey}`,
      descriptionRaw: `PAGTO TITULO FATURA ${inv.accountKey.toUpperCase()}`,
      kind: 'invoice_payment',
      paymentMethod: 'boleto',
      status: 'posted',
      needsReview: false,
      invoiceKey: inv.key,
    });
  }

  return {
    accounts,
    invoices: Array.from(invoicesMap.values()),
    transactions,
  };
}

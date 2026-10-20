import { categorizeTransactions } from '@/server/categorization/engine';
import { categorizeWithLlm } from '@/server/categorization/llm';
import type { Db } from '@/server/db/client';
import { runInstallmentsPipelineStep } from './installments';
import { runInvoicesPipelineStep } from './invoices';
import type { RawInvoice } from './types';

export type PipelineContext = {
  db: Db;
  transactionIds: string[];
  accountIds: string[];
  connectionId: string | null;
  stats: Record<string, number>;
  invoicesByAccount?: Record<string, RawInvoice[]>;
  today?: string;
};

export type PipelineStep = {
  name: string;
  run: (ctx: PipelineContext) => Promise<void>;
};

/** Ordem importa: faturas → parcelas → natureza → categorização. As tarefas A1-04..A1-07 acrescentam seus passos aqui. */
export const PIPELINE_STEPS: PipelineStep[] = [
  {
    name: 'invoices',
    run: runInvoicesPipelineStep,
  },
  {
    name: 'installments',
    run: runInstallmentsPipelineStep,
  },
  {
    name: 'categorize',
    run: async (ctx) => {
      await categorizeTransactions(ctx.db, ctx.transactionIds, { llm: categorizeWithLlm });
    },
  },
];

export async function runPipeline(ctx: PipelineContext, steps = PIPELINE_STEPS): Promise<void> {
  for (const step of steps) {
    try {
      await step.run(ctx);
    } catch (err) {
      ctx.stats[`error:${step.name}`] = 1;
      console.error(`[pipeline] passo ${step.name} falhou`, err);
    }
  }
}

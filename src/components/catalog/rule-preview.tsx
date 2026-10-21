'use client';

import * as React from 'react';
import { DateBR } from '@/components/format/date-br';
import { Money } from '@/components/format/money';
import { previewRuleAction } from '@/app/(app)/categorias/actions';
import type { ActionResult } from '@/lib/action';
import type { RulePreview as RulePreviewResult } from '@/server/queries/rule-preview';
import { cn } from '@/lib/utils';
import { previewInputFrom, previewMessage, previewUserNote, type RulePreviewFields } from './catalog-helpers';

/** Espera depois da última alteração antes de consultar (evita uma consulta por tecla). */
const DEBOUNCE_MS = 400;

type Loaded = { key: string; result: ActionResult<RulePreviewResult> };

/** "Esta regra casaria com N transações dos últimos 90 dias", com até 5 exemplos. Atualiza com atraso. */
export function RulePreview(fields: RulePreviewFields) {
  const input = previewInputFrom(fields);
  // Chave estável da entrada: o efeito só dispara quando um campo de match muda de fato
  const key = input && input !== 'invalid_amount' ? JSON.stringify(input) : null;
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);

  React.useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      const result = await previewRuleAction(JSON.parse(key));
      if (!cancelled) setLoaded({ key, result });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [key]);

  let body: React.ReactNode;
  if (input === null) {
    body = <p className="text-muted-foreground">Digite o texto da condição para ver quais transações a regra pegaria.</p>;
  } else if (input === 'invalid_amount') {
    body = <p className="text-muted-foreground">Corrija a faixa de valor para ver a prévia.</p>;
  } else if (!loaded) {
    body = <p className="text-muted-foreground">Calculando prévia...</p>;
  } else {
    // Enquanto a nova consulta não volta, mostra a anterior esmaecida
    body = <PreviewResult result={loaded.result} stale={loaded.key !== key} />;
  }

  return (
    <div
      data-testid="rule-preview"
      aria-live="polite"
      aria-busy={key !== null && loaded?.key !== key}
      className="rounded-lg border bg-muted/40 p-3 text-sm"
    >
      {body}
    </div>
  );
}

function PreviewResult({ result, stale }: { result: ActionResult<RulePreviewResult>; stale: boolean }) {
  if (!result.ok) return <p className="text-destructive">Não foi possível calcular a prévia.</p>;
  const p = result.data;
  if (p.status === 'empty') return null;
  if (p.status === 'invalid_regex') return <p className="text-destructive">Expressão regular inválida.</p>;

  const note = previewUserNote(p.userCategorized);
  const more = p.total - p.samples.length;
  return (
    <div className={cn('grid gap-2 transition-opacity', stale && 'opacity-60')}>
      <p className="font-medium" data-testid="rule-preview-summary">
        {previewMessage(p.total, p.days)}
      </p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {p.samples.length > 0 && (
        <ul className="grid gap-1" aria-label="Exemplos">
          {p.samples.map((s) => (
            <li key={s.id} data-testid="rule-preview-sample" className="flex items-baseline gap-2 text-xs">
              <DateBR date={s.date} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" title={s.description}>
                {s.description}
                {s.userCategorized && <span className="text-muted-foreground"> · sua categoria</span>}
              </span>
              <Money sensitive={false} cents={s.amountCents} className="shrink-0" />
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <p className="text-xs text-muted-foreground">e mais {more}</p>}
    </div>
  );
}

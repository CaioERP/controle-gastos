import type { CategoryKind } from '@/server/domain/enums';

export type PromptCategory = { slug: string; name: string; parentName: string | null; kind: CategoryKind };

function formatList(categories: PromptCategory[], kind: CategoryKind): string {
  return categories
    .filter((c) => c.kind === kind)
    .map((c) => `- ${c.slug}: ${c.parentName ? `${c.parentName} > ` : ''}${c.name}`)
    .join('\n');
}

/** Prompt de sistema estável (mesmas categorias → mesmo texto), para não variar entre lotes. */
export function buildSystemPrompt(categories: PromptCategory[]): string {
  return [
    'Você categoriza transações financeiras de um usuário brasileiro.',
    'Para cada transação recebida, escolha o slug da categoria mais específica da lista e informe uma confiança entre 0 e 1.',
    'Use somente slugs da lista. Transações de natureza "income" usam categorias de receita; "expense" e "refund", categorias de despesa.',
    'Quando não tiver certeza, use confiança abaixo de 0.6.',
    'Considere a descrição, o estabelecimento, o valor e a forma de pagamento.',
    'Os marcadores [PESSOA], [DOC] e [NUM] substituem dados ocultados por privacidade.',
    'Devolva exatamente um resultado para cada id recebido, usando o mesmo id.',
    '',
    'Categorias de despesa:',
    formatList(categories, 'expense'),
    '',
    'Categorias de receita:',
    formatList(categories, 'income'),
  ].join('\n');
}

export type ProviderCategorySeed = {
  providerCategoryId: string;
  providerCategoryName: string;
  /** null = categoria da fonte que indica natureza (transferência, pagamento de fatura…), não categoria de gasto. */
  categorySlug: string | null;
};

/**
 * Mapa das categorias da Pluggy para as nossas. PENDENTE: preencher na F0-07 com os
 * `categoryId`/`category` realmente vistos nos dumps, usando `suggestCategorySlug` como ponto de partida.
 */
export const PLUGGY_CATEGORY_SEED: ProviderCategorySeed[] = [];

/** Equivalência por nome (inglês, como a Pluggy devolve). A ordem importa: regras mais específicas primeiro. */
const NAME_RULES: Array<[RegExp, string | null]> = [
  [/food delivery/i, 'alimentacao-delivery'],
  [/groceries|supermarket/i, 'alimentacao-mercado'],
  [/eating out|restaurant/i, 'alimentacao-restaurante'],
  [/taxi|ride.?hailing/i, 'transporte-app'],
  [/gas station|fuel/i, 'transporte-combustivel'],
  [/public transport/i, 'transporte-publico'],
  [/parking|toll/i, 'transporte-estacionamento-pedagio'],
  [/pharmac/i, 'saude-farmacia'],
  [/health insurance/i, 'saude-plano'],
  [/gym|fitness/i, 'saude-academia'],
  [/streaming/i, 'lazer-streaming'],
  [/gaming|video games/i, 'lazer-jogos'],
  [/\brent\b/i, 'moradia-aluguel'],
  [/electricity/i, 'moradia-energia'],
  [/\bwater\b/i, 'moradia-agua'],
  [/telecom|internet/i, 'moradia-internet-telefone'],
  [/clothing/i, 'compras-vestuario'],
  [/electronics/i, 'compras-eletronicos'],
  [/online shopping/i, 'compras'],
  [/education|bookstore/i, 'educacao'],
  [/\bpets?\b/i, 'pets'],
  [/travel|airline|hotel/i, 'viagem'],
  [/\btax(es)?\b|bank fee/i, 'impostos-taxas'],
  [/salary/i, 'salario'],
  [/interest|investment income/i, 'rendimentos'],
  [/transfer|credit card payment|investment/i, null],
];

/**
 * Sugere a nossa categoria (slug) para um nome de categoria da Pluggy.
 * Retorna `null` para categorias de natureza (ignorar) e `undefined` quando não há equivalência conhecida.
 */
export function suggestCategorySlug(providerCategoryName: string): string | null | undefined {
  for (const [pattern, slug] of NAME_RULES) {
    if (pattern.test(providerCategoryName)) return slug;
  }
  return undefined;
}

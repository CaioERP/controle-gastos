export type ParsedInstallment = {
  number: number;
  total: number;
  base: string;
};

/**
 * Reconhece parcelas em descrições de transações:
 * "LOJA PARC 03/10", "LOJA PARCELA 3/10", "LOJA 03/10", "LOJA 3 DE 10", "LOJA - Parcela 3/10".
 * Retorna null se não houver.
 *
 * Regras:
 * - number entre 1 e total;
 * - total entre 2 e 48;
 * - base: descrição sem o trecho da parcela, sem espaços/traços residuais.
 * - Datas ("05/10") ou anos ("10/2026") são descartados.
 */
export function parseInstallment(description: string): ParsedInstallment | null {
  if (!description) return null;

  const trimmed = description.trim();

  // 1. Prefixo explícito PARC ou PARCELA (em qualquer posição ou com separador)
  // Ex: "MAGAZINE LUIZA PARC 03/10", "LOJA - Parcela 3/10", "LOJA PARCELA 1 DE 12"
  const explicitRegex = /(?:[\s\-_/]+|^)(?:parc(?:ela)?\.?)\s*(\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})(?:[\s\-_/]+|$)/i;
  const explicitMatch = trimmed.match(explicitRegex);

  if (explicitMatch && explicitMatch[1] && explicitMatch[2]) {
    const num = parseInt(explicitMatch[1], 10);
    const tot = parseInt(explicitMatch[2], 10);

    if (tot >= 2 && tot <= 48 && num >= 1 && num <= tot) {
      const base = cleanBase(trimmed.replace(explicitMatch[0], ' '));
      return { number: num, total: tot, base };
    }
  }

  // 2. Padrão no FINAL da descrição: "NN/NN" ou "N DE NN"
  // Ex: "Notebook Dell 3/10", "LOJA 3 DE 10", "LOJA 03/10"
  const endRegex = /(?:[\s\-_/]+)(\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})\s*$/i;
  const endMatch = trimmed.match(endRegex);

  if (endMatch && endMatch[1] && endMatch[2]) {
    const num = parseInt(endMatch[1], 10);
    const tot = parseInt(endMatch[2], 10);

    if (tot >= 2 && tot <= 48 && num >= 1 && num <= tot) {
      const base = cleanBase(trimmed.slice(0, endMatch.index));
      return { number: num, total: tot, base };
    }
  }

  return null;
}

function cleanBase(str: string): string {
  return str
    .replace(/[\s\-_/]+$/, '')
    .replace(/^[\s\-_/]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

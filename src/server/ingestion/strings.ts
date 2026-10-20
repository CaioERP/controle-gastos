/** Minúsculas, sem acentos e com espaços colapsados — use para COMPARAR textos, nunca para exibir. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const COMMON_WORDS_SHORT = new Set([
  'pao',
  'bar',
  'rua',
  'gas',
  'cha',
  'sal',
  'mel',
  'sol',
  'dia',
  'rio',
  'mar',
  'via',
  'eco',
  'pai',
  'mae',
  'top',
  'boa',
  'bom',
  'dez',
  'mil',
  'fim',
  'de',
  'da',
  'do',
  'dos',
  'das',
  'em',
  'na',
  'no',
  'nas',
  'nos',
  'um',
  'uma',
  'uns',
  'umas',
  'por',
  'com',
  'sem',
  'sob',
  'pra',
  'pro',
  'que',
  'seu',
  'sua',
]);

const ACRONYMS_EXPLICIT = new Set([
  'XP',
  'SA',
  'S/A',
  'ME',
  'EPP',
  'EIRELI',
  'IOF',
  'TED',
  'DOC',
  'PIX',
  'TEF',
  'BRL',
  'USD',
  'EUR',
  'USA',
  'BR',
  'SP',
  'RJ',
  'MG',
  'RS',
  'SC',
  'PR',
  'BA',
  'PE',
  'CE',
  'DF',
  'TV',
  'TI',
  'RH',
  'SAC',
  'POS',
  'ATM',
]);

/**
 * Converte para formato legível de exibição (Title Case com regras brasileiras).
 * Exemplo: "PADARIA REAL LTDA" → "Padaria Real Ltda"
 * "PAO DE ACUCAR 1234" → "Pao De Acucar 1234"
 * "NETFLIX.COM" → "Netflix.com"
 * Mantém siglas de até 3 letras em maiúsculas quando aplicável (ex.: XP, ME, S/A, PIX).
 */
export function toDisplayCase(s: string): string {
  if (!s) return '';

  const tokens = s.trim().split(/\s+/);

  const formattedTokens = tokens.map((token) => {
    // Se contém domínio (ex: NETFLIX.COM ou UBER.COM.BR)
    if (token.includes('.') && /^[A-Za-z0-9_.-]+$/.test(token)) {
      const parts = token.split('.');
      const host = parts[0];
      if (host) {
        const rest = parts.slice(1).map((p) => p.toLowerCase()).join('.');
        const formattedHost =
          host.charAt(0).toUpperCase() + host.slice(1).toLowerCase();
        return `${formattedHost}.${rest}`;
      }
    }

    // Se é uma sigla com barra (ex: S/A)
    const upperToken = token.toUpperCase();
    if (upperToken === 'S/A' || upperToken === 'C/C') {
      return upperToken;
    }

    // Remove pontuações ao redor para analisar a palavra
    const cleanWord = token.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
    const cleanLower = normalizeForMatch(cleanWord);

    // Se é número ou já não tem letras
    if (!/[a-zA-Z]/.test(token)) {
      return token;
    }

    // Se tem até 3 letras e é sigla explícita ou sigla (todas maiúsculas e não é palavra comum)
    const lettersOnly = token.replace(/[^a-zA-Z]/g, '');
    if (
      lettersOnly.length >= 2 &&
      lettersOnly.length <= 3 &&
      (ACRONYMS_EXPLICIT.has(upperToken) ||
        (token === upperToken && !COMMON_WORDS_SHORT.has(cleanLower)))
    ) {
      return upperToken;
    }

    // Caso padrão: Title Case
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  });

  return formattedTokens.join(' ');
}

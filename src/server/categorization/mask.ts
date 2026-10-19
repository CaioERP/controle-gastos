/**
 * Máscara de dados pessoais para o que vai para a IA (A1-07). Regra geral: na dúvida, oculte.
 *
 * - Nome de pessoa depois de Pix/TED/DOC/transferência → `[PESSOA]` (com ou sem acento, qualquer caixa,
 *   com palavras como "enviada pelo Pix", "QRS", "para" entre a palavra-chave e o nome).
 * - CPF/CNPJ, inclusive parcialmente mascarados pelo banco (`•••.123.456-••`) → `[DOC]`.
 * - Sequências de 6+ dígitos → `[NUM]`.
 * Nomes de estabelecimentos comerciais sem essas palavras-chave (ex.: `IFD*IFOOD`, `UBER *TRIP`) passam intactos.
 */

const COMBINING = /[̀-ͯ]/g;

/**
 * Minúsculas e sem acentos, com o MESMO comprimento do texto original (caractere a caractere),
 * para que as posições encontradas no texto dobrado valham no original.
 */
function fold(s: string): string {
  let out = '';
  for (const ch of s) {
    const f = ch.normalize('NFD').replace(COMBINING, '').toLowerCase();
    out += f.length === ch.length ? f : ch;
  }
  return out;
}

// Palavra-chave que costuma vir seguida (ou precedida) do nome de uma pessoa
const KEYWORD = /(?<![\p{L}\p{N}])(?:pix|ted|doc|transf|transferencia)(?![\p{L}\p{N}])/u;
// Palavras que continuam a "frase" da palavra-chave e podem ser mantidas no texto enviado
const QUALIFIER = /^(?:enviad[oa]|recebid[oa]|transf|transferencia|pix|ted|doc|qrs?|code|agendad[oa]|eletronica)$/;
// Conectores entre a frase e o nome: consumidos, mas não mantidos
const CONNECTOR = /^(?:pelo|pela|via|para|p\/|de|do|da|a|em|por)$/;
// Palavras que podem aparecer ANTES da palavra-chave sem serem nome de pessoa
const BEFORE_OK = new Set([
  'pagamento', 'pagto', 'pgto', 'pag', 'tarifa', 'estorno', 'devolucao', 'devolvido', 'envio', 'recebimento',
  'compra', 'transferencia', 'transf', 'enviado', 'enviada', 'recebido', 'recebida', 'agendamento', 'cancelamento',
  'cobranca', 'credito', 'debito', 'de', 'do', 'da', 'por', 'via', 'em',
]);
const TOKEN = /[^\s\-–—:*|]+/g;

const PERSON = '[PESSOA]';

/** Oculta o nome de pessoa ligado a uma palavra de transferência. `null` se o texto não tem palavra-chave. */
function maskPerson(text: string): string | null {
  const folded = fold(text);
  const kw = KEYWORD.exec(folded);
  if (!kw) return null;

  let phraseEnd = kw.index + kw[0].length;
  let restStart = -1;
  TOKEN.lastIndex = phraseEnd;
  for (let m = TOKEN.exec(folded); m; m = TOKEN.exec(folded)) {
    if (QUALIFIER.test(m[0])) {
      phraseEnd = m.index + m[0].length;
    } else if (!CONNECTOR.test(m[0])) {
      restStart = m.index;
      break;
    }
  }

  const before = folded.slice(0, kw.index).match(TOKEN) ?? [];
  const beforeIsSafe = before.every((t) => BEFORE_OK.has(t));
  const phrase = text.slice(beforeIsSafe ? 0 : kw.index, phraseEnd).trim();

  const parts = [beforeIsSafe ? null : PERSON, phrase, restStart >= 0 ? PERSON : null];
  return parts.filter((p): p is string => !!p).join(' - ');
}

const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
// CPF/CNPJ com dígitos ocultados pelo banco: •••.123.456-••, ***.123.456-**, ***123456**
const MASKED_DOC =
  /[\d•*]{2,3}\.[\d•*]{3}\.[\d•*]{3}(?:\/[\d•*]{4})?-[\d•*]{2}|[•*]{2,}\d{3,}[\d•*]*|\d{3,}[•*]{2,}/g;
// Pedaços de documento: 123.456 (grupos de 3 dígitos separados por ponto)
const PARTIAL_DOC = /\d{3}\.\d{3}/g;
const LONG_NUMBER = /\d{6,}/g;

function maskNumbers(text: string): string {
  return text
    .replace(CNPJ, '[DOC]')
    .replace(CPF, '[DOC]')
    .replace(MASKED_DOC, '[DOC]')
    .replace(PARTIAL_DOC, '[DOC]')
    .replace(LONG_NUMBER, '[NUM]');
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

export type MaskOptions = {
  /**
   * A transação é um Pix/TED/DOC (forma de pagamento `pix`/`ted_doc`): se a descrição não tiver palavra-chave,
   * ela inteira pode ser o nome da pessoa, e é ocultada.
   */
  transfer?: boolean;
};

/** Remove nomes de pessoas em Pix/TED/DOC/transferências, CPFs/CNPJs (inclusive parciais) e números longos. */
export function maskForLlm(description: string, opts: MaskOptions = {}): string {
  const person = maskPerson(description);
  if (person === null && opts.transfer) return PERSON;
  return tidy(maskNumbers(person ?? description));
}

// Razão social de MEI: "NOME DA PESSOA 12345678901" ou "12.345.678 NOME DA PESSOA"
const MEI_DOC = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}|^\s*\d{2}\.?\d{3}\.?\d{3}\s+\p{L}|[•*]{2,}[\d.\-•*]*\d{3}/u;

/**
 * Máscara para o nome do estabelecimento. Um nome com CPF (ou com a raiz do CNPJ na frente) é razão social de MEI,
 * ou seja, nome de pessoa física: é ocultado por inteiro.
 */
export function maskMerchantForLlm(name: string): string {
  if (MEI_DOC.test(name)) return PERSON;
  return maskForLlm(name);
}

// Palavras que, na descrição do banco, costumam vir seguidas do nome de uma pessoa (Pix/TED entre pessoas)
const PERSON_AFTER =
  /\b(pix\s+(?:enviado|recebido|transf(?:erencia)?)|ted(?:\s+(?:enviada|recebida))?|transf(?:erencia)?(?:\s+(?:enviada|recebida))?)\b\s*-?\s*\S.*$/i;
const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const LONG_NUMBER = /\d{6,}/g;

/**
 * Remove dados pessoais antes de enviar uma descrição para a IA:
 * nome de pessoa depois de Pix/TED/transferência → [PESSOA]; CPF/CNPJ → [DOC]; sequências de 6+ dígitos → [NUM].
 * Nomes de estabelecimentos comerciais (ex.: "IFD*IFOOD") passam intactos.
 */
export function maskForLlm(description: string): string {
  return description
    .replace(PERSON_AFTER, (_match, keyword: string) => `${keyword} - [PESSOA]`)
    .replace(CNPJ, '[DOC]')
    .replace(CPF, '[DOC]')
    .replace(LONG_NUMBER, '[NUM]')
    .replace(/\s+/g, ' ')
    .trim();
}

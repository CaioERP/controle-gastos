import type { AccountType } from '@/server/domain/enums';
import { CommandError } from '@/server/domain/errors';
import { detectNubankCsvKind, parseNubankCsv } from './csv-nubank';
import { parseOfx, type ParsedFileResult } from './ofx';

/** Decodifica bytes de arquivo: se UTF-8 válido (sem U+FFFD), usa UTF-8 (removendo BOM); senão usa latin1/windows-1252. */
export function decodeFileBuffer(bytes: Uint8Array): string {
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
  const utf8Text = utf8Decoder.decode(bytes);
  if (!utf8Text.includes('\uFFFD')) {
    return utf8Text.replace(/^\uFEFF/, '');
  }
  const latin1Decoder = new TextDecoder('windows-1252');
  return latin1Decoder.decode(bytes);
}

export function detectAndParseFile(
  input: { filename: string; content: string | Uint8Array },
  account: { id: string; type: AccountType; currency?: string },
): ParsedFileResult {
  const text =
    typeof input.content === 'string'
      ? input.content.replace(/^\uFEFF/, '')
      : decodeFileBuffer(input.content);

  if (/<OFX/i.test(text) || /OFXHEADER\s*:/i.test(text)) {
    return parseOfx(text, account);
  }

  const firstNonEmptyLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);

  if (firstNonEmptyLine && detectNubankCsvKind(firstNonEmptyLine)) {
    return parseNubankCsv(text, account);
  }

  throw new CommandError(
    'VALIDATION',
    'Formato de arquivo não reconhecido. Envie um arquivo OFX ou CSV do Nubank.',
  );
}

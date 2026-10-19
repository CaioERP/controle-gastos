import { describe, expect, it } from 'vitest';
import { maskForLlm, maskMerchantForLlm } from './mask';

describe('maskForLlm', () => {
  it.each([
    // Exemplos da especificação
    ['PIX ENVIADO - JOAO DA SILVA', 'PIX ENVIADO - [PESSOA]'],
    ['IFD*IFOOD', 'IFD*IFOOD'],
    ['PEDIDO 1234567', 'PEDIDO [NUM]'],
    // 11 dígitos sem pontuação têm formato de CPF: mascarados como documento
    ['PAGTO 12345678901', 'PAGTO [DOC]'],
    ['BOLETO 123.456.789-09', 'BOLETO [DOC]'],
    ['EMPRESA 12.345.678/0001-90', 'EMPRESA [DOC]'],
    // Formatos reais dos bancos (dados fictícios)
    ['Transferência enviada pelo Pix - JOAO DA SILVA - •••.123.456-•• - NU PAGAMENTOS', 'Transferência enviada pelo Pix - [PESSOA]'],
    ['Transferência recebida pelo Pix - MARIA SOUZA - •••.987.654-••', 'Transferência recebida pelo Pix - [PESSOA]'],
    ['TRANSFERÊNCIA ENVIADA JOAO DA SILVA', 'TRANSFERÊNCIA ENVIADA - [PESSOA]'],
    ['TRANSFERENCIA RECEBIDA DE MARIA SOUZA', 'TRANSFERENCIA RECEBIDA - [PESSOA]'],
    ['PIX - JOAO DA SILVA', 'PIX - [PESSOA]'],
    ['PAGAMENTO PIX JOAO DA SILVA', 'PAGAMENTO PIX - [PESSOA]'],
    ['PIX QRS JOAO DA SILVA', 'PIX QRS - [PESSOA]'],
    ['DOC JOAO DA SILVA', 'DOC - [PESSOA]'],
    ['Pix enviado para Maria Souza', 'Pix enviado - [PESSOA]'],
    ['PIX RECEBIDO MARIA SOUZA', 'PIX RECEBIDO - [PESSOA]'],
    ['PIX TRANSF JOAO D 10/10', 'PIX TRANSF - [PESSOA]'],
    ['TED 237 0001 JOAO DA SILVA', 'TED - [PESSOA]'],
    ['TED RECEBIDA FULANO DE TAL', 'TED RECEBIDA - [PESSOA]'],
    // Nome ANTES da palavra-chave também é ocultado
    ['MARIA SOUZA - PIX RECEBIDO', '[PESSOA] - PIX RECEBIDO'],
    // CPF parcialmente mascarado pelo banco, sem palavra-chave
    ['PAGAMENTO •••.123.456-••', 'PAGAMENTO [DOC]'],
    ['PAGAMENTO ***.123.456-**', 'PAGAMENTO [DOC]'],
    ['REF ***123456**', 'REF [DOC]'],
    ['CLIENTE 123.456', 'CLIENTE [DOC]'],
    // Palavra-chave sem nome depois: nada a ocultar
    ['TARIFA PIX', 'TARIFA PIX'],
    ['ESTORNO PIX', 'ESTORNO PIX'],
    // Estabelecimentos comerciais continuam visíveis
    ['UBER *TRIP', 'UBER *TRIP'],
    ['PAG*PADARIA REAL', 'PAG*PADARIA REAL'],
    ['NETFLIX.COM', 'NETFLIX.COM'],
    ['DOCERIA DA ANA', 'DOCERIA DA ANA'],
    ['Supermercado São Jorge', 'Supermercado São Jorge'],
  ])('%s → %s', (input, expected) => {
    expect(maskForLlm(input)).toBe(expected);
  });

  it('com transfer (Pix/TED/DOC), descrição sem palavra-chave é tratada como nome', () => {
    expect(maskForLlm('JOAO DA SILVA', { transfer: true })).toBe('[PESSOA]');
    expect(maskForLlm('PIX QRS PADARIA REAL', { transfer: true })).toBe('PIX QRS - [PESSOA]');
    expect(maskForLlm('TARIFA PIX', { transfer: true })).toBe('TARIFA PIX');
  });

  it('nenhum pedaço de CPF sobra nas descrições reais', () => {
    const out = maskForLlm('Transferência enviada pelo Pix - JOAO DA SILVA - •••.123.456-•• - NU PAGAMENTOS');
    expect(out).not.toMatch(/\d{3}/);
    expect(out).not.toContain('JOAO');
  });
});

describe('maskMerchantForLlm', () => {
  it.each([
    // Razão social de MEI = nome da pessoa + CPF, ou raiz do CNPJ + nome
    ['Joao da Silva 12345678901', '[PESSOA]'],
    ['JOAO DA SILVA 123.456.789-01', '[PESSOA]'],
    ['12.345.678 JOAO DA SILVA', '[PESSOA]'],
    ['MARIA SOUZA •••.123.456-••', '[PESSOA]'],
    // Estabelecimentos comerciais passam
    ['iFood', 'iFood'],
    ['Padaria Real', 'Padaria Real'],
    ['UBER *TRIP', 'UBER *TRIP'],
  ])('%s → %s', (input, expected) => {
    expect(maskMerchantForLlm(input)).toBe(expected);
  });
});

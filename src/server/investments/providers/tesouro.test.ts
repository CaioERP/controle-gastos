import { describe, expect, it } from 'vitest';
import { matchTreasuryQuote, parseTesouroCsv } from './tesouro';

describe('tesouro provider', () => {
  const sampleCsv = `Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base
Tesouro Selic;01/03/2029;18/10/2026;0,00;0,05;14950,12;14945,80;14945,80
Tesouro Selic;01/03/2029;19/10/2026;0,00;0,05;14955,10;14951,20;14951,20
Tesouro IPCA+;15/05/2035;19/10/2026;6,20;6,25;2100,50;2095,30;2095,30
Tesouro Prefixado;01/01/2027;19/10/2026;11,50;11,55;;;890,45`;

  it('parseia CSV filtrando pela maior Data Base de cada par (Tipo Titulo, Data Vencimento)', () => {
    const quotes = parseTesouroCsv(sampleCsv, true);
    expect(quotes).toHaveLength(3);

    const selic2029 = quotes.find((q) => q.titleType === 'Tesouro Selic' && q.maturityDate === '2029-03-01');
    expect(selic2029).toBeDefined();
    expect(selic2029?.date).toBe('2026-10-19');
    expect(selic2029?.puBaseCents).toBe(1495120);

    const ipca2035 = quotes.find((q) => q.titleType === 'Tesouro IPCA+' && q.maturityDate === '2035-05-15');
    expect(ipca2035).toBeDefined();
    expect(ipca2035?.puBaseCents).toBe(209530);

    const pre2027 = quotes.find(
      (q) => q.titleType === 'Tesouro Prefixado' && q.maturityDate === '2027-01-01',
    );
    expect(pre2027).toBeDefined();
    expect(pre2027?.puBaseCents).toBe(89045);
  });

  it('retorna todas as linhas quando filterLatestOnly for false', () => {
    const all = parseTesouroCsv(sampleCsv, false);
    expect(all).toHaveLength(4);
  });

  it('casa o título mais específico quando dois tipos têm o mesmo vencimento', () => {
    // Linhas no formato e na ordem do CSV oficial (cabeçalho com "PU Base Manha").
    const csv = `Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha
Tesouro Prefixado;01/01/2029;15/10/2026;12,64;12,76;770,85;768,69;768,69
Tesouro IPCA+ com Juros Semestrais;15/05/2035;15/10/2026;6,82;6,94;4655,94;4620,08;4620,08
Tesouro IPCA+;15/05/2035;15/10/2026;6,84;6,96;2713,48;2686,72;2686,72
Tesouro Prefixado com Juros Semestrais;01/01/2029;15/10/2026;12,49;12,61;985,80;983,28;983,28`;
    const quotes = parseTesouroCsv(csv);

    const ntnf = matchTreasuryQuote('Tesouro Prefixado com Juros Semestrais 2029', '2029-01-01', quotes);
    expect(ntnf?.puBaseCents).toBe(98328);
    expect(matchTreasuryQuote('Tesouro Prefixado 2029', '2029-01-01', quotes)?.puBaseCents).toBe(76869);
    expect(matchTreasuryQuote('Tesouro IPCA+ 2035', '2035-05-15', quotes)?.puBaseCents).toBe(268672);
    expect(matchTreasuryQuote('Tesouro IPCA+', '2035-05-15', quotes)?.puBaseCents).toBe(268672);
    // Sem vencimento não há como escolher entre vencimentos.
    expect(matchTreasuryQuote('Tesouro Prefixado', null, quotes)).toBeNull();
  });

  it('retorna array vazio para CSV inválido ou vazio', () => {
    expect(parseTesouroCsv('')).toEqual([]);
    expect(parseTesouroCsv('coluna1;coluna2\n1;2')).toEqual([]);
  });
});

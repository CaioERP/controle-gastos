import 'server-only';
import { cache } from 'react';
import { getDb } from '@/server/db/client';
import { getAccountsOverview } from './accounts';

/**
 * Resumo de contas calculado uma vez por requisição (Server Components).
 *
 * É o único lugar fora de páginas e actions que chama `getDb()`, com o objetivo de
 * permitir que Server Components em diferentes ramos da árvore compartilhem o resultado
 * da consulta de contas sem prop drilling nem chamadas duplicadas ao banco.
 * NÃO use em jobs nem em comandos.
 */
export const getRequestAccountsOverview = cache(async (today?: string) =>
  getAccountsOverview(getDb(), today ? { today } : {}),
);

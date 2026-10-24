import { NAV_ITEMS, isNavItemActive } from './nav-items';

const EXTRA_PAGE_TITLES: Array<{ href: string; label: string }> = [
  { href: '/notificacoes', label: 'Notificações' },
  { href: '/estabelecimentos', label: 'Estabelecimentos' },
];

const KNOWN_NAV_ITEMS = [...NAV_ITEMS, ...EXTRA_PAGE_TITLES];

/** Título da tela para a barra do celular, a partir do pathname e dos itens do menu. */
export function pageTitleFor(pathname: string): string {
  const matches = KNOWN_NAV_ITEMS.filter((item) => isNavItemActive(item.href, pathname));
  if (matches.length === 0) {
    return 'Controle de Gastos';
  }
  matches.sort((a, b) => b.href.length - a.href.length);
  return matches[0]?.label ?? 'Controle de Gastos';
}

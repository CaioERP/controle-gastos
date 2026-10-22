import {
  LayoutDashboard,
  ListOrdered,
  PieChart,
  Landmark,
  CreditCard,
  Target,
  Repeat,
  TrendingUp,
  Wallet,
  LineChart,
  Inbox,
  Tags,
  PlugZap,
  Upload,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: string;
  /** null = grupo sem título, sempre aberto. */
  label: string | null;
  defaultOpen: boolean;
  items: NavItem[];
}

/**
 * Grupos da navegação lateral. O primeiro grupo não tem rótulo e fica sempre aberto;
 * os demais podem ser recolhidos (`defaultOpen` é o estado inicial de quem nunca mexeu).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'geral',
    label: null,
    defaultOpen: true,
    items: [
      { href: '/', label: 'Início', icon: LayoutDashboard },
      { href: '/transacoes', label: 'Transações', icon: ListOrdered },
      { href: '/revisao', label: 'Revisão', icon: Inbox },
      { href: '/analise', label: 'Análise', icon: PieChart },
    ],
  },
  {
    id: 'contas',
    label: 'Contas',
    defaultOpen: true,
    items: [
      { href: '/contas', label: 'Contas e cartões', icon: Landmark },
      { href: '/faturas', label: 'Faturas', icon: CreditCard },
    ],
  },
  {
    id: 'planejamento',
    label: 'Planejamento',
    defaultOpen: true,
    items: [
      { href: '/limites', label: 'Limites e metas', icon: Target },
      { href: '/assinaturas', label: 'Assinaturas', icon: Repeat },
      { href: '/projecao', label: 'Projeção', icon: LineChart },
    ],
  },
  {
    id: 'investimentos',
    label: 'Investimentos',
    defaultOpen: true,
    items: [
      { href: '/investimentos', label: 'Investimentos', icon: TrendingUp },
      { href: '/patrimonio', label: 'Patrimônio', icon: Wallet },
    ],
  },
  {
    id: 'configurar',
    label: 'Configurar',
    defaultOpen: false,
    items: [
      { href: '/categorias', label: 'Categorias e regras', icon: Tags },
      { href: '/conexoes', label: 'Conexões', icon: PlugZap },
      { href: '/importar', label: 'Importar', icon: Upload },
    ],
  },
];

/** Lista plana (busca global). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export function isNavItemActive(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

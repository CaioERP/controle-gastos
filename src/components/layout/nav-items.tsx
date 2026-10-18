import {
  LayoutDashboard,
  ListOrdered,
  PieChart,
  Landmark,
  CreditCard,
  Inbox,
  Tags,
  PlugZap,
} from 'lucide-react';

export const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transacoes', label: 'Transações', icon: ListOrdered },
  { href: '/analise', label: 'Análise', icon: PieChart },
  { href: '/contas', label: 'Contas e cartões', icon: Landmark },
  { href: '/faturas', label: 'Faturas', icon: CreditCard },
  { href: '/revisao', label: 'Revisão', icon: Inbox },
  { href: '/categorias', label: 'Categorias e regras', icon: Tags },
  { href: '/conexoes', label: 'Conexões', icon: PlugZap },
] as const;

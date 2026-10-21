import {
  LayoutDashboard,
  ListOrdered,
  PieChart,
  Landmark,
  CreditCard,
  TrendingUp,
  Wallet,
  Inbox,
  Tags,
  PlugZap,
  Upload,
} from 'lucide-react';

export const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transacoes', label: 'Transações', icon: ListOrdered },
  { href: '/analise', label: 'Análise', icon: PieChart },
  { href: '/contas', label: 'Contas e cartões', icon: Landmark },
  { href: '/faturas', label: 'Faturas', icon: CreditCard },
  { href: '/investimentos', label: 'Investimentos', icon: TrendingUp },
  { href: '/patrimonio', label: 'Patrimônio', icon: Wallet },
  { href: '/revisao', label: 'Revisão', icon: Inbox },
  { href: '/categorias', label: 'Categorias e regras', icon: Tags },
  { href: '/conexoes', label: 'Conexões', icon: PlugZap },
  { href: '/importar', label: 'Importar', icon: Upload },
] as const;

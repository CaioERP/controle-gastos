import {
  Baby,
  Beer,
  Book,
  Briefcase,
  Bus,
  Car,
  CircleHelp,
  CirclePlus,
  Coffee,
  CreditCard,
  Droplet,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Hammer,
  HeartPulse,
  Home,
  Landmark,
  Music,
  PawPrint,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Receipt,
  Repeat,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Stethoscope,
  Tag,
  TrendingUp,
  Undo2,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { createElement } from 'react';
import { cn } from '@/lib/utils';

/** Ícones oferecidos no IconPicker (nomes lucide em kebab-case, como gravados em categories.icon). */
export const PICKER_ICONS = {
  utensils: Utensils,
  car: Car,
  home: Home,
  'heart-pulse': HeartPulse,
  'gamepad-2': Gamepad2,
  'graduation-cap': GraduationCap,
  'shopping-bag': ShoppingBag,
  repeat: Repeat,
  plane: Plane,
  'paw-print': PawPrint,
  sparkles: Sparkles,
  receipt: Receipt,
  briefcase: Briefcase,
  'trending-up': TrendingUp,
  gift: Gift,
  baby: Baby,
  dumbbell: Dumbbell,
  coffee: Coffee,
  fuel: Fuel,
  bus: Bus,
  smartphone: Smartphone,
  wifi: Wifi,
  zap: Zap,
  droplet: Droplet,
  shirt: Shirt,
  book: Book,
  film: Film,
  music: Music,
  beer: Beer,
  pizza: Pizza,
  stethoscope: Stethoscope,
  pill: Pill,
  wrench: Wrench,
  hammer: Hammer,
  landmark: Landmark,
  'piggy-bank': PiggyBank,
  wallet: Wallet,
  'credit-card': CreditCard,
  tag: Tag,
  'circle-help': CircleHelp,
} satisfies Record<string, LucideIcon>;

/** Ícones usados pelo seed que não estão na grade do picker. */
const EXTRA_ICONS: Record<string, LucideIcon> = {
  'undo-2': Undo2,
  'plus-circle': CirclePlus,
  'circle-plus': CirclePlus,
};

export function getCategoryIcon(name: string): LucideIcon {
  return (PICKER_ICONS as Record<string, LucideIcon>)[name] ?? EXTRA_ICONS[name] ?? CircleHelp;
}

type CategoryIconProps = { icon: string; color: string; className?: string; size?: 'sm' | 'md' };

/** Ícone da categoria num círculo com a cor da categoria. */
export function CategoryIcon({ icon, color, className, size = 'md' }: CategoryIconProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full text-white',
        size === 'md' ? 'size-7' : 'size-5',
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {createElement(getCategoryIcon(icon), { className: size === 'md' ? 'size-4' : 'size-3' })}
    </span>
  );
}

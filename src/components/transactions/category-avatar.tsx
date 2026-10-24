import * as React from 'react';
import { Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCategoryIcon } from '@/components/catalog/category-icon';

export type CategoryAvatarProps = {
  category?: {
    icon?: string | null;
    color?: string | null;
    name?: string | null;
  } | null;
  className?: string;
};

export function CategoryAvatar({ category, className }: CategoryAvatarProps) {
  if (!category || !category.icon || !category.color) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground',
          className,
        )}
      >
        <Tag className="size-4" />
      </span>
    );
  }

  const bg = category.color.startsWith('#')
    ? `${category.color}1f`
    : `color-mix(in srgb, ${category.color} 12%, transparent)`;

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-xl',
        className,
      )}
      style={{
        backgroundColor: bg,
        color: category.color,
      }}
    >
      {React.createElement(getCategoryIcon(category.icon), { className: 'size-4' })}
    </span>
  );
}

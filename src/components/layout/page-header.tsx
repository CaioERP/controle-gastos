import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 pb-0',
        !actions && 'hidden md:flex',
        className
      )}
    >
      <div>
        <h1 className="hidden md:block text-2xl md:text-[28px] font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? <p className="sr-only">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2 shrink-0 ml-auto md:ml-0">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

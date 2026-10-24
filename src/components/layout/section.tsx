import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title?: React.ReactNode;
  action?: React.ReactNode;
  description?: React.ReactNode;
  separated?: boolean;
  children?: React.ReactNode;
}

export function Section({
  title,
  action,
  description,
  separated = false,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(
        'flex flex-col gap-4',
        separated && 'border-t border-border/60 pt-6',
        className
      )}
      {...props}
    >
      {title || action || description ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            {title ? (
              <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
            ) : null}
            {description ? (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

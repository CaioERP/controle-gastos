import * as React from 'react';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type SectionCardProps = {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/** Cartão padrão das seções analíticas (dashboard e análise). */
export function SectionCard({ title, description, action, className, children }: SectionCardProps) {
  return (
    <Card className={cn('min-w-0 border-border/60 shadow-none rounded-2xl ring-0', className)}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}

/** Mensagem curta para seção sem dados no período. */
export function SectionEmpty({ children = 'Sem gastos no período.' }: { children?: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

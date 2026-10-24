import { Skeleton } from '@/components/ui/skeleton';

export default function HomeLoading() {
  return (
    <div className="space-y-4 md:space-y-6 animate-pulse">
      {/* Cabeçalho no desktop */}
      <div className="hidden md:block">
        <Skeleton className="h-8 w-32" />
      </div>

      {/* Abas e período na mesma linha */}
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {/* Grid 2 colunas */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-x-10 md:gap-y-7">
        {/* Coluna esquerda: Herói + Saldo 90d */}
        <div className="md:col-span-7 space-y-6">
          <div className="rounded-2xl border border-border/60 bg-muted/40 p-6 space-y-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-3 w-full rounded-full" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-7 w-28 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-64 rounded-2xl w-full border border-border/60" />
        </div>

        {/* Coluna direita: Fluxo + Transações recentes */}
        <div className="md:col-span-5 space-y-6">
          <Skeleton className="h-36 rounded-2xl w-full border border-border/60" />
          <Skeleton className="h-72 rounded-2xl w-full border border-border/60" />
        </div>
      </div>
    </div>
  );
}

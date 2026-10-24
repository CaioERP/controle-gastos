import { Skeleton } from '@/components/ui/skeleton';

export default function TransacoesLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between pb-0">
        <Skeleton className="h-7 w-32 hidden md:block" />
        <div className="flex items-center gap-2 ml-auto">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-40 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 flex-1 min-w-[200px] rounded-lg" />
      </div>

      {/* Faixa de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-2xl overflow-hidden bg-border/60">
        <div className="bg-muted/40 p-4 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="bg-muted/40 p-4 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="bg-muted/40 p-4 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-16" />
        </div>
        <div className="bg-muted/40 p-4 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-16" />
        </div>
      </div>

      {/* Linhas de transação */}
      <div className="space-y-3 pt-2">
        <Skeleton className="h-4 w-28" />
        <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center justify-between p-3.5 bg-card">
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-lg" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

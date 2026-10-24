import { Skeleton } from '@/components/ui/skeleton';

export default function LimitesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-36 hidden md:block" />
        <Skeleton className="h-9 w-28 rounded-lg ml-auto" />
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden bg-border/60">
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

      {/* Banner de sugestões */}
      <Skeleton className="h-28 rounded-2xl w-full border border-border/60" />

      {/* Abas */}
      <div className="flex gap-3 border-b border-border/60 pb-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-20" />
      </div>

      {/* Lista de limites */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-40 rounded-2xl border border-border/60 bg-card" />
        ))}
      </div>
    </div>
  );
}

import { Skeleton } from '@/components/ui/skeleton';

export default function AnaliseLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <Skeleton className="h-9 w-40 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      {/* Cabeçalho */}
      <div className="hidden md:block">
        <Skeleton className="h-7 w-28" />
      </div>

      {/* Abas de seção */}
      <div className="flex gap-2 border-b border-border/60 pb-2">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-36 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>

      {/* Conteúdo em 2 colunas */}
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
        <div className="flex-[7_1_440px] space-y-4">
          <Skeleton className="h-6 w-36" />
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>

        <div className="flex-[5_1_320px] space-y-6">
          <Skeleton className="h-44 rounded-2xl border border-border/40 bg-muted/40" />
          <Skeleton className="h-56 rounded-2xl border border-border/60 bg-card" />
        </div>
      </div>
    </div>
  );
}

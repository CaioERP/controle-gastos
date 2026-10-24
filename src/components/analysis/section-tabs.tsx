'use client';

import * as React from 'react';
import Link, { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';
import type { TxFilters } from '@/server/domain/filters';
import type { AnalysisDim } from '@/server/queries/analysis';
import { analysisHref, type AnalysisSection } from './links';
import { cn } from '@/lib/utils';

export const ANALYSIS_SECTIONS: { id: AnalysisSection; label: string; mobileLabel: string }[] = [
  { id: 'categorias', label: 'Categorias', mobileLabel: 'Categorias' },
  { id: 'formas', label: 'Formas de pagamento', mobileLabel: 'Formas' },
  { id: 'lojas', label: 'Lojas', mobileLabel: 'Lojas' },
  { id: 'evolucao', label: 'Evolução', mobileLabel: 'Evolução' },
  { id: 'comparar', label: 'Comparar períodos', mobileLabel: 'Comparar' },
];

function TabInner({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center gap-1.5">
      {pending && <Loader2 className="size-3 animate-spin shrink-0" />}
      {children}
    </span>
  );
}

type SectionTabsProps = {
  currentSection: AnalysisSection;
  filters: TxFilters;
  dim: AnalysisDim;
};

export function SectionTabs({ currentSection, filters, dim }: SectionTabsProps) {
  return (
    <nav aria-label="Seções da análise" className="relative">
      {/* Celular: chips com rolagem horizontal */}
      <div className="flex md:hidden gap-1.5 overflow-x-auto no-scrollbar py-1">
        {ANALYSIS_SECTIONS.map((section) => {
          const active = section.id === currentSection;
          return (
            <Link
              key={section.id}
              href={analysisHref(filters, {}, dim, section.id)}
              scroll={false}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'shrink-0 h-8 px-3.5 rounded-full text-xs transition-colors flex items-center',
                active
                  ? 'bg-foreground text-background font-medium'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              <TabInner>{section.mobileLabel}</TabInner>
            </Link>
          );
        })}
      </div>

      {/* Desktop: abas com sublinhado */}
      <div className="hidden md:flex items-center gap-1 border-b border-border/60">
        {ANALYSIS_SECTIONS.map((section) => {
          const active = section.id === currentSection;
          return (
            <Link
              key={section.id}
              href={analysisHref(filters, {}, dim, section.id)}
              scroll={false}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'h-10 px-3.5 text-sm transition-colors flex items-center -mb-px',
                active
                  ? 'border-b-2 border-foreground font-semibold text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <TabInner>{section.label}</TabInner>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

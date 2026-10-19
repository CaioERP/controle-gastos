'use client';

import * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { addMonthsISO, formatDateBR, formatMonthBR, monthEnd, monthStart, today } from '@/server/domain/dates';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type PeriodPickerProps = {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
};

export function PeriodPicker({ from, to, onChange }: PeriodPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [customRange, setCustomRange] = React.useState<DateRange | undefined>(() => ({
    from: parseISO(from),
    to: parseISO(to),
  }));

  const isFullMonth = from.endsWith('-01') && to === monthEnd(from);
  const label = isFullMonth
    ? formatMonthBR(from)
    : `${formatDateBR(from)} – ${formatDateBR(to)}`;

  const handlePrevMonth = () => {
    const prev = addMonthsISO(from, -1);
    onChange({ from: monthStart(prev), to: monthEnd(prev) });
  };

  const handleNextMonth = () => {
    const next = addMonthsISO(from, 1);
    onChange({ from: monthStart(next), to: monthEnd(next) });
  };

  const applyShortcut = (shortcut: 'current_month' | 'last_month' | 'last_3' | 'last_6' | 'last_12' | 'this_year') => {
    const now = today();
    switch (shortcut) {
      case 'current_month':
        onChange({ from: monthStart(now), to: monthEnd(now) });
        break;
      case 'last_month': {
        const last = addMonthsISO(now, -1);
        onChange({ from: monthStart(last), to: monthEnd(last) });
        break;
      }
      case 'last_3': {
        const start = monthStart(addMonthsISO(now, -2));
        onChange({ from: start, to: monthEnd(now) });
        break;
      }
      case 'last_6': {
        const start = monthStart(addMonthsISO(now, -5));
        onChange({ from: start, to: monthEnd(now) });
        break;
      }
      case 'last_12': {
        const start = monthStart(addMonthsISO(now, -11));
        onChange({ from: start, to: monthEnd(now) });
        break;
      }
      case 'this_year': {
        const year = now.slice(0, 4);
        onChange({ from: `${year}-01-01`, to: `${year}-12-31` });
        break;
      }
    }
    setOpen(false);
  };

  const handleCustomApply = () => {
    if (customRange?.from && customRange?.to) {
      const fStr = format(customRange.from, 'yyyy-MM-dd');
      const tStr = format(customRange.to, 'yyyy-MM-dd');
      onChange({ from: fStr <= tStr ? fStr : tStr, to: fStr <= tStr ? tStr : fStr });
      setOpen(false);
    }
  };

  return (
    <div className="flex items-center rounded-lg border bg-card p-0.5 shadow-xs">
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePrevMonth}
        aria-label="Mês anterior"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 font-medium text-foreground hover:bg-muted/80 capitalize"
            >
              <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <span>{label}</span>
            </Button>
          }
        />
        <PopoverContent className="w-auto p-3" align="start">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="justify-start text-xs"
                onClick={() => applyShortcut('current_month')}
              >
                Este mês
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start text-xs"
                onClick={() => applyShortcut('last_month')}
              >
                Mês passado
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start text-xs"
                onClick={() => applyShortcut('last_3')}
              >
                Últimos 3 meses
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start text-xs"
                onClick={() => applyShortcut('last_6')}
              >
                Últimos 6 meses
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start text-xs"
                onClick={() => applyShortcut('last_12')}
              >
                Últimos 12 meses
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start text-xs"
                onClick={() => applyShortcut('this_year')}
              >
                Este ano
              </Button>
            </div>

            <div className="border-t pt-2 mt-1">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Personalizado:</p>
              <Calendar
                mode="range"
                selected={customRange}
                onSelect={setCustomRange}
                locale={ptBR}
                numberOfMonths={1}
                className="rounded-md border p-1"
              />
              <Button
                size="sm"
                className="w-full mt-2"
                disabled={!customRange?.from || !customRange?.to}
                onClick={handleCustomApply}
              >
                Aplicar intervalo
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleNextMonth}
        aria-label="Próximo mês"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
      >
        <ChevronRightIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}

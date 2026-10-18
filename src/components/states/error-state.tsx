import * as React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ErrorStateProps {
  message?: string;
  retry?: () => void;
}

export function ErrorState({ message = 'Ocorreu um erro inesperado.', retry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 border border-destructive/20 rounded-xl bg-destructive/5 text-destructive">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mb-4">
        <AlertCircle className="w-6 h-6 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">Algo deu errado</h3>
      <p className="text-sm text-muted-foreground max-w-sm mt-1">{message}</p>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry} className="mt-6 gap-2">
          <RotateCcw className="w-4 h-4" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

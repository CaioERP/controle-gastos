'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { login, type LoginState } from './actions';
import { Lock } from 'lucide-react';

export function LoginForm({ totpEnabled }: { totpEnabled: boolean }) {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const [state, formAction, isPending] = useActionState(login, undefined as LoginState | undefined);

  return (
    <Card className="w-full max-w-sm shadow-lg">
      <CardHeader className="text-center space-y-1">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
          <Lock className="h-6 w-6" />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight">Controle de Gastos</CardTitle>
        <CardDescription>
          {totpEnabled
            ? 'Digite a senha e o código do app autenticador'
            : 'Digite a senha para acessar o sistema'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              placeholder="••••••••"
              disabled={isPending}
            />
          </div>

          {totpEnabled && (
            <div className="space-y-2">
              <Label htmlFor="code">Código de 6 dígitos</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                required
                placeholder="123 456"
                disabled={isPending}
              />
            </div>
          )}

          {state?.error && (
            <p className="text-sm font-medium text-destructive" role="alert">
              {state.error.message}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

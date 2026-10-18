'use client';

import { useActionState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { login, type LoginState } from './actions';
import { Lock } from 'lucide-react';

function LoginForm() {
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
        <CardDescription>Digite a senha para acessar o sistema</CardDescription>
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

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/30">
      <Suspense fallback={<div className="text-muted-foreground text-sm">Carregando...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

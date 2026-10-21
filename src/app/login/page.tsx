import { Suspense } from 'react';
import { LoginForm } from './login-form';

// Lê o ambiente a cada requisição: o campo do 2FA aparece só com APP_TOTP_SECRET configurado.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const totpEnabled = Boolean(process.env.APP_TOTP_SECRET);
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/30">
      <Suspense fallback={<div className="text-muted-foreground text-sm">Carregando...</div>}>
        <LoginForm totpEnabled={totpEnabled} />
      </Suspense>
    </div>
  );
}

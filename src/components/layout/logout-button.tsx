import { cookies } from 'next/headers';
import { logout } from '@/app/login/actions';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { SESSION_COOKIE } from '@/server/auth/session';

export async function LogoutButton() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.has(SESSION_COOKIE);
  const isAuthDisabled = process.env.AUTH_DISABLED === 'true' && process.env.NODE_ENV !== 'production';

  if (isAuthDisabled && !hasSession) {
    return null;
  }

  return (
    <form action={logout}>
      <Button variant="ghost" size="sm" type="submit" className="gap-2 text-muted-foreground hover:text-destructive">
        <LogOut className="h-4 w-4" />
        <span>Sair</span>
      </Button>
    </form>
  );
}

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/server/auth/session';
import { authConfigured, authDisabled, hasValidSession } from '@/server/auth/guard';

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Arquivos estáticos e rotas com segredo próprio (jobs: CRON_SECRET; webhook: PLUGGY_WEBHOOK_SECRET)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/webhooks/') ||
    pathname.startsWith('/api/jobs/')
  ) {
    return NextResponse.next();
  }

  // 2. Auth desabilitada em ambiente de desenvolvimento/teste
  if (authDisabled()) {
    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // 3. Em produção, se não estiver configurado, retorna erro 500
  if (process.env.NODE_ENV === 'production' && !authConfigured()) {
    return new NextResponse('Autenticação não configurada', { status: 500 });
  }

  const isAuthenticated = await hasValidSession(request.cookies.get(SESSION_COOKIE)?.value);

  // 4. Se usuário está logado
  if (isAuthenticated) {
    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // 5. Se não autenticado
  if (pathname === '/login') {
    return NextResponse.next();
  }

  // Rotas de API retornam 401 JSON
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'Não autenticado' } },
      { status: 401 }
    );
  }

  // Demais rotas redirecionam para /login com ?next=
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname + search);
  return NextResponse.redirect(loginUrl);
}

// Next 16 renomeou middleware para proxy, mas exportamos ambos para retrocompatibilidade
export { proxy as middleware };
export default proxy;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

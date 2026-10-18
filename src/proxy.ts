import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/server/auth/session';

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Arquivos estáticos e rotas públicas liberadas
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/jobs')
  ) {
    return NextResponse.next();
  }

  // 2. Auth desabilitada em ambiente de desenvolvimento/teste
  const isAuthDisabled = process.env.AUTH_DISABLED === 'true' && process.env.NODE_ENV !== 'production';
  if (isAuthDisabled) {
    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // 3. Em produção, se não estiver configurado, retorna erro 500
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SESSION_SECRET || !process.env.APP_PASSWORD_HASH) {
      return new NextResponse('Autenticação não configurada', { status: 500 });
    }
  }

  const sessionSecret = process.env.SESSION_SECRET;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isAuthenticated = Boolean(token && sessionSecret && (await verifySessionToken(token, sessionSecret)));

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

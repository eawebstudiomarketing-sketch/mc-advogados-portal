import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = ["/admin", "/dashboard", "/account", "/assistente"];

// Checagem otimista apenas: só confirma que existe uma sessão válida e
// aproveita pra renovar o token antes de expirar. A checagem de verdade
// (role, client_id) fica na DAL (src/lib/dal.ts), chamada dentro de cada
// layout protegido — RLS no Postgres é a última linha de defesa.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isProtected && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname === "/login" && user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    {
      // Requests de prefetch do <Link> (Next.js dispara um prefetch em
      // paralelo pra cada link visível, ex: os itens do menu lateral) não
      // devem gatilhar renovação de sessão — o resultado é descartado se o
      // usuário nunca navegar pra lá, e várias renovações concorrentes
      // usando o mesmo refresh token (uso único) fazem uma delas falhar e
      // limpar o cookie de sessão de verdade, derrubando o usuário no meio
      // de uma ação real (ex: enviando um documento). A checagem de
      // `request.headers` dentro da função não funciona pra isso — o
      // Next.js remove esses headers do `request` antes do Proxy rodar,
      // então o filtro só funciona aqui, no matcher. A DAL já garante a
      // proteção de verdade dentro de cada página/layout de qualquer forma.
      source: "/((?!_next/static|_next/image|favicon.ico|brand/|sw.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

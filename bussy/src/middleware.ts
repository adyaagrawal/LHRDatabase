import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/auth/callback"];
const LIMBO_PATHS = ["/pending", "/denied"];

/**
 * Gate every route:
 *  - signed out          → /login
 *  - pending / denied    → /pending or /denied only
 *  - approved            → everything (role checks happen in pages + RLS)
 */
export async function middleware(request: NextRequest) {
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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const path = request.nextUrl.pathname;
  const redirectTo = (to: string, keepNext = false) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    if (keepNext && path !== "/") url.searchParams.set("next", path + request.nextUrl.search);
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  // IMPORTANT: getUser() also refreshes the session cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (path.startsWith("/auth/callback")) return response;

  if (!user) {
    if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return response;
    return redirectTo("/login", true);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("access_status")
    .eq("id", user.id)
    .maybeSingle();
  const status = (profile?.access_status as string | undefined) ?? "pending";

  if (status === "approved") {
    if (path === "/login" || LIMBO_PATHS.includes(path)) return redirectTo("/");
    return response;
  }

  const target = status === "denied" ? "/denied" : "/pending";
  if (path === target) return response;
  return redirectTo(target);
}

export const config = {
  matcher: [
    // everything except static files and images
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

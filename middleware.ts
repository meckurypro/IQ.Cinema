import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired — required for Server Components to see auth state
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isGated = pathname.startsWith("/admin") || pathname.startsWith("/creator");

  if (isGated) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, creator_status")
      .eq("id", user.id)
      .single();

    // Admin dashboard: logged in but not an admin (viewer/creator/partner/
    // staff all included) -> home.
    if (pathname.startsWith("/admin")) {
      if (profile?.role !== "admin") {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        return NextResponse.redirect(url);
      }
      return response;
    }

    // /creator/apply is how a viewer BECOMES a creator — any logged-in user
    // can reach it, no role required.
    if (pathname === "/creator/apply") {
      return response;
    }

    // /creator/withdraw is a partner-only capability (or admin) — a
    // non-partner creator gets bounced back to the dashboard, where the
    // Partner Program progress card lives.
    if (pathname === "/creator/withdraw") {
      const isPartnerOrAdmin = profile?.role === "admin" || profile?.creator_status === "partner";
      if (!isPartnerOrAdmin) {
        const url = request.nextUrl.clone();
        url.pathname = "/creator/dashboard";
        url.search = "";
        return NextResponse.redirect(url);
      }
      return response;
    }

    // Everything else under /creator (dashboard, upload, future subpages)
    // requires an actual creator or admin account — a plain viewer gets
    // routed to the application page instead of home, since that's the
    // actual next step for them.
    const isCreatorOrAdmin = profile?.role === "creator" || profile?.role === "admin";
    if (!isCreatorOrAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/creator/apply";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;
  const isGated = pathname.startsWith("/admin") || pathname.startsWith("/creator");

  // Every route except /admin and /creator is public — Home, For You,
  // Library, Rewards, Profile, Wallet, Watch, Search, auth pages all read
  // the current user client-side via useAuth (browser client, no cookies
  // needed) or don't need it at all. auth.getUser() is a real network call
  // to Supabase's auth server, not a local JWT decode, so it was adding a
  // full extra round trip to the critical path of literally every
  // navigation in the app before this rewrite. Skip it entirely unless the
  // route actually needs server-side gating.
  if (!isGated) {
    return response;
  }

  let gatedResponse = response;

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
          gatedResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            gatedResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Only reached for /admin and /creator, where we genuinely need to know
  // who's asking before deciding whether to redirect.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, creator_status, is_admin")
      .eq("id", user.id)
      .single();

    // Admin dashboard: logged in but not an admin -> home. is_admin is now
    // independent of content tier, so an admin who's also a plain viewer
    // (or a creator, or a partner) still gets in.
    if (pathname.startsWith("/admin")) {
      if (!profile?.is_admin) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        return NextResponse.redirect(url);
      }
      return gatedResponse;
    }

    // /creator/apply is how a viewer BECOMES a creator — any logged-in user
    // can reach it, no role required.
    if (pathname === "/creator/apply") {
      return gatedResponse;
    }

    // /creator/withdraw is a partner-only capability (or admin) — a
    // non-partner creator gets bounced back to the dashboard, where the
    // Partner Program progress card lives.
    if (pathname === "/creator/withdraw") {
      const isPartnerOrAdmin = profile?.is_admin || profile?.creator_status === "partner";
      if (!isPartnerOrAdmin) {
        const url = request.nextUrl.clone();
        url.pathname = "/creator/dashboard";
        url.search = "";
        return NextResponse.redirect(url);
      }
      return gatedResponse;
    }

    // Everything else under /creator (dashboard, upload, future subpages)
    // requires an actual creator or admin account — a plain viewer gets
    // routed to the application page instead of home, since that's the
    // actual next step for them.
    const isCreatorOrAdmin = profile?.role === "creator" || profile?.is_admin;
    if (!isCreatorOrAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/creator/apply";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return gatedResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            maxAge: 60 * 60 * 48,
          }),
        );
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });

  // Validates the access token and rotates it from the refresh token when
  // needed. This prevents the apparent logout after the short-lived JWT ends.
  await supabase.auth.getClaims();
  const referral = request.nextUrl.searchParams.get("ref")?.trim().toUpperCase();
  if (referral && /^[A-Z0-9]{6,20}$/u.test(referral)) {
    response.cookies.set("tdg_referral", referral, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });
  }
  return response;
}

import Link from "next/link";
import { isSupabaseConfigured } from "../lib/config";
import { createSupabaseServerClient } from "../lib/supabase/server";

export async function SiteHeader({ dark = false }: { dark?: boolean }) {
  let accountHref = "/ingresar?next=%2Fmi-manada";
  let accountLabel = "MI CUENTA";
  let modeHref = "";
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role,active")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (profile?.active) {
        accountHref =
          profile.role === "ADMIN"
            ? "/admin"
            : profile.role === "GUIDE"
              ? "/admin/hikes"
              : "/mi-manada";
        accountLabel =
          profile.role === "ADMIN"
            ? "ADMINISTRAR"
            : profile.role === "GUIDE"
              ? "MIS HIKES"
              : "MI MANADA";
        if (profile.role === "ADMIN" || profile.role === "GUIDE")
          modeHref = "/admin/hike-mode";
      }
    }
  }
  return (
    <header className={`site-header ${dark ? "header-dark" : ""}`}>
      <Link className="wordmark" href="/">
        THE DOGGY <span>GANG</span>
      </Link>
      <nav className="desktop-nav" aria-label="Navegación principal">
        <Link href="/#aventuras">Aventuras</Link>
        <Link href="/tienda">Tienda</Link>
        <Link href="/#manada">La manada</Link>
        <Link href="/#como-funciona">¿Cómo funciona?</Link>
      </nav>
      <Link className="mobile-store-link" href={modeHref || "/tienda"}>
        {modeHref ? "MODO HIKE" : "TIENDA"}
      </Link>
      <Link className="header-account" href={accountHref}>
        {accountLabel} <span aria-hidden="true">→</span>
      </Link>
    </header>
  );
}

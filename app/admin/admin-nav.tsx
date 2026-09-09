import Link from "next/link";
import {
  BadgeDollarSign,
  Bolt,
  Camera,
  ChartNoAxesCombined,
  ChevronDown,
  House,
  Menu,
  Mountain,
  PanelsTopLeft,
  Users,
  ShoppingBag,
  ReceiptText,
  UserCog,
  CreditCard,
} from "lucide-react";
import { createSupabaseServerClient } from "../lib/supabase/server";

const sections = [
  { href: "/admin", label: "Dashboard", icon: House },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/hikes", label: "Hikes", icon: Mountain },
  { href: "/admin/reservaciones", label: "Reservaciones", icon: ReceiptText },
  { href: "/admin/pagos", label: "Pagos", icon: BadgeDollarSign },
  { href: "/admin/configuracion-pagos", label: "Configuración de pagos", icon: CreditCard },
  { href: "/admin/fotos", label: "Fotografías", icon: Camera },
  { href: "/admin/productos", label: "Productos", icon: ShoppingBag },
  { href: "/admin/reportes", label: "Reportes", icon: ChartNoAxesCombined },
  { href: "/admin/sitio", label: "Sitio", icon: PanelsTopLeft },
  { href: "/admin/equipo", label: "Equipo", icon: UserCog },
] as const;

async function navigationForCurrentRole() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };
  const guide = profile?.role === "GUIDE";
  return { role: guide ? "GUÍA" : "ADMIN", sections: guide ? sections.filter((item) => item.href === "/admin/hikes") : sections };
}

export async function AdminNav({ active, hikeId }: { active: string; hikeId?: string | null }) {
  const navigation = await navigationForCurrentRole();
  return (
    <aside className="admin-sidebar">
      <Link className="wordmark" href="/">THE DOGGY <span>GANG</span></Link>
      <span className="admin-badge">{navigation.role}</span>
      <nav>
        {navigation.sections.map(({ href, label, icon: Icon }) => (
          <Link className={active === href ? "active" : ""} href={href} key={href}>
            <Icon aria-hidden="true" /> {label}
          </Link>
        ))}
      </nav>
      <Link className="mode-link" href={hikeId ? `/admin/hike-mode?hike=${hikeId}` : "/admin/hike-mode"}>
        <Bolt aria-hidden="true" /> INICIAR MODO HIKE
      </Link>
    </aside>
  );
}

export async function AdminMobileNav() {
  const navigation = await navigationForCurrentRole();
  return (
    <nav className="admin-mobile-nav" aria-label="Navegación administrativa">
      <details>
        <summary><Menu aria-hidden="true" /><span>MENÚ DEL ADMINISTRADOR</span><ChevronDown aria-hidden="true" /></summary>
        <div>
          {navigation.sections.map(({ href, label, icon: Icon }) => <Link href={href} key={href}><Icon aria-hidden="true" /><span>{label}</span></Link>)}
          <Link href="/admin/hike-mode"><Bolt aria-hidden="true" /><span>Modo hike</span></Link>
        </div>
      </details>
    </nav>
  );
}

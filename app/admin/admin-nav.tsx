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
} from "lucide-react";

const sections = [
  { href: "/admin", label: "Dashboard", icon: House },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/hikes", label: "Hikes", icon: Mountain },
  { href: "/admin/reservaciones", label: "Reservaciones", icon: ReceiptText },
  { href: "/admin/pagos", label: "Pagos", icon: BadgeDollarSign },
  { href: "/admin/fotos", label: "Fotografías", icon: Camera },
  { href: "/admin/productos", label: "Productos", icon: ShoppingBag },
  { href: "/admin/reportes", label: "Reportes", icon: ChartNoAxesCombined },
  { href: "/admin/sitio", label: "Sitio", icon: PanelsTopLeft },
  { href: "/admin/equipo", label: "Equipo", icon: UserCog },
] as const;

export function AdminNav({ active, hikeId }: { active: string; hikeId?: string | null }) {
  return (
    <aside className="admin-sidebar">
      <Link className="wordmark" href="/">THE DOGGY <span>GANG</span></Link>
      <span className="admin-badge">ADMIN</span>
      <nav>
        {sections.map(({ href, label, icon: Icon }) => (
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

export function AdminMobileNav() {
  return (
    <nav className="admin-mobile-nav" aria-label="Navegación administrativa">
      <details>
        <summary><Menu aria-hidden="true" /><span>MENÚ DEL ADMINISTRADOR</span><ChevronDown aria-hidden="true" /></summary>
        <div>
          {sections.map(({ href, label, icon: Icon }) => <Link href={href} key={href}><Icon aria-hidden="true" /><span>{label}</span></Link>)}
          <Link href="/admin/hike-mode"><Bolt aria-hidden="true" /><span>Modo hike</span></Link>
        </div>
      </details>
    </nav>
  );
}

import Link from "next/link";
import {
  BadgeDollarSign,
  Bolt,
  Camera,
  ChartNoAxesCombined,
  House,
  Mountain,
  PanelsTopLeft,
  ReceiptText,
} from "lucide-react";

const sections = [
  { href: "/admin", label: "Dashboard", icon: House },
  { href: "/admin/hikes", label: "Hikes", icon: Mountain },
  { href: "/admin/reservaciones", label: "Reservaciones", icon: ReceiptText },
  { href: "/admin/pagos", label: "Pagos", icon: BadgeDollarSign },
  { href: "/admin/fotos", label: "Fotografías", icon: Camera },
  { href: "/admin/reportes", label: "Reportes", icon: ChartNoAxesCombined },
  { href: "/admin/sitio", label: "Sitio", icon: PanelsTopLeft },
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
      {sections.map(({ href, label }) => <Link href={href} key={href}>{label.toUpperCase()}</Link>)}
      <Link href="/admin/hike-mode">MODO HIKE</Link>
    </nav>
  );
}

import Link from "next/link";
import { requireStaffSession } from "../../../lib/auth/guards";
import { NewHikeForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nueva aventura | The Doggy Gang Admin" };

export default async function NewHikePage() {
  const session = await requireStaffSession("/admin/hikes/nuevo");
  return (
    <main className="admin-form-page">
      <header>
        <Link href="/admin">← DASHBOARD</Link>
        <Link className="wordmark" href="/">
          THE DOGGY <span>GANG</span>
        </Link>
        <span>ADMIN</span>
      </header>
      <section>
        <p className="eyebrow">ADMIN · HIKES</p>
        <h1>
          Crea la próxima
          <br />
          aventura.
        </h1>
        <p>
          Publica la información esencial ahora. Después podrás sumar
          transporte, responsiva, fotos y punto de encuentro.
        </p>
        <NewHikeForm demo={session.mode === "demo"} />
      </section>
    </main>
  );
}

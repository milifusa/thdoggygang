import type { Metadata } from "next";
import Link from "next/link";
import { safeReturnPath } from "../../lib/auth/destination";

export const metadata: Metadata = {
  title: "Confirmar acceso | The Doggy Gang",
  robots: { index: false, follow: false },
};

const allowedTypes = new Set(["email", "invite", "recovery", "magiclink"]);

export default async function ConfirmAccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
    next?: string;
    redirect_to?: string;
  }>;
}) {
  const query = await searchParams;
  const tokenHash = query.token_hash?.trim() ?? "";
  const type = allowedTypes.has(query.type ?? "") ? query.type! : "";
  let redirectNext: string | null = null;
  try {
    redirectNext = safeReturnPath(
      query.redirect_to
        ? new URL(query.redirect_to).searchParams.get("next")
        : null,
    );
  } catch {
    redirectNext = null;
  }
  const next = redirectNext ?? safeReturnPath(query.next) ?? "/mi-manada";
  const valid = Boolean(tokenHash && type);

  return (
    <main className="auth-confirm-page">
      <section>
        <Link className="wordmark" href="/">
          THE DOGGY <span>GANG</span>
        </Link>
        <p className="eyebrow">ACCESO SEGURO</p>
        <h1>{valid ? "Entra a tu manada." : "Este enlace no es válido."}</h1>
        <p>
          {valid
            ? "Confirma el acceso para abrir tu cuenta. Este paso evita que una vista previa del correo use el enlace antes que tú."
            : "Solicita un nuevo acceso desde la página de ingreso."}
        </p>
        {valid ? (
          <form action="/auth/confirm/verify" method="post">
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="next" value={next} />
            <button className="button button-primary" type="submit">
              CONFIRMAR Y ENTRAR
            </button>
          </form>
        ) : (
          <Link
            className="button button-primary"
            href={`/ingresar?next=${encodeURIComponent(next)}`}
          >
            PEDIR OTRO ACCESO
          </Link>
        )}
        <small>El enlace sólo puede utilizarse una vez.</small>
      </section>
    </main>
  );
}

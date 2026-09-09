"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function HikeQuickActions({
  id,
  past,
  published,
  cancelled,
}: {
  id: string;
  past: boolean;
  published: boolean;
  cancelled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function action(
    value: "DUPLICATE" | "PUBLISH" | "UNPUBLISH" | "CANCEL",
  ) {
    const prompt =
      value === "DUPLICATE"
        ? "¿Crear una copia en borrador?"
        : value === "CANCEL"
          ? "¿Cancelar este hike y todas sus reservaciones activas? Los pagos confirmados quedarán marcados para reembolso."
          : value === "UNPUBLISH"
            ? "¿Despublicar este hike?"
            : "¿Publicar este hike?";
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/admin/hikes/${id}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: value }),
    });
    const result = (await response.json()) as {
      id?: string;
      error?: string;
      affectedBookings?: number;
    };
    setBusy(false);
    if (!response.ok)
      return setMessage(result.error ?? "No pudimos completar la acción.");
    if (result.id) {
      router.push(`/admin/hikes/${result.id}/editar`);
      return;
    }
    if (value === "CANCEL")
      setMessage(
        `${result.affectedBookings ?? 0} reservaciones canceladas; revisa los reembolsos en Pagos.`,
      );
    router.refresh();
  }
  return (
    <div className="hike-card-actions">
      <Link className="button button-primary" href={`/admin/hikes/${id}`}>
        {past ? "VER RESULTADOS" : "ADMINISTRAR"}
      </Link>
      <details>
        <summary>OTRAS ACCIONES</summary>
        <div>
          <Link href={`/admin/hikes/${id}/editar`}>EDITAR</Link>
          <Link href={`/admin/hikes/${id}?tab=inscripciones`}>
            PARTICIPANTES
          </Link>
          <Link href={`/admin/hike-mode?hike=${id}`}>MODO HIKE</Link>
          <Link href={`/admin/hikes/${id}?tab=fotos`}>FOTOS</Link>
          <Link href={`/admin/hikes/${id}?tab=pagos`}>FINANZAS</Link>
          <button disabled={busy} onClick={() => void action("DUPLICATE")}>
            DUPLICAR
          </button>
          {!cancelled && (
            <button
              disabled={busy}
              onClick={() => void action(published ? "UNPUBLISH" : "PUBLISH")}
            >
              {published ? "DESPUBLICAR" : "PUBLICAR"}
            </button>
          )}
          {!past && !cancelled && (
            <button
              className="danger"
              disabled={busy}
              onClick={() => void action("CANCEL")}
            >
              CANCELAR
            </button>
          )}
        </div>
      </details>
      {message && <small role="alert">{message}</small>}
    </div>
  );
}

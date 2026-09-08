import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { decryptQrToken } from "../../lib/security/qr-token";
import { LiveQr } from "./qr";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reservación confirmada | The Doggy Gang" };

export default async function LiveConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const { booking: bookingId } = await searchParams;
  if (!bookingId) redirect("/mi-manada");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    redirect(
      `/ingresar?next=/reservar/confirmacion?booking=${encodeURIComponent(bookingId)}`,
    );
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, status, total_cents, currency, hike:hikes(name, starts_at, location_name), booking_participants(id), booking_dogs(id), transport_reservations(id)",
    )
    .eq("id", bookingId)
    .single();
  if (!booking) redirect("/mi-manada");
  const { data: tokenRow } = await supabase
    .from("booking_checkin_tokens")
    .select("token_ciphertext")
    .eq("booking_id", booking.id)
    .is("revoked_at", null)
    .maybeSingle();
  let token: string | null = null;
  if (tokenRow?.token_ciphertext) {
    try {
      token = await decryptQrToken(tokenRow.token_ciphertext);
    } catch {
      token = null;
    }
  }
  const hike = Array.isArray(booking.hike) ? booking.hike[0] : booking.hike;
  const paid = booking.status === "CONFIRMED";
  return (
    <main className="wizard-page">
      <header className="wizard-header">
        <Link className="wordmark" href="/">
          THE DOGGY <span>GANG</span>
        </Link>
        <Link href="/mi-manada" className="close-wizard">
          ×
        </Link>
      </header>
      <section className="confirmation">
        {paid ? (
          <>
            <div className="success-mark">
              <CircleCheck aria-hidden="true" />
            </div>
            <p className="eyebrow">PAGO CONFIRMADO</p>
            <h1>
              ¡Ya eres parte de
              <br />
              esta aventura!
            </h1>
            <p>
              Nos vemos en <strong>{hike?.name}</strong>. Guarda este QR; lo
              escanearemos al llegar.
            </p>
            {token ? (
              <LiveQr token={token} reference={booking.booking_number} />
            ) : (
              <div className="pending-card">
                <strong>Estamos generando tu QR</strong>
                <p>
                  Tu pago ya está confirmado. Actualiza esta página en unos
                  segundos.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="processing-mark">···</div>
            <p className="eyebrow">CONFIRMANDO PAGO</p>
            <h1>
              Un momento,
              <br />
              ya casi está.
            </h1>
            <p>Stripe está confirmando tu pago. No necesitas pagar otra vez.</p>
            <div className="pending-card">
              <span>ESTADO</span>
              <strong>Procesando confirmación segura</strong>
              <p>Si tarda más de unos segundos, actualiza la página.</p>
            </div>
          </>
        )}
        <div className="confirmation-actions">
          <Link className="button button-dark" href="/mi-manada">
            VER MIS AVENTURAS →
          </Link>
          <Link
            className="button outline-button"
            href={`/reservar/confirmacion?booking=${booking.id}`}
          >
            ACTUALIZAR
          </Link>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { CalendarPlus, CircleCheck, MapPin, PackageCheck, PawPrint, TentTree, UsersRound } from "lucide-react";
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
      "id, booking_number, status, total_cents, credit_applied_cents, currency, hike:hikes(name,slug,starts_at,location_name), booking_participants(id), booking_dogs(id), transport_reservations(id), booking_camping_selections(option_name,quantity,person_profile_ids), booking_product_selections(quantity,variant,product:products(name))",
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
  const campingSelections = Array.isArray(booking.booking_camping_selections)
    ? booking.booking_camping_selections
    : [];
  const productSelections = Array.isArray(booking.booking_product_selections)
    ? booking.booking_product_selections
    : [];
  const participantCount = Array.isArray(booking.booking_participants)
    ? booking.booking_participants.length
    : 0;
  const dogCount = Array.isArray(booking.booking_dogs)
    ? booking.booking_dogs.length
    : 0;
  const transportCount = Array.isArray(booking.transport_reservations)
    ? booking.transport_reservations.length
    : 0;
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
        {paid && (
          <div className="motion-burst" aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => <i key={index} />)}
          </div>
        )}
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
            {booking.credit_applied_cents > 0 && (
              <div className="confirmation-credit-note">
                Usaste{" "}
                <strong>
                  {(booking.credit_applied_cents / 100).toLocaleString("es-MX", {
                    style: "currency",
                    currency: "MXN",
                  })}
                </strong>{" "}
                de crédito de tu manada en esta reservación.
              </div>
            )}
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
            <div className="confirmation-trip-summary">
              <article>
                <UsersRound aria-hidden="true" />
                <span>PERSONAS</span>
                <strong>{participantCount}</strong>
              </article>
              <article>
                <PawPrint aria-hidden="true" />
                <span>PERRITOS</span>
                <strong>{dogCount}</strong>
              </article>
              <article>
                <MapPin aria-hidden="true" />
                <span>TRASLADO</span>
                <strong>{transportCount ? `${transportCount} en transporte` : "Por cuenta propia"}</strong>
              </article>
              {campingSelections.map((selection) => (
                <article key={selection.option_name}>
                  <TentTree aria-hidden="true" />
                  <span>CAMPING</span>
                  <strong>{selection.option_name}</strong>
                  <small>{selection.person_profile_ids?.length ?? selection.quantity} persona(s)</small>
                </article>
              ))}
              {productSelections.length > 0 && (
                <article className="confirmation-products">
                  <PackageCheck aria-hidden="true" />
                  <span>PRODUCTOS PARA RECOGER</span>
                  <strong>
                    {productSelections.map((selection) => {
                      const product = Array.isArray(selection.product)
                        ? selection.product[0]
                        : selection.product;
                      return `${selection.quantity} × ${product?.name ?? "Producto"}${selection.variant ? ` · ${selection.variant}` : ""}`;
                    }).join(" | ")}
                  </strong>
                </article>
              )}
            </div>
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
          {paid && hike?.slug ? (
            <>
              <Link className="button button-dark" href={`/mi-manada/aventuras/${hike.slug}`}>
                ABRIR CENTRO DE AVENTURA →
              </Link>
              <a className="button outline-button" href={`/api/bookings/${booking.id}/calendar`}>
                <CalendarPlus aria-hidden="true" /> AGREGAR AL CALENDARIO
              </a>
              <a className="button outline-button" href={`/api/bookings/${booking.id}/guide`}>
                DESCARGAR GUÍA
              </a>
            </>
          ) : (
            <Link
              className="button button-dark"
              href={`/reservar/confirmacion?booking=${booking.id}`}
            >
              ACTUALIZAR ESTADO
            </Link>
          )}
          <Link className="button outline-button" href="/mi-manada">
            VER MIS AVENTURAS
          </Link>
        </div>
      </section>
    </main>
  );
}

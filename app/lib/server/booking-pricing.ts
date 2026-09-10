import { dateInMexico, isFreeChildForDate } from "../person-age";
import { createSupabaseServiceClient } from "../supabase/service";

type ParticipantSnapshot = {
  birth_date?: unknown;
  is_minor?: unknown;
};

export async function recalculateBookingTotal({
  bookingId,
  profileId,
}: {
  bookingId: string;
  profileId: string;
}) {
  const service = createSupabaseServiceClient();
  const { data: booking, error } = await service
    .from("bookings")
    .select(
      "id,profile_id,hike:hikes(starts_at,price_cents,dog_price_cents,pricing_mode),booking_participants(snapshot),booking_dogs(id),transport_reservations(price_cents),booking_product_selections(quantity,unit_price_cents)",
    )
    .eq("id", bookingId)
    .eq("profile_id", profileId)
    .single();
  if (error || !booking) throw new Error("Reservación no disponible.");

  const hike = Array.isArray(booking.hike) ? booking.hike[0] : booking.hike;
  if (!hike)
    throw new Error("El hike de la reservación ya no está disponible.");
  const hikeDate = dateInMexico(hike.starts_at);
  let freeChildren = 0;
  for (const participant of booking.booking_participants) {
    const snapshot = (participant.snapshot ?? {}) as ParticipantSnapshot;
    const isMinor = snapshot.is_minor === true;
    const birthDate =
      typeof snapshot.birth_date === "string" ? snapshot.birth_date : null;
    if (isMinor && !birthDate)
      throw new Error("Agrega la fecha de nacimiento del menor antes de pagar.");
    if (
      isMinor &&
      birthDate &&
      isFreeChildForDate({ isMinor, birthDate }, hikeDate)
    )
      freeChildren += 1;
  }

  const billablePeople = booking.booking_participants.length - freeChildren;
  const dogCount = booking.booking_dogs.length;
  const hikeSubtotal =
    hike.pricing_mode === "PERSON_DOG_BUNDLE"
      ? billablePeople * hike.price_cents +
        Math.max(dogCount - billablePeople, 0) * hike.dog_price_cents
      : billablePeople * hike.price_cents + dogCount * hike.dog_price_cents;
  const transportSubtotal = booking.transport_reservations.reduce(
    (sum, reservation) => sum + reservation.price_cents,
    0,
  );
  const productSubtotal = booking.booking_product_selections.reduce(
    (sum, selection) =>
      sum + selection.quantity * selection.unit_price_cents,
    0,
  );
  const totalCents = hikeSubtotal + transportSubtotal + productSubtotal;
  const { error: updateError } = await service
    .from("bookings")
    .update({
      subtotal_cents: totalCents,
      total_cents: totalCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .eq("profile_id", profileId);
  if (updateError)
    throw new Error("No pudimos actualizar el total de la reservación.");

  return {
    totalCents,
    hikeSubtotal,
    transportSubtotal,
    productSubtotal,
    freeChildren,
  };
}

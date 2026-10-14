import { dateInMexico, isFreeChildForDate } from "../person-age";
import { createSupabaseServiceClient } from "../supabase/service";
import { relationArray } from "../supabase/relations";

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
      "id,profile_id,hike:hikes(starts_at,price_cents,dog_price_cents,pricing_mode),booking_participants(person_profile_id,snapshot),booking_dogs(id),transport_reservations(price_cents),booking_product_selections(quantity,unit_price_cents),booking_camping_selections(id,pricing_mode,quantity,unit_price_cents,person_profile_ids)",
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
  const participants = relationArray(booking.booking_participants);
  const dogs = relationArray(booking.booking_dogs);
  const transportReservations = relationArray(booking.transport_reservations);
  const productSelections = relationArray(booking.booking_product_selections);
  const campingSelections = relationArray(booking.booking_camping_selections);

  for (const participant of participants) {
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

  const billablePeople = participants.length - freeChildren;
  const dogCount = dogs.length;
  const hikeSubtotal =
    hike.pricing_mode === "PERSON_DOG_BUNDLE"
      ? billablePeople * hike.price_cents +
        Math.max(dogCount - billablePeople, 0) * hike.dog_price_cents
      : billablePeople * hike.price_cents + dogCount * hike.dog_price_cents;
  const transportSubtotal = transportReservations.reduce(
    (sum, reservation) => sum + reservation.price_cents,
    0,
  );
  const productSubtotal = productSelections.reduce(
    (sum, selection) =>
      sum + selection.quantity * selection.unit_price_cents,
    0,
  );
  const participantByProfileId = new Map(
    participants.map((participant) => [
      participant.person_profile_id,
      (participant.snapshot ?? {}) as ParticipantSnapshot,
    ]),
  );
  const adultCampingCount = campingSelections.reduce((sum, selection) => {
    const selectedIds = Array.isArray(selection.person_profile_ids)
      ? selection.person_profile_ids
      : [];
    const camperIds = selectedIds.length
      ? selectedIds
      : participants.map((participant) => participant.person_profile_id);
    return (
      sum +
      camperIds.filter((id) => {
        const snapshot = participantByProfileId.get(id);
        return snapshot && snapshot.is_minor !== true;
      }).length
    );
  }, 0);
  const campingSubtotal = campingSelections.reduce(
    (sum, selection) => {
      const selectedIds = Array.isArray(selection.person_profile_ids)
        ? selection.person_profile_ids
        : [];
      const camperIds = selectedIds.length
        ? selectedIds
        : participants.map((participant) => participant.person_profile_id);
      const adultCount = camperIds.filter((id) => {
        const snapshot = participantByProfileId.get(id);
        return snapshot && snapshot.is_minor !== true;
      }).length;
      return (
        sum +
        (selection.pricing_mode === "PER_PERSON"
          ? adultCount
          : selection.quantity) *
          selection.unit_price_cents
      );
    },
    0,
  );
  const campingQuantityUpdates = campingSelections
    .filter(
      (selection) =>
        selection.pricing_mode === "PER_PERSON" &&
        selection.quantity !== (() => {
          const selectedIds = Array.isArray(selection.person_profile_ids)
            ? selection.person_profile_ids
            : [];
          const camperIds = selectedIds.length
            ? selectedIds
            : participants.map((participant) => participant.person_profile_id);
          return camperIds.filter((id) => {
            const snapshot = participantByProfileId.get(id);
            return snapshot && snapshot.is_minor !== true;
          }).length;
        })(),
    )
    .map((selection) =>
      service
        .from("booking_camping_selections")
        .update({
          quantity: (() => {
            const selectedIds = Array.isArray(selection.person_profile_ids)
              ? selection.person_profile_ids
              : [];
            const camperIds = selectedIds.length
              ? selectedIds
              : participants.map((participant) => participant.person_profile_id);
            return camperIds.filter((id) => {
              const snapshot = participantByProfileId.get(id);
              return snapshot && snapshot.is_minor !== true;
            }).length;
          })(),
        })
        .eq("id", selection.id),
    );
  if (campingQuantityUpdates.length) {
    const results = await Promise.all(campingQuantityUpdates);
    if (results.some((result) => result.error))
      throw new Error("No pudimos actualizar el precio del camping.");
  }
  const totalCents =
    hikeSubtotal + transportSubtotal + productSubtotal + campingSubtotal;
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
    campingSubtotal,
    adultCampingCount,
    freeChildren,
  };
}

import {
  EMAIL_TEMPLATE_KEYS,
  type EmailTemplateKey,
} from "../email-template-config";
import { createSupabaseServiceClient } from "../supabase/service";
import {
  sendBookingReminder,
  sendUpcomingHikeReminder,
} from "./booking-reminder";
import { sendBrandedEmail } from "./email-renderer";

type DeliveryRow = {
  id: string;
  template_key: string;
  recipient: string;
  booking_id: string | null;
  profile_id: string | null;
  metadata: Record<string, unknown> | null;
};

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.thedoggygang.com"
  ).replace(/\/$/u, "");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}

export async function resendTrackedEmail({
  delivery,
  actorProfileId,
  idempotencyKey,
}: {
  delivery: DeliveryRow;
  actorProfileId: string;
  idempotencyKey: string;
}) {
  if (!EMAIL_TEMPLATE_KEYS.includes(delivery.template_key as EmailTemplateKey))
    throw new Error("La plantilla original ya no está disponible.");
  const trackingKey = `email-resend/${delivery.id}/${idempotencyKey}`.slice(
    0,
    240,
  );
  if (delivery.template_key === "BOOKING_REMINDER") {
    if (!delivery.booking_id)
      throw new Error("El correo no está ligado a una reservación.");
    return sendBookingReminder(delivery.booking_id, actorProfileId, {
      force: true,
      idempotencyKey: trackingKey,
      parentDeliveryId: delivery.id,
      source: "ADMIN",
    });
  }
  if (
    ["HIKE_REMINDER_7D", "HIKE_REMINDER_1D"].includes(delivery.template_key)
  ) {
    if (!delivery.booking_id)
      throw new Error("El correo no está ligado a una reservación.");
    return sendUpcomingHikeReminder(
      delivery.booking_id,
      delivery.template_key as "HIKE_REMINDER_7D" | "HIKE_REMINDER_1D",
      actorProfileId,
      {
        force: true,
        idempotencyKey: trackingKey,
        parentDeliveryId: delivery.id,
        source: "ADMIN",
      },
    );
  }

  const service = createSupabaseServiceClient();
  if (["AUTH_ACCESS", "TEAM_INVITE"].includes(delivery.template_key)) {
    const next =
      typeof delivery.metadata?.next === "string"
        ? delivery.metadata.next
        : delivery.template_key === "TEAM_INVITE"
          ? "/admin"
          : "/mi-manada";
    const generated = await service.auth.admin.generateLink({
      type: "magiclink",
      email: delivery.recipient,
      options: {
        redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (generated.error || !generated.data.properties?.hashed_token)
      throw new Error("No pudimos crear un enlace de acceso nuevo.");
    const confirm = new URL("/auth/confirm", siteUrl());
    confirm.searchParams.set(
      "token_hash",
      generated.data.properties.hashed_token,
    );
    confirm.searchParams.set(
      "type",
      generated.data.properties.verification_type,
    );
    confirm.searchParams.set("next", next);
    const userMetadata = generated.data.user?.user_metadata as
      Record<string, unknown> | undefined;
    const firstName =
      typeof userMetadata?.first_name === "string"
        ? userMetadata.first_name
        : "amigo";
    return sendBrandedEmail({
      key: delivery.template_key as "AUTH_ACCESS" | "TEAM_INVITE",
      to: delivery.recipient,
      variables: {
        nombre_cliente: firstName,
        rol:
          typeof delivery.metadata?.role === "string"
            ? delivery.metadata.role
            : "Integrante",
        url_acceso: confirm.toString(),
      },
      actionUrl: confirm.toString(),
      note: "Este es un enlace nuevo. Vence pronto y sólo puede utilizarse una vez.",
      tracking: {
        idempotencyKey: trackingKey,
        profileId: delivery.profile_id,
        actorProfileId,
        source: "ADMIN",
        parentDeliveryId: delivery.id,
        metadata: { ...(delivery.metadata ?? {}), next },
      },
    });
  }

  if (delivery.template_key === "WAITLIST_OFFER") {
    const entryId = delivery.metadata?.waitlistEntryId;
    if (typeof entryId !== "string")
      throw new Error("No encontramos la lista de espera original.");
    const { data: entry } = await service
      .from("waitlist_entries")
      .select(
        "profile_id,profile:profiles(first_name,email),hike:hikes(id,name,slug,starts_at)",
      )
      .eq("id", entryId)
      .single();
    const profile = Array.isArray(entry?.profile)
      ? entry.profile[0]
      : entry?.profile;
    const hike = Array.isArray(entry?.hike) ? entry.hike[0] : entry?.hike;
    if (!entry || !profile?.email || !hike)
      throw new Error("La oferta original ya no está disponible.");
    const actionUrl = `${siteUrl()}/reservar/${hike.slug}`;
    const when = formatDate(hike.starts_at);
    return sendBrandedEmail({
      key: "WAITLIST_OFFER",
      to: profile.email,
      variables: {
        nombre_cliente: profile.first_name || "amigo",
        hike: hike.name,
        fecha_hike: when,
        url_reserva: actionUrl,
      },
      actionUrl,
      detailLines: [hike.name, when],
      tracking: {
        idempotencyKey: trackingKey,
        profileId: entry.profile_id,
        actorProfileId,
        source: "ADMIN",
        parentDeliveryId: delivery.id,
        metadata: delivery.metadata ?? {},
      },
    });
  }

  if (delivery.template_key === "HIKE_CHANGED") {
    if (!delivery.booking_id)
      throw new Error("El correo no está ligado a una reservación.");
    const { data: booking } = await service
      .from("bookings")
      .select(
        "profile_id,profile:profiles(first_name,email),hike:hikes(id,name,slug,starts_at,meeting_point,location_name)",
      )
      .eq("id", delivery.booking_id)
      .single();
    const profile = Array.isArray(booking?.profile)
      ? booking.profile[0]
      : booking?.profile;
    const hike = Array.isArray(booking?.hike) ? booking.hike[0] : booking?.hike;
    if (!booking || !profile?.email || !hike)
      throw new Error("La aventura original ya no está disponible.");
    const actionUrl = `${siteUrl()}/mi-manada/aventuras/${hike.slug}`;
    const when = formatDate(hike.starts_at);
    const changes = Array.isArray(delivery.metadata?.changes)
      ? delivery.metadata.changes.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    return sendBrandedEmail({
      key: "HIKE_CHANGED",
      to: profile.email,
      variables: {
        nombre_cliente: profile.first_name || "amigo",
        hike: hike.name,
        fecha_hike: when,
        punto_encuentro: hike.meeting_point || hike.location_name,
        cambios: changes.join(", ") || "información de la aventura",
        url_aventura: actionUrl,
      },
      actionUrl,
      detailLines: [when, hike.meeting_point || hike.location_name],
      tracking: {
        idempotencyKey: trackingKey,
        bookingId: delivery.booking_id,
        profileId: booking.profile_id,
        actorProfileId,
        source: "ADMIN",
        parentDeliveryId: delivery.id,
        metadata: delivery.metadata ?? {},
      },
    });
  }
  throw new Error("Este tipo de correo todavía no admite reenvío.");
}

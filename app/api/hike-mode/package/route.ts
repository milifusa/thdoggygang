import { z } from "zod";
import { ensureBookingQrToken } from "../../../lib/domain/checkin-token";
import type {
  HikeBooking,
  HikeDelivery,
  HikeModeData,
} from "../../../lib/hike-mode-types";
import {
  hashSignedToken,
  signPayload,
  type OfflineAuthorizationPayload,
} from "../../../lib/security/signed-token";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  hike: z.string().uuid(),
  device: z.string().min(8).max(160),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    hike: url.searchParams.get("hike"),
    device: url.searchParams.get("device"),
  });
  if (!parsed.success)
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });

  const userClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  const { data: staff } = await userClient
    .from("profiles")
    .select("id,role,active")
    .eq("auth_user_id", user.id)
    .single();
  if (!staff?.active || !["ADMIN", "GUIDE"].includes(staff.role))
    return Response.json({ error: "No autorizado." }, { status: 403 });
  if (staff.role === "GUIDE") {
    const { data: assignment } = await userClient
      .from("guide_hikes")
      .select("hike_id")
      .eq("hike_id", parsed.data.hike)
      .eq("profile_id", staff.id)
      .maybeSingle();
    if (!assignment)
      return Response.json(
        { error: "No estás asignado a este hike." },
        { status: 403 },
      );
  }

  const service = createSupabaseServiceClient();
  const [
    hikeResult,
    hikesResult,
    bookingsResult,
    ordersResult,
    transportResult,
  ] = await Promise.all([
    service
      .from("hikes")
      .select("id,name,starts_at,location_name,meeting_point,capacity,max_dogs")
      .eq("id", parsed.data.hike)
      .is("deleted_at", null)
      .single(),
    service
      .from("hikes")
      .select("id,name,starts_at")
      .gte(
        "starts_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      )
      .is("deleted_at", null)
      .order("starts_at")
      .limit(30),
    service
      .from("bookings")
      .select(
        "id,booking_number,status,hike_id,total_cents,profile:profiles!bookings_profile_id_fkey(first_name,last_name,email,phone),booking_participants(id,snapshot),booking_dogs(id,snapshot),transport_reservations(id,booking_participant_id),signed_waivers(id,booking_participant_id,signed_at),check_ins(id,booking_participant_id,checked_in_at)",
      )
      .eq("hike_id", parsed.data.hike)
      .eq("status", "CONFIRMED")
      .order("created_at"),
    service
      .from("orders")
      .select(
        "id,order_number,booking_id,fulfillment_mode,pickup_hike_id,status,order_items(id,item_type,description,quantity,unit_price_cents,order_item_fulfillments(id,status,delivery_location,delivered_at))",
      )
      .eq("pickup_hike_id", parsed.data.hike)
      .eq("fulfillment_mode", "HIKE_PICKUP")
      .in("status", ["PAID", "UNDER_REVIEW"]),
    service
      .from("hike_transport_departures")
      .select("completed_at,passenger_count,note")
      .eq("hike_id", parsed.data.hike)
      .maybeSingle(),
  ]);
  if (hikeResult.error || !hikeResult.data)
    return Response.json({ error: "Hike no encontrado." }, { status: 404 });
  if (hikesResult.error || bookingsResult.error || ordersResult.error)
    return Response.json(
      {
        error:
          "No pudimos cargar la lista operativa. Actualiza el paquete e intenta nuevamente.",
      },
      { status: 500 },
    );
  const hike = hikeResult.data;
  const hikes = hikesResult.data ?? [];
  const rawBookings = bookingsResult.data ?? [];
  const transportDeparture = transportResult.data;

  const bookingIds = rawBookings.map((booking) => booking.id);
  const reservationOrdersResult = bookingIds.length
    ? await service
        .from("orders")
        .select(
          "id,order_number,booking_id,fulfillment_mode,pickup_hike_id,status,order_items(id,item_type,description,quantity,unit_price_cents,order_item_fulfillments(id,status,delivery_location,delivered_at))",
        )
        .in("booking_id", bookingIds)
        .in("status", ["PAID", "UNDER_REVIEW"])
    : { data: [], error: null };
  if (reservationOrdersResult.error)
    return Response.json(
      {
        error:
          "No pudimos cargar los artículos comprados. Actualiza el paquete e intenta nuevamente.",
      },
      { status: 500 },
    );
  const rawOrders = Array.from(
    new Map(
      [
        ...(ordersResult.data ?? []),
        ...(reservationOrdersResult.data ?? []),
      ].map((order) => [order.id, order]),
    ).values(),
  );

  const bookings = (rawBookings as unknown as HikeBooking[]).filter(
    (booking) =>
      booking.booking_participants.length > 0 &&
      booking.signed_waivers.length >= booking.booking_participants.length,
  );
  await Promise.all(
    bookings.map(async (booking) => {
      booking.qrToken = await ensureBookingQrToken(booking.id);
    }),
  );
  const deliveries: HikeDelivery[] = [];
  for (const order of rawOrders) {
    for (const item of order.order_items ?? []) {
      if (item.item_type !== "PRODUCT") continue;
      const fulfillment = Array.isArray(item.order_item_fulfillments)
        ? item.order_item_fulfillments[0]
        : item.order_item_fulfillments;
      deliveries.push({
        id: fulfillment?.id ?? item.id,
        orderItemId: item.id,
        bookingId: order.booking_id ?? "",
        orderNumber: order.order_number,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
        status: fulfillment?.status ?? "PENDING",
        deliveryLocation: fulfillment?.delivery_location ?? null,
        deliveredAt: fulfillment?.delivered_at ?? null,
      });
    }
  }

  const authorizationId = crypto.randomUUID();
  const expiry = new Date(
    new Date(hike.starts_at).getTime() + 72 * 60 * 60 * 1000,
  );
  const authorizationPayload: OfflineAuthorizationPayload = {
    purpose: "hike-offline",
    version: 1,
    authorizationId,
    profileId: staff.id,
    hikeId: hike.id,
    deviceId: parsed.data.device,
    issuedAt: Date.now(),
    expiresAt: expiry.getTime(),
  };
  const authorization = await signPayload(authorizationPayload);
  await service.from("hike_offline_authorizations").insert({
    id: authorizationId,
    hike_id: hike.id,
    profile_id: staff.id,
    device_id: parsed.data.device,
    token_hash: await hashSignedToken(authorization),
    expires_at: expiry.toISOString(),
  });

  const data: HikeModeData = {
    hike,
    availableHikes: hikes.map((item) => ({
      id: item.id,
      name: item.name,
      startsAt: item.starts_at,
    })),
    bookings,
    deliveries,
    transportDeparture: {
      completedAt: transportDeparture?.completed_at ?? null,
      passengerCount: transportDeparture?.passenger_count ?? 0,
      note: transportDeparture?.note ?? null,
    },
    publicKey: process.env.NEXT_PUBLIC_QR_SIGNING_PUBLIC_KEY ?? "",
    authorization,
    preparedAt: new Date().toISOString(),
    expiresAt: expiry.toISOString(),
  };
  return Response.json(data, { headers: { "cache-control": "no-store" } });
}

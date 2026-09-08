import { z } from "zod";
import { adminClient } from "../../hikes/route";

function cell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function csvResponse(rows: unknown[][], name: string) {
  const body = "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` } });
}

export async function GET(request: Request) {
  const hikeId = new URL(request.url).searchParams.get("hike");
  if (!z.string().uuid().safeParse(hikeId).success) return Response.json({ error: "Hike inválido." }, { status: 400 });
  const supabase = await adminClient(); if (!supabase) return Response.json({ error: "No autorizado." }, { status: 403 });
  const { data: hike } = await supabase.from("hikes").select("name,slug").eq("id", hikeId!).single();
  const { data: bookings } = await supabase.from("bookings").select("booking_number,status,total_cents,profile:profiles(first_name,last_name,email,phone),booking_participants(snapshot),booking_dogs(snapshot),transport_reservations(id),signed_waivers(id),check_ins(id)").eq("hike_id", hikeId!).order("created_at");
  const rows: unknown[][] = [[ "Reservación", "Estatus", "Cliente", "Email", "Teléfono", "Personas", "Perritos", "Transporte", "Responsivas", "Check-ins", "Total MXN" ]];
  for (const booking of bookings ?? []) {
    const p = Array.isArray(booking.profile) ? booking.profile[0] : booking.profile;
    const people = booking.booking_participants.map((item) => { const s=item.snapshot as {first_name?:string;last_name?:string}; return `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(); }).join(" | ");
    const dogs = booking.booking_dogs.map((item) => { const s=item.snapshot as {name?:string}; return s.name ?? ""; }).join(" | ");
    rows.push([booking.booking_number, booking.status, `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim(), p?.email, p?.phone, people, dogs, booking.transport_reservations.length, booking.signed_waivers.length, booking.check_ins.length, (booking.total_cents / 100).toFixed(2)]);
  }
  return csvResponse(rows, `manifiesto-${hike?.slug ?? "hike"}.csv`);
}

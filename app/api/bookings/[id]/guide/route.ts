import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function wrap(text: string, max = 78) {
  const words = text.split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) { const next = `${line} ${word}`.trim(); if (next.length > max && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line); return lines;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new Response("Reservación inválida", { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
  const { data: booking } = profile ? await supabase.from("bookings").select("booking_number,status,hike:hikes(name,starts_at,location_name,meeting_point,packing_list,rules,cancellation_policy),booking_participants(snapshot),booking_dogs(snapshot)").eq("id", id).eq("profile_id", profile.id).single() : { data: null };
  const hike = Array.isArray(booking?.hike) ? booking.hike[0] : booking?.hike;
  if (!booking || !hike) return new Response("No encontrado", { status: 404 });
  const pdf = await PDFDocument.create(); const page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 0, y: 700, width: 612, height: 92, color: rgb(0.07,0.09,0.23) });
  page.drawText("THE DOGGY GANG", { x: 42, y: 748, size: 18, font: bold, color: rgb(1,0.76,0.38) });
  page.drawText("GUIA DE AVENTURA", { x: 42, y: 724, size: 9, font: bold, color: rgb(1,1,1) });
  let y = 665;
  const draw = (label: string, value: string) => { page.drawText(label, { x: 42, y, size: 8, font: bold, color: rgb(.55,.36,.08) }); y -= 18; for (const line of wrap(value)) { page.drawText(line, { x: 42, y, size: 10, font: regular, color: rgb(.14,.12,.1) }); y -= 14; } y -= 14; };
  draw("AVENTURA", hike.name); draw("RESERVACION", `${booking.booking_number} · ${booking.status.replaceAll("_"," ")}`);
  draw("FECHA", new Intl.DateTimeFormat("es-MX", { dateStyle: "full", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(hike.starts_at)));
  draw("PUNTO DE ENCUENTRO", hike.meeting_point || hike.location_name);
  const people = booking.booking_participants.map((item) => { const s = item.snapshot as { first_name?: string; last_name?: string }; return `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(); }).filter(Boolean).join(", ");
  const dogs = booking.booking_dogs.map((item) => (item.snapshot as { name?: string }).name).filter(Boolean).join(", ");
  draw("MANADA REGISTRADA", `Personas: ${people || "Sin registrar"}. Perritos: ${dogs || "Sin registrar"}.`);
  draw("QUE LLEVAR", (hike.packing_list ?? []).join(" · ") || "Consulta las indicaciones del equipo.");
  draw("REGLAS DE LA MANADA", hike.rules || "Sigue las indicaciones del equipo durante toda la ruta.");
  draw("CANCELACIONES", hike.cancellation_policy || "Consulta las condiciones de esta aventura.");
  page.drawText("Guarda este documento en tu telefono para consultarlo sin conexion.", { x: 42, y: 35, size: 8, font: regular, color: rgb(.4,.4,.4) });
  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="guia-${booking.booking_number}.pdf"`, "cache-control": "private, no-store" } });
}

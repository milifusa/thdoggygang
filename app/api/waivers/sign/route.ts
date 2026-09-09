import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";

const schema = z.object({
  bookingId: z.string().uuid(),
  signatureData: z.string().startsWith("data:image/png;base64,").max(500_000),
});

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "La firma no es válida." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json({ error: "Tu sesión expiró." }, { status: 401 });
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, profile_id, hike:hikes(name, starts_at, location_name), booking_participants(id, guardian_booking_participant_id, snapshot), booking_dogs(snapshot)",
    )
    .eq("id", parsed.data.bookingId)
    .single();
  if (!booking || booking.booking_participants.length === 0)
    return Response.json(
      { error: "Reservación no disponible." },
      { status: 404 },
    );
  const hike = Array.isArray(booking.hike) ? booking.hike[0] : booking.hike;
  const signatureBytes = fromBase64(parsed.data.signatureData.split(",")[1]);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const signatureImage = await pdf.embedPng(signatureBytes);
  page.drawText("THE DOGGY GANG", { x: 48, y: 788, size: 18, font: bold });
  page.drawRectangle({
    x: 48,
    y: 772,
    width: 95,
    height: 4,
    color: rgb(0.96, 0.73, 0.37),
  });
  page.drawText("RESPONSIVA DIGITAL · VERSION 1", {
    x: 48,
    y: 730,
    size: 9,
    font: bold,
  });
  page.drawText(hike?.name ?? "Aventura", {
    x: 48,
    y: 690,
    size: 24,
    font: bold,
  });
  page.drawText(
    `${hike?.location_name ?? ""} · ${hike?.starts_at ? new Date(hike.starts_at).toLocaleDateString("es-MX") : ""}`,
    { x: 48, y: 668, size: 10, font: regular },
  );
  const participantNames = booking.booking_participants
    .map((participant) =>
      `${participant.snapshot.first_name ?? ""} ${participant.snapshot.last_name ?? ""}`.trim(),
    )
    .join(", ");
  const dogNames = booking.booking_dogs
    .map((dog) => String(dog.snapshot.name ?? ""))
    .filter(Boolean)
    .join(", ");
  const guardians = booking.booking_participants
    .filter((participant) => Boolean(participant.snapshot.is_minor))
    .map((minor) => {
      const guardian = booking.booking_participants.find(
        (participant) =>
          participant.id === minor.guardian_booking_participant_id,
      );
      return `${minor.snapshot.first_name ?? ""} ${minor.snapshot.last_name ?? ""}: ${guardian?.snapshot.first_name ?? "SIN"} ${guardian?.snapshot.last_name ?? "RESPONSABLE"}`.trim();
    });
  const lines = [
    `Participantes: ${participantNames}`,
    `Perritos: ${dogNames || "Ninguno"}`,
    guardians.length
      ? `Menores y responsables: ${guardians.join("; ")}`
      : "Sin participantes menores",
    "",
    "Declaro que participamos voluntariamente y que la informacion proporcionada es correcta.",
    "Me comprometo a seguir las indicaciones de seguridad, cuidado del entorno y bienestar",
    "de los perritos durante toda la experiencia. Entiendo los riesgos inherentes a una",
    "actividad al aire libre y autorizo la aplicacion del protocolo de emergencia registrado.",
  ];
  lines.forEach((line, index) =>
    page.drawText(line.slice(0, 105), {
      x: 48,
      y: 620 - index * 19,
      size: 10,
      font: regular,
    }),
  );
  page.drawText("FIRMA DEL TITULAR", { x: 48, y: 390, size: 8, font: bold });
  page.drawImage(signatureImage, { x: 48, y: 260, width: 260, height: 110 });
  page.drawLine({
    start: { x: 48, y: 255 },
    end: { x: 310, y: 255 },
    thickness: 1,
  });
  page.drawText(
    `Firmado: ${new Date().toISOString()} · ${booking.booking_number}`,
    { x: 48, y: 225, size: 8, font: regular, color: rgb(0.35, 0.35, 0.35) },
  );
  const pdfBytes = await pdf.save();
  const documentHash = await sha256(pdfBytes);
  const service = createSupabaseServiceClient();
  const basePath = `${booking.profile_id}/${booking.id}`;
  const signaturePath = `${basePath}/signature-${documentHash.slice(0, 12)}.png`;
  const pdfPath = `${basePath}/responsiva-${documentHash.slice(0, 12)}.pdf`;
  const [signatureUpload, pdfUpload] = await Promise.all([
    service.storage
      .from("signed-waivers")
      .upload(signaturePath, signatureBytes, {
        contentType: "image/png",
        upsert: false,
      }),
    service.storage
      .from("signed-waivers")
      .upload(pdfPath, new Uint8Array(pdfBytes).buffer, {
        contentType: "application/pdf",
        upsert: false,
      }),
  ]);
  if (signatureUpload.error || pdfUpload.error)
    return Response.json(
      { error: "No pudimos guardar la responsiva." },
      { status: 500 },
    );
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent");
  const rows = booking.booking_participants.map((participant) => ({
    booking_id: booking.id,
    booking_participant_id: participant.id,
    waiver_version_id: "00000000-0000-4000-8000-000000000201",
    signature_path: signaturePath,
    pdf_path: pdfPath,
    ip,
    user_agent: userAgent,
    document_hash: `${documentHash}:${participant.id}`,
  }));
  const { error } = await service
    .from("signed_waivers")
    .upsert(rows, { onConflict: "document_hash" });
  if (error)
    return Response.json(
      { error: "No pudimos registrar la responsiva." },
      { status: 500 },
    );
  await service
    .from("audit_logs")
    .insert({
      actor_profile_id: booking.profile_id,
      action: "WAIVER_SIGNED",
      entity_type: "booking",
      entity_id: booking.id,
      metadata: { version: 1, document_hash: documentHash },
    });
  return Response.json({ ok: true, documentHash });
}

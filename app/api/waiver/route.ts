import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function POST(request: Request) {
  const data = (await request.json()) as {
    person?: string;
    hike?: string;
    date?: string;
    hash?: string;
  };
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText("THE DOGGY GANG", {
    x: 48,
    y: 785,
    size: 18,
    font: bold,
    color: rgb(0.05, 0.05, 0.05),
  });
  page.drawRectangle({
    x: 48,
    y: 765,
    width: 95,
    height: 4,
    color: rgb(0.96, 0.73, 0.37),
  });
  page.drawText("RESPONSIVA DIGITAL · VERSION 2.1", {
    x: 48,
    y: 728,
    size: 10,
    font: bold,
  });
  page.drawText(data.hike ?? "Aventura The Doggy Gang", {
    x: 48,
    y: 690,
    size: 25,
    font: bold,
  });
  page.drawText(
    `${data.date ?? ""} · Participante: ${data.person ?? "Participante"}`,
    { x: 48, y: 665, size: 10, font },
  );
  const copy = [
    "Declaro que participo voluntariamente en esta experiencia y que la informacion",
    "proporcionada sobre personas y perritos es correcta. Me comprometo a respetar las",
    "indicaciones del equipo, cuidar el entorno y mantener a los perritos con correa.",
    "",
    "Este documento fue aceptado y firmado digitalmente.",
  ];
  copy.forEach((line, index) =>
    page.drawText(line, { x: 48, y: 610 - index * 18, size: 11, font }),
  );
  page.drawText(`Hash de integridad: ${data.hash ?? "pendiente"}`, {
    x: 48,
    y: 105,
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  const bytes = await pdf.save();
  const body = new Uint8Array(bytes).buffer;
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        'attachment; filename="responsiva-the-doggy-gang.pdf"',
    },
  });
}

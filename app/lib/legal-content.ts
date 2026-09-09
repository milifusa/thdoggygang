import { createSupabaseServerClient } from "./supabase/server";
export type LegalContent = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: Array<{ title: string; body: string }>;
};
export const legalDefaults: { terms: LegalContent; privacy: LegalContent } = {
  terms: {
    eyebrow: "INFORMACIÓN LEGAL",
    title: "Términos y condiciones.",
    intro:
      "Al reservar una aventura confirmas que la información de las personas y perritos participantes es correcta, que leíste las condiciones particulares del hike y que atenderás las indicaciones del equipo.",
    sections: [
      {
        title: "Reservaciones y pagos",
        body: "El lugar queda confirmado únicamente cuando el pago ha sido validado. Cada hike puede tener precios, reglas, inclusiones y políticas de cancelación diferentes; las condiciones visibles en su página forman parte de la reservación.",
      },
      {
        title: "Seguridad y convivencia",
        body: "La participación está sujeta a la responsiva vigente, al estado de salud declarado y a las reglas de la manada. The Doggy Gang puede negar la participación cuando exista un riesgo para asistentes, perritos o entorno.",
      },
      {
        title: "Cancelaciones",
        body: "Se aplica la política indicada en el hike comprado. Si una ruta cambia por clima o seguridad, el equipo comunicará las opciones disponibles.",
      },
    ],
  },
  privacy: {
    eyebrow: "PRIVACIDAD",
    title: "Aviso de privacidad.",
    intro:
      "The Doggy Gang utiliza los datos de contacto, participantes, perritos, salud, emergencia, reservaciones, pagos y responsivas exclusivamente para administrar las experiencias contratadas y mantener segura a la manada.",
    sections: [
      {
        title: "Datos y documentos",
        body: "Las responsivas, comprobantes y fotografías originales se almacenan con acceso controlado. El equipo autorizado sólo accede a la información necesaria para operar cada hike.",
      },
      {
        title: "Comunicaciones",
        body: "Podemos enviarte accesos, confirmaciones, recordatorios operativos y avisos relacionados con tus reservaciones. No vendemos tus datos.",
      },
      {
        title: "Tus derechos",
        body: "Puedes solicitar acceso, corrección o eliminación de información que no deba conservarse por obligaciones operativas o legales escribiendo a hola@thedoggygang.com.",
      },
    ],
  },
};
export async function getLegalContent(id: "terms" | "privacy") {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("site_content")
      .select("content")
      .eq("id", id)
      .maybeSingle();
    return {
      ...legalDefaults[id],
      ...(data?.content as Partial<LegalContent> | undefined),
    };
  } catch {
    return legalDefaults[id];
  }
}

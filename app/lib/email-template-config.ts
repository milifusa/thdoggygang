export const EMAIL_TEMPLATE_KEYS = [
  "AUTH_ACCESS",
  "TEAM_INVITE",
  "BOOKING_REMINDER",
  "HIKE_REMINDER_7D",
  "HIKE_REMINDER_1D",
  "WAITLIST_OFFER",
  "HIKE_CHANGED",
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export type EmailTemplateValue = {
  key: EmailTemplateKey;
  subject: string;
  eyebrow: string;
  heading: string;
  body: string;
  buttonLabel: string;
  imagePath: string | null;
  imageUrl: string;
  active: boolean;
};

export type EmailTemplateDefinition = Omit<
  EmailTemplateValue,
  "key" | "imagePath" | "active"
> & {
  label: string;
  description: string;
  group: "ACCESO" | "RESERVACIONES" | "AVENTURAS";
  variables: readonly string[];
};

const dogRunning =
  "https://images.unsplash.com/photo-1534361960057-19889db9621e?auto=format&fit=crop&w=1200&q=85";
const dogTrail =
  "https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=1200&q=85";

export const EMAIL_TEMPLATE_DEFINITIONS: Record<
  EmailTemplateKey,
  EmailTemplateDefinition
> = {
  AUTH_ACCESS: {
    label: "Acceso y confirmación",
    description: "Se envía al solicitar el enlace para entrar o crear una cuenta.",
    group: "ACCESO",
    subject: "Tu acceso a The Doggy Gang",
    eyebrow: "TU MANADA TE ESPERA",
    heading: "Qué gusto verte de nuevo.",
    body:
      "Usa este acceso seguro para entrar a tu cuenta, ver tus aventuras y organizar a tu manada.",
    buttonLabel: "ENTRAR A MI MANADA",
    imageUrl: dogRunning,
    variables: ["{nombre_cliente}", "{url_acceso}"],
  },
  TEAM_INVITE: {
    label: "Invitación al equipo",
    description: "Se envía cuando un administrador invita a una guía o administradora.",
    group: "ACCESO",
    subject: "Te invitaron al equipo de The Doggy Gang",
    eyebrow: "BIENVENIDO AL EQUIPO",
    heading: "La manada te espera.",
    body:
      "Activa tu acceso para entrar al panel y ayudar a operar las próximas aventuras.",
    buttonLabel: "ACEPTAR INVITACIÓN",
    imageUrl: dogTrail,
    variables: ["{nombre_cliente}", "{rol}", "{url_acceso}"],
  },
  BOOKING_REMINDER: {
    label: "Reservación sin terminar",
    description: "Recordatorio manual para una reservación en borrador o pendiente.",
    group: "RESERVACIONES",
    subject: "Tu aventura sigue esperando",
    eyebrow: "RESERVACIÓN PENDIENTE",
    heading: "Termina tu reservación.",
    body: "Guardamos tu avance para que puedas retomar tu reservación.",
    buttonLabel: "CONTINUAR RESERVACIÓN",
    imageUrl: dogRunning,
    variables: [
      "{nombre_cliente}",
      "{hike}",
      "{fecha_hike}",
      "{paso_pendiente}",
      "{url_continuar}",
    ],
  },
  HIKE_REMINDER_7D: {
    label: "Recordatorio 7 días antes",
    description: "Se envía una semana antes a reservaciones confirmadas.",
    group: "AVENTURAS",
    subject: "Tu aventura es en una semana",
    eyebrow: "FALTA UNA SEMANA",
    heading: "Tu aventura se acerca.",
    body: "Revisa el punto de encuentro y prepara lo necesario para caminar juntos.",
    buttonLabel: "ABRIR CENTRO DE AVENTURA",
    imageUrl: dogTrail,
    variables: [
      "{nombre_cliente}",
      "{hike}",
      "{fecha_hike}",
      "{punto_encuentro}",
      "{url_aventura}",
    ],
  },
  HIKE_REMINDER_1D: {
    label: "Recordatorio 1 día antes",
    description: "Se envía el día anterior a reservaciones confirmadas.",
    group: "AVENTURAS",
    subject: "Mañana caminamos en manada",
    eyebrow: "MAÑANA ES EL DÍA",
    heading: "Tu aventura comienza mañana.",
    body: "Revisa el punto de encuentro y prepara lo necesario para caminar juntos.",
    buttonLabel: "ABRIR CENTRO DE AVENTURA",
    imageUrl: dogTrail,
    variables: [
      "{nombre_cliente}",
      "{hike}",
      "{fecha_hike}",
      "{punto_encuentro}",
      "{url_aventura}",
    ],
  },
  WAITLIST_OFFER: {
    label: "Lugar liberado",
    description: "Se envía a la siguiente persona cuando aparece un cupo.",
    group: "RESERVACIONES",
    subject: "Se liberó un lugar para {hike}",
    eyebrow: "LISTA DE ESPERA",
    heading: "Se liberó un lugar.",
    body:
      "Ya puedes reservar {hike}. La oportunidad vence en 24 horas y el cupo se confirma al completar el pago.",
    buttonLabel: "RESERVAR MI LUGAR",
    imageUrl: dogRunning,
    variables: ["{nombre_cliente}", "{hike}", "{fecha_hike}", "{url_reserva}"],
  },
  HIKE_CHANGED: {
    label: "Cambio importante del hike",
    description: "Se envía a quienes tienen una reservación confirmada cuando cambia la ruta.",
    group: "AVENTURAS",
    subject: "Actualización importante de {hike}",
    eyebrow: "ACTUALIZACIÓN DE RUTA",
    heading: "Revisa tu aventura.",
    body: "Actualizamos {hike}: {cambios}.",
    buttonLabel: "ABRIR CENTRO DE AVENTURA",
    imageUrl: dogTrail,
    variables: [
      "{nombre_cliente}",
      "{hike}",
      "{fecha_hike}",
      "{punto_encuentro}",
      "{cambios}",
      "{url_aventura}",
    ],
  },
};

export function isEmailTemplateKey(value: string): value is EmailTemplateKey {
  return (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export function emailAssetUrl(path: string | null | undefined) {
  if (!path) return "";
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return "";
  return `${base}/storage/v1/object/public/email-assets/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

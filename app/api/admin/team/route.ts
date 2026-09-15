import { z } from "zod";
import { adminClient } from "../hikes/route";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";
import { sendBrandedEmail } from "../../../lib/server/email-renderer";

const inviteSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  phone: z
    .string()
    .regex(/^(?:\+?52)?\d{10}$/)
    .optional()
    .or(z.literal("")),
  role: z.enum(["ADMIN", "GUIDE"]),
});
const updateSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  phone: z
    .string()
    .regex(/^(?:\+?52)?\d{10}$/)
    .nullable(),
  role: z.enum(["ADMIN", "GUIDE"]),
  active: z.boolean(),
  hikeIds: z.array(z.string().uuid()).max(50).default([]),
});
export async function POST(request: Request) {
  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Revisa nombre, correo, teléfono y rol." },
      { status: 400 },
    );
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const service = createSupabaseServiceClient();
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  const { data, error } = await service.auth.admin.generateLink({
    type: "invite",
    email: parsed.data.email.toLowerCase(),
    options: {
      redirectTo: `${origin}/auth/callback?next=/admin`,
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
      },
    },
  });
  if (error || !data.user)
    return Response.json(
      { error: error?.message ?? "No pudimos crear la invitación." },
      { status: 400 },
    );
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      phone: parsed.data.phone
        ? `+52${parsed.data.phone.replace(/^\+?52/, "")}`
        : null,
      role: parsed.data.role,
      active: true,
    })
    .eq("auth_user_id", data.user.id);
  if (updateError)
    return Response.json({ error: updateError.message }, { status: 400 });
  const accessUrl = new URL("/auth/confirm", origin);
  accessUrl.searchParams.set("token_hash", data.properties.hashed_token);
  accessUrl.searchParams.set("type", data.properties.verification_type);
  accessUrl.searchParams.set("next", "/admin");
  try {
    await sendBrandedEmail({
      key: "TEAM_INVITE",
      to: parsed.data.email.toLowerCase(),
      variables: {
        nombre_cliente: parsed.data.firstName,
        rol: parsed.data.role === "ADMIN" ? "Administrador" : "Guía",
        url_acceso: accessUrl.toString(),
      },
      actionUrl: accessUrl.toString(),
      note: "La invitación vence pronto y sólo puede utilizarse una vez.",
    });
  } catch (sendError) {
    return Response.json(
      {
        error:
          sendError instanceof Error
            ? `La cuenta se creó, pero el correo no se envió: ${sendError.message}`
            : "La cuenta se creó, pero el correo no se envió.",
      },
      { status: 400 },
    );
  }
  return Response.json({ ok: true });
}
export async function PATCH(request: Request) {
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Revisa los datos del integrante." },
      { status: 400 },
    );
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      phone: parsed.data.phone
        ? `+52${parsed.data.phone.replace(/^\+?52/, "")}`
        : null,
      role: parsed.data.role,
      active: parsed.data.active,
    })
    .eq("id", parsed.data.id);
  if (error)
    return Response.json(
      {
        error: error.message.includes("último administrador")
          ? "Debe existir al menos un administrador activo."
          : error.message,
      },
      { status: 400 },
    );
  const { error: clearError } = await supabase
    .from("guide_hikes")
    .delete()
    .eq("profile_id", parsed.data.id);
  if (clearError)
    return Response.json({ error: clearError.message }, { status: 400 });
  if (parsed.data.role === "GUIDE" && parsed.data.hikeIds.length) {
    const { error: assignmentError } = await supabase
      .from("guide_hikes")
      .insert(
        parsed.data.hikeIds.map((hikeId) => ({
          hike_id: hikeId,
          profile_id: parsed.data.id,
        })),
      );
    if (assignmentError)
      return Response.json({ error: assignmentError.message }, { status: 400 });
  }
  return Response.json({ ok: true });
}

import { z } from "zod";
import { adminClient } from "../hikes/route";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";

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
    .regex(/^\d{10}$/)
    .nullable(),
  role: z.enum(["ADMIN", "GUIDE"]),
  active: z.boolean(),
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
  const { data, error } = await service.auth.admin.inviteUserByEmail(
    parsed.data.email.toLowerCase(),
    {
      redirectTo: `${origin}/auth/callback`,
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
      },
    },
  );
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
      phone: parsed.data.phone ? `+52${parsed.data.phone}` : null,
      role: parsed.data.role,
      active: true,
    })
    .eq("auth_user_id", data.user.id);
  return updateError
    ? Response.json({ error: updateError.message }, { status: 400 })
    : Response.json({ ok: true });
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
  return error
    ? Response.json(
        {
          error: error.message.includes("último administrador")
            ? "Debe existir al menos un administrador activo."
            : error.message,
        },
        { status: 400 },
      )
    : Response.json({ ok: true });
}

import { z } from "zod";
import { normalizeMexicoPhone } from "../../../../lib/mexico-phone";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

const payloadSchema = z.object({
  phone: z.string().trim().min(1).max(20),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Persona inválida." }, { status: 400 });

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Escribe los 10 dígitos del teléfono de México." },
      { status: 400 },
    );

  const phone = normalizeMexicoPhone(parsed.data.phone);
  if (!phone)
    return Response.json(
      { error: "El teléfono debe tener 10 dígitos de México." },
      { status: 400 },
    );

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json(
      { error: "Inicia sesión para guardar el teléfono." },
      { status: 401 },
    );

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!profile)
    return Response.json(
      { error: "No encontramos tu perfil." },
      { status: 404 },
    );

  const { data: person, error } = await supabase
    .from("person_profiles")
    .update({ phone })
    .eq("id", id)
    .eq("owner_profile_id", profile.id)
    .is("deleted_at", null)
    .select("id,phone")
    .maybeSingle();

  if (error || !person)
    return Response.json(
      { error: "No pudimos guardar el teléfono de esta persona." },
      { status: 400 },
    );

  return Response.json({ id: person.id, phone: person.phone });
}

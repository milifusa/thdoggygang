import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const dogSchema = z.object({
  name: z.string().trim().min(2).max(80),
  breed: z.string().trim().max(100).or(z.literal("")).optional(),
  birthDate: z.string().date().or(z.literal("")).optional(),
  sex: z.enum(["FEMALE", "MALE", "UNKNOWN"]),
  size: z.enum(["SMALL", "MEDIUM", "LARGE", "XL"]),
  sterilized: z.boolean().nullable().optional(),
  sociability: z.string().trim().max(200).or(z.literal("")).optional(),
  reactivity: z.string().trim().max(500).or(z.literal("")).optional(),
  medicalConditions: z.string().trim().max(1000).or(z.literal("")).optional(),
  medications: z.string().trim().max(1000).or(z.literal("")).optional(),
  notes: z.string().trim().max(1000).or(z.literal("")).optional(),
  photoPath: z.string().trim().max(500).or(z.literal("")).optional(),
  activityLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
  hikingExperience: z.enum(["FIRST_TIME", "SOME", "EXPERIENCED"]).nullable().optional(),
  vaccinationCurrent: z.boolean().nullable().optional(),
  vetCleared: z.boolean().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Perrito inválido." }, { status: 400 });
  const parsed = dogSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Revisa los datos de tu perrito." },
      { status: 400 },
    );
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json(
      { error: "Inicia sesión para editar perritos." },
      { status: 401 },
    );
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile)
    return Response.json(
      { error: "No encontramos tu perfil." },
      { status: 404 },
    );
  if (
    parsed.data.photoPath &&
    !parsed.data.photoPath.startsWith(`${profile.id}/`)
  ) {
    return Response.json(
      { error: "La foto no pertenece a tu cuenta." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("dogs")
    .update({
      name: parsed.data.name,
      breed: parsed.data.breed || null,
      birth_date: parsed.data.birthDate || null,
      sex: parsed.data.sex,
      size: parsed.data.size,
      sterilized: parsed.data.sterilized ?? null,
      sociability: parsed.data.sociability || null,
      reactivity: parsed.data.reactivity || null,
      medical_conditions: parsed.data.medicalConditions || null,
      medications: parsed.data.medications || null,
      notes: parsed.data.notes || null,
      photo_path: parsed.data.photoPath || null,
      activity_level: parsed.data.activityLevel ?? null,
      hiking_experience: parsed.data.hikingExperience ?? null,
      vaccination_current: parsed.data.vaccinationCurrent ?? null,
      vet_cleared: parsed.data.vetCleared ?? null,
    })
    .eq("id", id)
    .eq("owner_profile_id", profile.id)
    .is("deleted_at", null)
    .select("id")
    .single();

  if (error || !data)
    return Response.json(
      { error: error?.message ?? "No encontramos a ese perrito." },
      { status: 400 },
    );
  return Response.json({ id: data.id });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Perrito inválido." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json(
      { error: "Inicia sesión para administrar tus perritos." },
      { status: 401 },
    );
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile)
    return Response.json(
      { error: "No encontramos tu perfil." },
      { status: 404 },
    );
  const { data, error } = await supabase
    .from("dogs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_profile_id", profile.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data)
    return Response.json(
      { error: "No encontramos a ese perrito." },
      { status: 404 },
    );
  return Response.json({ ok: true });
}

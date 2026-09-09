import { z } from "zod";
import { createSupabaseServerClient } from "../../lib/supabase/server";

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
});

export async function POST(request: Request) {
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
      { error: "Inicia sesión para agregar perritos." },
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
    .insert({
      owner_profile_id: profile.id,
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
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ id: data.id }, { status: 201 });
}

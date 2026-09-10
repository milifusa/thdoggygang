import { z } from "zod";
import { normalizeMexicoPhone } from "../../lib/mexico-phone";
import { ADULT_AGE, ageOnDate, dateInMexico } from "../../lib/person-age";
import { createSupabaseServerClient } from "../../lib/supabase/server";

const personSchema = z
  .object({
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(2).max(100),
    email: z.string().trim().email().or(z.literal("")).optional(),
    phone: z.string().trim().max(20).or(z.literal("")).optional(),
    whatsapp: z.string().trim().max(20).or(z.literal("")).optional(),
    birthDate: z.string().date().or(z.literal("")).optional(),
    emergencyContactName: z.string().trim().max(120).or(z.literal("")).optional(),
    emergencyContactPhone: z.string().trim().max(20).or(z.literal("")).optional(),
    isMinor: z.boolean().default(false),
    guardianPersonId: z.string().uuid().or(z.literal("")).optional(),
  })
  .superRefine((value, context) => {
    if (value.isMinor && !value.birthDate)
      context.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "Agrega la fecha de nacimiento del menor.",
      });
    if (value.birthDate) {
      const age = ageOnDate(
        value.birthDate,
        dateInMexico(new Date().toISOString()),
      );
      if (age === null || age < 0)
        context.addIssue({
          code: "custom",
          path: ["birthDate"],
          message: "La fecha de nacimiento no es válida.",
        });
      if (value.isMinor && age !== null && age >= ADULT_AGE)
        context.addIssue({
          code: "custom",
          path: ["birthDate"],
          message: "La fecha de nacimiento corresponde a una persona adulta.",
        });
    }
  });

export async function POST(request: Request) {
  const parsed = personSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Revisa los datos de la persona.",
      },
      { status: 400 },
    );

  const phone = parsed.data.phone
    ? normalizeMexicoPhone(parsed.data.phone)
    : null;
  const emergencyPhone = parsed.data.emergencyContactPhone
    ? normalizeMexicoPhone(parsed.data.emergencyContactPhone)
    : null;
  const whatsapp = parsed.data.whatsapp
    ? normalizeMexicoPhone(parsed.data.whatsapp)
    : null;
  if (parsed.data.phone && !phone)
    return Response.json(
      { error: "El teléfono debe tener 10 dígitos de México." },
      { status: 400 },
    );
  if (parsed.data.emergencyContactPhone && !emergencyPhone)
    return Response.json(
      { error: "El teléfono de emergencia debe tener 10 dígitos de México." },
      { status: 400 },
    );
  if (parsed.data.whatsapp && !whatsapp)
    return Response.json(
      { error: "El WhatsApp debe tener 10 dígitos de México." },
      { status: 400 },
    );
  if (parsed.data.isMinor && !parsed.data.guardianPersonId)
    return Response.json(
      { error: "Selecciona a la persona adulta responsable del menor." },
      { status: 400 },
    );

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json(
      { error: "Inicia sesión para agregar personas." },
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
  if (parsed.data.isMinor) {
    const { data: guardian } = await supabase
      .from("person_profiles")
      .select("id,is_minor")
      .eq("id", parsed.data.guardianPersonId)
      .eq("owner_profile_id", profile.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!guardian || guardian.is_minor)
      return Response.json(
        { error: "El responsable debe ser una persona adulta de tu manada." },
        { status: 400 },
      );
  }

  const { data, error } = await supabase
    .from("person_profiles")
    .insert({
      owner_profile_id: profile.id,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      email: parsed.data.email || null,
      phone,
      whatsapp,
      birth_date: parsed.data.birthDate || null,
      emergency_contact_name: parsed.data.emergencyContactName || null,
      emergency_contact_phone: emergencyPhone,
      is_minor: parsed.data.isMinor,
      guardian_person_id: parsed.data.isMinor
        ? parsed.data.guardianPersonId
        : null,
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ id: data.id }, { status: 201 });
}

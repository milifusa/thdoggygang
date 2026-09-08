import { z } from 'zod';
import { normalizeMexicoPhone } from '../../lib/mexico-phone';
import { createSupabaseServerClient } from '../../lib/supabase/server';

const personSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().or(z.literal('')).optional(),
  phone: z.string().trim().max(20).or(z.literal('')).optional(),
  birthDate: z.string().date().or(z.literal('')).optional(),
  emergencyContactName: z.string().trim().max(120).or(z.literal('')).optional(),
  emergencyContactPhone: z.string().trim().max(20).or(z.literal('')).optional(),
  isMinor: z.boolean().default(false),
});

export async function POST(request: Request) {
  const parsed = personSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Revisa los datos de la persona.' }, { status: 400 });

  const phone = parsed.data.phone ? normalizeMexicoPhone(parsed.data.phone) : null;
  const emergencyPhone = parsed.data.emergencyContactPhone ? normalizeMexicoPhone(parsed.data.emergencyContactPhone) : null;
  if (parsed.data.phone && !phone) return Response.json({ error: 'El teléfono debe tener 10 dígitos de México.' }, { status: 400 });
  if (parsed.data.emergencyContactPhone && !emergencyPhone) return Response.json({ error: 'El teléfono de emergencia debe tener 10 dígitos de México.' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Inicia sesión para agregar personas.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single();
  if (!profile) return Response.json({ error: 'No encontramos tu perfil.' }, { status: 404 });

  const { data, error } = await supabase.from('person_profiles').insert({
    owner_profile_id: profile.id,
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
    email: parsed.data.email || null,
    phone,
    birth_date: parsed.data.birthDate || null,
    emergency_contact_name: parsed.data.emergencyContactName || null,
    emergency_contact_phone: emergencyPhone,
    is_minor: parsed.data.isMinor,
  }).select('id').single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ id: data.id }, { status: 201 });
}


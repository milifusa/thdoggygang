import { isSupabaseConfigured } from '../config';
import { createSupabaseServerClient } from '../supabase/server';

export type PersonOption = { id: string; name: string; detail: string; initials: string };
export type DogOption = { id: string; name: string; detail: string; image: string };
export type BookingContext = { mode: 'demo' | 'live'; authenticated: boolean; people: PersonOption[]; dogs: DogOption[] };

const demoContext: BookingContext = {
  mode: 'demo', authenticated: true,
  people: [
    { id: 'mishele', name: 'Mishele Lojan', detail: 'Titular · Adulto', initials: 'ML' },
    { id: 'eduardo', name: 'Eduardo Flores', detail: 'Acompañante · Adulto', initials: 'EF' },
    { id: 'maximo', name: 'Máximo Flores', detail: 'Acompañante · Menor', initials: 'MF' },
  ],
  dogs: [
    { id: 'mona', name: 'Mona', detail: 'Westie · 5 años · 3 aventuras', image: 'https://images.unsplash.com/photo-1586671267731-da2cf3ceeb80?auto=format&fit=crop&w=300&q=80' },
    { id: 'bruno', name: 'Bruno', detail: 'Border Collie · 3 años · 1 aventura', image: 'https://images.unsplash.com/photo-1551717743-49959800b1f6?auto=format&fit=crop&w=300&q=80' },
  ],
};

export async function loadBookingContext(): Promise<BookingContext> {
  if (!isSupabaseConfigured()) return demoContext;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { mode: 'live', authenticated: false, people: [], dogs: [] };
  const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single();
  if (!profile) return { mode: 'live', authenticated: true, people: [], dogs: [] };
  const [{ data: people }, { data: dogs }] = await Promise.all([
    supabase.from('person_profiles').select('id, first_name, last_name, birth_date, is_minor').eq('owner_profile_id', profile.id).is('deleted_at', null).order('created_at'),
    supabase.from('dogs').select('id, name, breed, birth_date, photo_path').eq('owner_profile_id', profile.id).is('deleted_at', null).order('created_at'),
  ]);
  const age = (birthDate: string | null) => birthDate ? Math.max(0, new Date().getFullYear() - new Date(birthDate).getFullYear()) : null;
  return {
    mode: 'live', authenticated: true,
    people: (people ?? []).map((person, index) => ({ id: person.id, name: `${person.first_name} ${person.last_name}`.trim(), detail: `${index === 0 ? 'Titular' : 'Acompañante'} · ${person.is_minor ? 'Menor' : 'Adulto'}`, initials: `${person.first_name?.[0] ?? ''}${person.last_name?.[0] ?? ''}`.toUpperCase() })),
    dogs: (dogs ?? []).map((dog) => ({ id: dog.id, name: dog.name, detail: `${dog.breed ?? 'Perrito'}${age(dog.birth_date) ? ` · ${age(dog.birth_date)} años` : ''}`, image: dog.photo_path ?? 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=300&q=80' })),
  };
}

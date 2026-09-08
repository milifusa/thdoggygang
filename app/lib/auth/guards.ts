import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '../config';
import { createSupabaseServerClient } from '../supabase/server';

export async function requireClientSession(returnTo: string) {
  if (!isSupabaseConfigured()) return { mode: 'demo' as const, profile: null };
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  const { data: profile } = await supabase.from('profiles').select('id, first_name, last_name, email, role').eq('auth_user_id', user.id).single();
  if (!profile) redirect('/ingresar');
  return { mode: 'live' as const, profile };
}

export async function requireStaffSession(returnTo: string, allowGuide = false) {
  const session = await requireClientSession(returnTo);
  if (session.mode === 'demo') return session;
  const allowed = session.profile.role === 'ADMIN' || (allowGuide && session.profile.role === 'GUIDE');
  if (!allowed) redirect('/mi-manada');
  return session;
}

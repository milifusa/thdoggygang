import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { destinationForRole, safeReturnPath } from '../../lib/auth/destination';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeReturnPath(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;

  try {
    const supabase = await createSupabaseServerClient();
    const result = tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : code
        ? await supabase.auth.exchangeCodeForSession(code)
        : { error: new Error('Missing authentication parameters.') };
    if (result.error) throw result.error;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user
      ? await supabase.from('profiles').select('role,active').eq('auth_user_id', user.id).maybeSingle()
      : { data: null };
    if (!profile?.active) throw new Error('Inactive account.');
    const cookieStore = await cookies();
    const referral = cookieStore.get('tdg_referral')?.value;
    if (referral) await supabase.rpc('redeem_referral_code', { p_code: referral });
    const destination = destinationForRole(profile.role, next);
    const response = NextResponse.redirect(new URL(destination, url.origin));
    if (referral) response.cookies.delete('tdg_referral');
    return response;
  } catch {
    const login = new URL('/ingresar', url.origin);
    login.searchParams.set('error', 'expired');
    login.searchParams.set('next', next ?? '/mi-manada');
    return NextResponse.redirect(login);
  }
}

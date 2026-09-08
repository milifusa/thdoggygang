import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextValue = url.searchParams.get('next');
  const next = nextValue?.startsWith('/') && !nextValue.startsWith('//') ? nextValue : '/mi-manada';
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
    return NextResponse.redirect(new URL(next, url.origin));
  } catch {
    const login = new URL('/ingresar', url.origin);
    login.searchParams.set('error', 'expired');
    login.searchParams.set('next', next);
    return NextResponse.redirect(login);
  }
}

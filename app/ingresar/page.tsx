import { isSupabaseConfigured } from '../lib/config';
import { LoginForm } from './login-form';

export const metadata = { title: 'Entra a tu manada | The Doggy Gang' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith('/') && !params.next.startsWith('//') ? params.next : '/mi-manada';
  const initialMessage = params.error === 'expired' ? 'Este enlace ya venció o fue utilizado. Pide uno nuevo para entrar.' : '';
  return <LoginForm configured={isSupabaseConfigured()} nextPath={nextPath} initialMessage={initialMessage} />;
}

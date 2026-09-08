'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { createSupabaseBrowserClient } from '../lib/supabase/client';

export function LoginForm() {
  const [method, setMethod] = useState<'email'|'phone'>('email');
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage('');
    try {
      const supabase = createSupabaseBrowserClient();
      if (method === 'email') {
        const { error } = await supabase.auth.signInWithOtp({ email: value, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/mi-manada` } });
        if (error) throw error; setSent(true); setMessage('Te enviamos un enlace mágico. Revisa tu correo.');
      } else if (!sent) {
        const { error } = await supabase.auth.signInWithOtp({ phone: value }); if (error) throw error; setSent(true); setMessage('Te enviamos un código por SMS.');
      } else {
        const { error } = await supabase.auth.verifyOtp({ phone: value, token: code, type: 'sms' }); if (error) throw error; window.location.href = '/mi-manada';
      }
    } catch (error) { setMessage(error instanceof Error && error.message.includes('environment') ? 'Modo demostración: conecta Supabase para enviar códigos reales.' : 'No pudimos enviar el código. Revisa el dato e intenta de nuevo.'); }
  };
  return <main className="login-page"><section className="login-photo"><Link className="wordmark" href="/">THE DOGGY <span>GANG</span></Link><div><p>“Cada aventura empieza con un sí.”</p><span>THE DOGGY GANG</span></div></section><section className="login-panel"><div><p className="eyebrow">BIENVENIDO A TU MANADA</p><h1>Qué gusto<br />verte de nuevo.</h1><p>Entra sin contraseñas. Te enviaremos un acceso seguro.</p><div className="login-tabs"><button onClick={() => {setMethod('email');setSent(false);setMessage('')}} className={method === 'email' ? 'active' : ''}>EMAIL</button><button onClick={() => {setMethod('phone');setSent(false);setMessage('')}} className={method === 'phone' ? 'active' : ''}>TELÉFONO</button></div><form onSubmit={submit}><label>{method === 'email' ? 'TU EMAIL' : 'TU TELÉFONO'}<input required value={value} onChange={(event) => setValue(event.target.value)} type={method === 'email' ? 'email' : 'tel'} placeholder={method === 'email' ? 'hola@email.com' : '+52 222 000 0000'} /></label>{method === 'phone' && sent && <label>CÓDIGO DE 6 DÍGITOS<input required inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} placeholder="000000" /></label>}<button className="button button-primary" type="submit">{method === 'phone' && sent ? 'VERIFICAR Y ENTRAR →' : 'ENVIAR ACCESO →'}</button></form>{message && <p className="login-message">{message}</p>}<div className="demo-access"><span>VISTA DE DEMOSTRACIÓN</span><Link href="/mi-manada">Entrar a Mi manada →</Link><Link href="/admin">Entrar como admin →</Link></div><small>Al continuar aceptas nuestros términos y aviso de privacidad.</small></div></section></main>;
}

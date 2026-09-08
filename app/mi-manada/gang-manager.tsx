'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { mexicoNationalDigits } from '../lib/mexico-phone';
import { createSupabaseBrowserClient } from '../lib/supabase/client';

export type PersonRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  isMinor: boolean;
};

export type DogRecord = {
  id: string;
  name: string;
  breed: string;
  birthDate: string;
  sex: 'FEMALE' | 'MALE' | 'UNKNOWN';
  size: 'SMALL' | 'MEDIUM' | 'LARGE' | 'XL';
  sterilized: boolean | null;
  sociability: string;
  reactivity: string;
  medicalConditions: string;
  medications: string;
  notes: string;
  photoPath: string;
  photoUrl: string;
};

type DialogState = { kind: 'person'; record?: PersonRecord } | { kind: 'dog'; record?: DogRecord } | null;

const fallbackDogPhoto = 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=900&q=85';
const age = (birthDate: string) => birthDate ? Math.max(0, new Date().getFullYear() - new Date(`${birthDate}T12:00:00`).getFullYear()) : null;
const initials = (first: string, last: string) => `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
const sexLabel = { FEMALE: 'Hembra', MALE: 'Macho', UNKNOWN: 'Sin especificar' } as const;
const sizeLabel = { SMALL: 'Chico', MEDIUM: 'Mediano', LARGE: 'Grande', XL: 'Extra grande' } as const;

export function GangManager({ profileId, people, dogs, initialDialog, returnTo }: { profileId: string; people: PersonRecord[]; dogs: DogRecord[]; initialDialog?: 'person' | 'dog'; returnTo?: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(initialDialog ? { kind: initialDialog } : null);
  const [notice, setNotice] = useState('');

  const saved = (message: string) => {
    setDialog(null);
    setNotice(message);
    router.refresh();
    if (returnTo?.startsWith('/')) window.setTimeout(() => window.location.assign(returnTo), 500);
    else window.setTimeout(() => setNotice(''), 3500);
  };

  return <>
    {notice && <div className="gang-notice" role="status">LISTO · {notice}</div>}
    <div className="account-heading" id="personas"><div><p className="eyebrow">QUIÉNES CAMINAN CONTIGO</p><h2>Mi manada</h2></div><button type="button" onClick={() => setDialog({ kind: 'person' })}>＋ AGREGAR PERSONA</button></div>
    {people.length ? <div className="people-grid">{people.map((person, index) => <article key={person.id}><div className="big-avatar">{initials(person.firstName, person.lastName)}</div><h3>{person.firstName} {person.lastName}</h3><p>{index === 0 ? 'Titular' : 'Acompañante'} · {person.isMinor ? 'Menor' : 'Adulto'}</p><button type="button" onClick={() => setDialog({ kind: 'person', record: person })}>EDITAR PERFIL →</button></article>)}</div> : <EmptyCard label="Todavía no has agregado personas a tu manada." action="AGREGAR PRIMERA PERSONA" onClick={() => setDialog({ kind: 'person' })} />}

    <div className="account-heading" id="perritos"><div><p className="eyebrow">EXPLORADORES DE CUATRO PATAS</p><h2>Mis perritos</h2></div><button type="button" onClick={() => setDialog({ kind: 'dog' })}>＋ AGREGAR PERRITO</button></div>
    {dogs.length ? <div className="dog-card-grid">{dogs.map((dog) => <article className="dog-profile-card" key={dog.id}><img src={dog.photoUrl || fallbackDogPhoto} alt={dog.name} /><div><span>MIEMBRO DE LA MANADA</span><h2>{dog.name}</h2><p>{dog.breed || 'Perrito'}{age(dog.birthDate) !== null ? ` · ${age(dog.birthDate)} años` : ''} · {sexLabel[dog.sex]}</p><dl><div><dt>ESTERILIZADO</dt><dd>{dog.sterilized === null ? '—' : dog.sterilized ? 'Sí' : 'No'}</dd></div><div><dt>SOCIAL</dt><dd>{dog.sociability || '—'}</dd></div><div><dt>TAMAÑO</dt><dd>{sizeLabel[dog.size]}</dd></div></dl><button type="button" onClick={() => setDialog({ kind: 'dog', record: dog })}>EDITAR PERFIL →</button></div></article>)}</div> : <EmptyCard label="Agrega a tu compañero de cuatro patas para incluirlo en una aventura." action="AGREGAR MI PERRITO" onClick={() => setDialog({ kind: 'dog' })} />}

    {dialog?.kind === 'person' && <PersonDialog record={dialog.record} onClose={() => setDialog(null)} onSaved={() => saved(dialog.record ? 'Perfil actualizado.' : 'Persona agregada a tu manada.')} />}
    {dialog?.kind === 'dog' && <DogDialog profileId={profileId} record={dialog.record} onClose={() => setDialog(null)} onSaved={() => saved(dialog.record ? 'Perfil de tu perrito actualizado.' : 'Perrito agregado a tu manada.')} />}
  </>;
}

function EmptyCard({ label, action, onClick }: { label: string; action: string; onClick: () => void }) {
  return <div className="gang-empty"><span>＋</span><p>{label}</p><button type="button" onClick={onClick}>{action} →</button></div>;
}

function MexicoPhoneField({ label, name, defaultValue = '', required = false }: { label: string; name: string; defaultValue?: string; required?: boolean }) {
  const [digits, setDigits] = useState(mexicoNationalDigits(defaultValue));
  return <label>{label}<span className="mexico-phone"><b>MX +52</b><input required={required} name={name} inputMode="numeric" autoComplete="tel-national" pattern="[0-9]{10}" minLength={required ? 10 : undefined} maxLength={10} value={digits} onChange={(event) => setDigits(mexicoNationalDigits(event.target.value))} placeholder="2220000000" /></span><small>10 dígitos · sólo números de México</small></label>;
}

function PersonDialog({ record, onClose, onSaved }: { record?: PersonRecord; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError('');
    const data = new FormData(event.currentTarget);
    const payload = {
      firstName: data.get('firstName'), lastName: data.get('lastName'), email: data.get('email'), phone: data.get('phone'), birthDate: data.get('birthDate'),
      emergencyContactName: data.get('emergencyContactName'), emergencyContactPhone: data.get('emergencyContactPhone'), isMinor: data.get('isMinor') === 'on',
    };
    try {
      const response = await fetch(record ? `/api/people/${record.id}` : '/api/people', { method: record ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'No pudimos guardar la persona.');
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar la persona.'); }
    finally { setSaving(false); }
  };
  return <Dialog title={record ? 'Edita a tu acompañante' : 'Agrega a una persona'} intro="Guarda sus datos una vez y selecciónala fácilmente en futuras aventuras." onClose={onClose}>
    <form className="gang-form" onSubmit={submit}>
      <div className="gang-form-grid"><label>NOMBRE<input required minLength={2} name="firstName" defaultValue={record?.firstName} autoComplete="given-name" /></label><label>APELLIDOS<input required minLength={2} name="lastName" defaultValue={record?.lastName} autoComplete="family-name" /></label><label>EMAIL<input type="email" name="email" defaultValue={record?.email} autoComplete="email" /></label><MexicoPhoneField label="TELÉFONO" name="phone" defaultValue={record?.phone} /><label>FECHA DE NACIMIENTO<input type="date" name="birthDate" defaultValue={record?.birthDate} /></label><label className="check-field"><input type="checkbox" name="isMinor" defaultChecked={record?.isMinor} /> ES MENOR DE EDAD</label></div>
      <div className="gang-subsection"><span>CONTACTO DE EMERGENCIA</span><div className="gang-form-grid"><label>NOMBRE COMPLETO<input name="emergencyContactName" defaultValue={record?.emergencyContactName} /></label><MexicoPhoneField label="TELÉFONO" name="emergencyContactPhone" defaultValue={record?.emergencyContactPhone} /></div></div>
      {error && <p className="gang-form-error" role="alert">{error}</p>}
      <div className="gang-form-actions"><button type="button" onClick={onClose}>CANCELAR</button><button className="button button-primary" disabled={saving}>{saving ? 'GUARDANDO…' : 'GUARDAR PERSONA →'}</button></div>
    </form>
  </Dialog>;
}

function DogDialog({ profileId, record, onClose, onSaved }: { profileId: string; record?: DogRecord; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photoName, setPhotoName] = useState('');
  const existingPhoto = useMemo(() => record?.photoUrl || '', [record]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError('');
    const data = new FormData(event.currentTarget);
    let photoPath = record?.photoPath ?? '';
    try {
      const photo = data.get('photo');
      if (photo instanceof File && photo.size) {
        if (photo.size > 10 * 1024 * 1024) throw new Error('La foto debe pesar menos de 10 MB.');
        const extension = photo.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${profileId}/${crypto.randomUUID()}.${extension}`;
        const supabase = createSupabaseBrowserClient();
        const { error: uploadError } = await supabase.storage.from('dog-photos').upload(path, photo, { contentType: photo.type, upsert: false });
        if (uploadError) throw uploadError;
        photoPath = path;
      }
      const payload = {
        name: data.get('name'), breed: data.get('breed'), birthDate: data.get('birthDate'), sex: data.get('sex'), size: data.get('size'),
        sterilized: data.get('sterilized') === '' ? null : data.get('sterilized') === 'true', sociability: data.get('sociability'), reactivity: data.get('reactivity'),
        medicalConditions: data.get('medicalConditions'), medications: data.get('medications'), notes: data.get('notes'), photoPath,
      };
      const response = await fetch(record ? `/api/dogs/${record.id}` : '/api/dogs', { method: record ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'No pudimos guardar a tu perrito.');
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar a tu perrito.'); }
    finally { setSaving(false); }
  };
  return <Dialog title={record ? `Edita a ${record.name}` : 'Agrega a tu perrito'} intro="Esta información ayuda al equipo a preparar una aventura segura y feliz." onClose={onClose}>
    <form className="gang-form" onSubmit={submit}>
      <label className="dog-photo-field"><span>{existingPhoto ? <img src={existingPhoto} alt="Foto actual" /> : 'FOTO'}</span><b>{photoName || (existingPhoto ? 'CAMBIAR FOTO' : 'AGREGAR FOTO')}</b><small>JPG, PNG o WebP · máximo 10 MB</small><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhotoName(event.target.files?.[0]?.name ?? '')} /></label>
      <div className="gang-form-grid"><label>NOMBRE<input required minLength={2} name="name" defaultValue={record?.name} /></label><label>RAZA<input name="breed" defaultValue={record?.breed} placeholder="Mestizo, Westie…" /></label><label>FECHA DE NACIMIENTO<input type="date" name="birthDate" defaultValue={record?.birthDate} /></label><label>SEXO<select name="sex" defaultValue={record?.sex ?? 'UNKNOWN'}><option value="UNKNOWN">Sin especificar</option><option value="FEMALE">Hembra</option><option value="MALE">Macho</option></select></label><label>TAMAÑO<select name="size" defaultValue={record?.size ?? 'MEDIUM'}><option value="SMALL">Chico</option><option value="MEDIUM">Mediano</option><option value="LARGE">Grande</option><option value="XL">Extra grande</option></select></label><label>¿ESTÁ ESTERILIZADO?<select name="sterilized" defaultValue={record?.sterilized === null || record?.sterilized === undefined ? '' : String(record.sterilized)}><option value="">Sin especificar</option><option value="true">Sí</option><option value="false">No</option></select></label><label>SOCIABILIDAD<input name="sociability" defaultValue={record?.sociability} placeholder="Muy sociable, tímido…" /></label><label>REACTIVIDAD<input name="reactivity" defaultValue={record?.reactivity} placeholder="Ruidos, perros grandes…" /></label><label className="full-field">CONDICIONES MÉDICAS<textarea name="medicalConditions" defaultValue={record?.medicalConditions} /></label><label className="full-field">MEDICAMENTOS<textarea name="medications" defaultValue={record?.medications} /></label><label className="full-field">NOTAS PARA LOS GUÍAS<textarea name="notes" defaultValue={record?.notes} /></label></div>
      {error && <p className="gang-form-error" role="alert">{error}</p>}
      <div className="gang-form-actions"><button type="button" onClick={onClose}>CANCELAR</button><button className="button button-primary" disabled={saving}>{saving ? 'GUARDANDO…' : 'GUARDAR PERRITO →'}</button></div>
    </form>
  </Dialog>;
}

function Dialog({ title, intro, onClose, children }: { title: string; intro: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="gang-dialog-backdrop" role="presentation"><section className="gang-dialog" role="dialog" aria-modal="true" aria-labelledby="gang-dialog-title"><header><div><p>MI MANADA</p><h2 id="gang-dialog-title">{title}</h2><span>{intro}</span></div><button type="button" onClick={onClose} aria-label="Cerrar">×</button></header>{children}</section></div>;
}

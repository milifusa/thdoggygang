import { HikeMode } from './hike-mode';
import { requireStaffSession } from '../../lib/auth/guards';
export const metadata = { title: 'Modo Hike | The Doggy Gang', description: 'Check-in operativo para guías.' };
export const dynamic = 'force-dynamic';
export default async function HikeModePage() { const session = await requireStaffSession('/admin/hike-mode', true); return <HikeMode demo={session.mode === 'demo'} />; }

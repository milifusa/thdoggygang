'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ApprovePaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter(); const [state, setState] = useState<'idle'|'saving'|'error'>('idle');
  const approve = async () => { setState('saving'); const response = await fetch(`/api/admin/payments/${paymentId}/approve`, { method: 'POST' }); if (!response.ok) { setState('error'); return; } router.refresh(); };
  return <button className="approve-payment" onClick={approve} disabled={state === 'saving'}>{state === 'saving' ? 'APROBANDO…' : state === 'error' ? 'REINTENTAR' : 'APROBAR PAGO →'}</button>;
}

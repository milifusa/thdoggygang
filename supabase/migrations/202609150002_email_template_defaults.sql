update public.email_templates
set eyebrow = 'LISTA DE ESPERA', updated_at = now()
where key = 'WAITLIST_OFFER' and eyebrow = '';

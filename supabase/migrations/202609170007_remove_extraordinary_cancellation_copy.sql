update public.cancellation_settings
set late_message = '¡Ups! Por ahora ya no podemos darte la pata. Cuando faltan menos de 48 horas ya no podemos cancelar, porque toda la aventura se organizó contando contigo.',
    updated_at = now()
where id = 1
  and late_message = '¡Ups! Por ahora ya no podemos darte la pata. Cuando faltan menos de 48 horas ya no podemos cancelar, porque toda la aventura se organizó contando contigo. Si surgió algo extraordinario, escríbenos y revisamos tu caso.';

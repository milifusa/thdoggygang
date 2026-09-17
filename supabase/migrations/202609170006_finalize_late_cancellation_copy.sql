update public.cancellation_settings
set late_message = '¡Ups! Por ahora ya no podemos darte la pata. Cuando faltan menos de 48 horas ya no podemos cancelar, porque toda la aventura se organizó contando contigo. Si surgió algo extraordinario, escríbenos y revisamos tu caso.',
    updated_at = now()
where id = 1
  and late_message = 'Las mochilas están listas, las correas formadas y la ruta ya cuenta tus huellitas. A menos de 48 horas, tu lugar ya está incluido en transporte, equipo y logística, por eso las cancelaciones están cerradas. Si pasó algo extraordinario, escríbenos y lo revisamos contigo.';

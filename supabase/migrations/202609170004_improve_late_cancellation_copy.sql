update public.cancellation_settings
set late_message = 'Las mochilas están listas, las correas formadas y la ruta ya cuenta tus huellitas. A menos de 48 horas, tu lugar ya está incluido en transporte, equipo y logística, por eso las cancelaciones están cerradas. Si pasó algo extraordinario, escríbenos y lo revisamos contigo.',
    updated_at = now()
where id = 1
  and late_message = 'La manada ya está preparando mochilas, correas y rutas. En esta etapa ya no es posible cancelar desde la web porque tu lugar y la logística están confirmados.';

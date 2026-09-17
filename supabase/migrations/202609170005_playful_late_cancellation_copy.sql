update public.cancellation_settings
set late_message = 'Las mochilas están listas, las correas formadas y la ruta ya cuenta tus huellitas. A menos de 48 horas, tu lugar ya está incluido en transporte, equipo y logística, por eso las cancelaciones están cerradas. Si pasó algo extraordinario, escríbenos y lo revisamos contigo.',
    updated_at = now()
where id = 1
  and late_message = 'La aventura ya empezó a moverse: la manada está cerrando ruta, transporte, equipo y el lugar de cada integrante. Por eso, cuando faltan menos de 48 horas ya no es posible cancelar; tu espacio ya forma parte de toda la preparación.';

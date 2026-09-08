export type Adventure = {
  slug: string;
  title: string;
  date: string;
  shortDate: string;
  time: string;
  location: string;
  price: number;
  distance: string;
  duration: string;
  difficulty: string;
  elevation: string;
  terrain: string;
  spots: number;
  image: string;
  description: string;
};

export const adventures: Adventure[] = [
  {
    slug: 'sendero-del-duende', title: 'Sendero del Duende', date: '20 de septiembre de 2026', shortDate: '20 SEP', time: '07:00 AM', location: 'Cholula, Puebla', price: 350, distance: '8 km', duration: '2.5 h', difficulty: 'Fácil / media', elevation: '320 m', terrain: 'Bosque y sendero', spots: 12,
    image: 'https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=crop&w=1800&q=90',
    description: 'Un sendero entre bosque, vistas abiertas y rincones que parecen salidos de un cuento. Ideal para quienes quieren estrenar patas en la montaña o volver a disfrutar el camino con calma.',
  },
  {
    slug: 'bosque-de-las-nubes', title: 'Bosque de las Nubes', date: '5 de octubre de 2026', shortDate: '05 OCT', time: '06:30 AM', location: 'Zacatlán, Puebla', price: 490, distance: '11 km', duration: '4 h', difficulty: 'Media', elevation: '560 m', terrain: 'Bosque húmedo', spots: 8,
    image: 'https://images.unsplash.com/photo-1534361960057-19889db9621e?auto=format&fit=crop&w=1800&q=90',
    description: 'Una caminata fresca entre neblina, pinos y tierra húmeda. Una aventura para manadas con algo de experiencia y muchas ganas de explorar.',
  },
  {
    slug: 'amanecer-en-izta', title: 'Amanecer en Izta', date: '19 de octubre de 2026', shortDate: '19 OCT', time: '05:30 AM', location: 'Amecameca, Estado de México', price: 620, distance: '6 km', duration: '3 h', difficulty: 'Media', elevation: '440 m', terrain: 'Alta montaña', spots: 6,
    image: 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=1800&q=90',
    description: 'Madrugamos para ver cómo la montaña se enciende. Una ruta corta, pausada y memorable para binomios que disfrutan la altura.',
  },
];

export const getAdventure = (slug: string) => adventures.find((item) => item.slug === slug) ?? adventures[0];

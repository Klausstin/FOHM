export interface SubCategory {
  name: string;
  subCategories?: (string | SubCategory)[];
}

export interface Category {
  name: string;
  icon: string;
  color: string;
  subCategories: (string | SubCategory)[];
}

export const PREDEFINED_CATEGORIES: Category[] = [
  {
    name: 'Alimentos y bebidas',
    icon: 'Utensils',
    color: '#EF4444',
    subCategories: ['Compras varias', 'Dietética', 'Kiosco', 'Verdulería', 'Almuerzo', 'Viandas'],
  },
  {
    name: 'Compras',
    icon: 'ShoppingBag',
    color: '#3B82F6',
    subCategories: [
      { name: 'Hogar, jardín', subCategories: ['Jardinería', 'Vajillas', 'Muebles'] },
      'Niños',
      'Salud y belleza',
      'Joyería, accesorios',
      'Ropa y calzado',
    ],
  },
  {
    name: 'Vivienda',
    icon: 'Home',
    color: '#F59E0B',
    subCategories: [
      'Seguro de propiedad',
      'Mantenimiento, reparaciones',
      { name: 'Servicios', subCategories: ['Limpieza', 'Expensas', { name: 'Energía, servicios', subCategories: ['ABL', 'Electricidad'] }] },
      'Baulera',
      'Alquiler',
    ],
  },
  {
    name: 'Transporte',
    icon: 'Bus',
    color: '#6B7280',
    subCategories: ['Larga distancia', 'Uber-Cabify', 'SUBE'],
  },
  {
    name: 'Vehículo',
    icon: 'Car',
    color: '#A855F7',
    subCategories: [
      'Multas auto',
      'Seguro de vehículo',
      'VTV',
      'Patente',
      'Peajes',
      { name: 'Mantenimiento de vehículos', subCategories: ['Service', 'Lava autos'] },
      'Estacionamiento',
      'Combustible',
    ],
  },
  {
    name: 'Vida y entretenimiento',
    icon: 'User',
    color: '#10B981',
    subCategories: [
      'Documentos',
      'Alcohol',
      { name: 'Regalos y caridad', subCategories: ['Caridad', 'Regalos'] },
      { name: 'Vacaciones, viajes, hoteles', subCategories: ['Pasajes', 'Estadía'] },
      { name: 'TV, streaming', subCategories: ['YouTube Premium', 'Disney+', 'Crunchyroll', 'Amazon Prime Video'] },
      { name: 'Libros, audio, suscripciones', subCategories: ['Spotify', 'Libros'] },
      { name: 'Educación, desarrollo', subCategories: ['Cursos'] },
      { name: 'Pasatiempos', subCategories: ['Programas', 'Juntada', 'Fiesta', 'Evento', 'Cine', 'Networking', 'Kartings', 'Bar/resto', 'Delivery comida'] },
      'Cultura, eventos deportivos',
      { name: 'Deporte activo, fitness', subCategories: ['Entrenador', 'Ski', 'Golf', 'Padel', 'Gimnasio', 'Proteína', 'Fútbol'] },
      { name: 'Bienestar, belleza', subCategories: ['Corte de pelo'] },
      { name: 'Atención médica', subCategories: ['Nutricionista', 'Obra social', 'Psicólogo', 'Dentista'] },
    ],
  },
  {
    name: 'Tecnología',
    icon: 'Monitor',
    color: '#3B82F6',
    subCategories: [
      { name: 'Software, aplicaciones, juegos', subCategories: ['Almacenamiento', 'Discord Nitro', 'Juegos'] },
      'Internet',
      'Telefonía, móvil',
    ],
  },
  {
    name: 'Gastos financieros',
    icon: 'Coins',
    color: '#14B8A6',
    subCategories: [
      'Manutención',
      { name: 'Banco', subCategories: ['Tarjeta Visa', 'Tarjeta Amex', 'Tarjeta MasterCard'] },
      'Asesoría',
      'Multas',
      'Préstamos, intereses',
      'Seguros',
      { name: 'Impuestos', subCategories: ['Autónomos'] },
    ],
  },
  {
    name: 'Inversiones',
    icon: 'TrendingUp',
    color: '#EC4899',
    subCategories: ['Colecciones', 'Ahorros', 'Inversiones financieras', 'Vehículos, bienes muebles', 'Bienes raíces'],
  },
  {
    name: 'Ingresos',
    icon: 'Banknote',
    color: '#FBBF24',
    subCategories: [
      'Regalos',
      'Manutención',
      'Reembolsos',
      'Lotería, juegos de azar',
      'Cheques, cupones',
      'Ingresos por préstamo o alquiler',
      'Cuotas y subvenciones',
      'Ingresos por alquiler',
      'Venta',
      'Intereses, dividendos',
      { name: 'Salario, facturas', subCategories: ['Sueldo'] },
      'Premio',
    ],
  },
  {
    name: 'Otros',
    icon: 'List',
    color: '#9CA3AF',
    subCategories: ['General'],
  },
];

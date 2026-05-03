export interface SubCategory {
  name: string;
  subCategories?: string[];
}

export interface Category {
  name: string;
  icon: string;
  color: string;
  subCategories: (string | SubCategory)[];
}

export const PREDEFINED_CATEGORIES: Category[] = [
  {
    name: 'Alimentos y Bebidas',
    icon: 'Utensils',
    color: '#EF4444',
    subCategories: ['Compras Varias', 'Dietética', 'Kiosco', 'Verdulería', 'Almuerzo', 'Viandas']
  },
  {
    name: 'Compras',
    icon: 'ShoppingBag',
    color: '#3B82F6',
    subCategories: [
      { name: 'Hogar, jardín', subCategories: ['Jardinería', 'Vajillas', 'Muebles'] },
      'Niños', 'Salud y belleza', 'Joyería, accesorios', 'Ropa y calzado'
    ]
  },
  {
    name: 'Vivienda',
    icon: 'Home',
    color: '#F59E0B',
    subCategories: [
      'Seguro de propiedad', 'Mantenimiento, reparaciones', 
      { name: 'Servicios', subCategories: ['Limpieza', 'Expensas', { name: 'Energía, servicios', subCategories: ['ABL', 'Electricidad'] } as any] },
      'Baulera', 'Alquiler'
    ]
  },
  {
    name: 'Transporte',
    icon: 'Bus',
    color: '#6B7280',
    subCategories: ['Larga distancia', 'Uber-Cabify', 'SUBE']
  },
  {
    name: 'Vehículo',
    icon: 'Car',
    color: '#A855F7',
    subCategories: [
      'Multas Auto', 'Seguro de vehículo', 'Seguro Vehículo', 'VTV', 'Patente', 'Peajes', 
      { name: 'Mantenimiento de vehículos', subCategories: ['Service', 'Lava Autos'] },
      'Estacionamiento', 'Combustible'
    ]
  },
  {
    name: 'Vida y entretenimiento',
    icon: 'User',
    color: '#10B981',
    subCategories: [
      'Documentos', 'Alcohol', 
      { name: 'Regalos & Caridad', subCategories: ['Caridad', 'Regalos'] },
      { name: 'Vacaciones, viajes, hoteles', subCategories: ['Pasajes', 'Estadía'] },
      { name: 'TV, Streaming', subCategories: ['YouTube Premium', 'Disney & Star+', 'Crunchyroll', 'Amazon Prime Video'] },
      { name: 'Libros, audio, suscripciones', subCategories: ['Spotify', 'Libros'] },
      { name: 'Educación, desarrollo', subCategories: ['Cursos'] },
      { name: 'Pasatiempos', subCategories: ['Programas', 'Juntada', 'Boliche/Fiesta', 'Evento', 'Cine', 'Networking', 'Kartings', 'Bar/Resto', 'Delivery Comida'] },
      'Cultura, eventos deportivos', 
      { name: 'Deporte activo, fitness', subCategories: ['Entrenador', 'Ski', 'Golf', 'Padel', 'Gimnasio', 'Proteína', 'Fútbol'] },
      { name: 'Bienestar, belleza', subCategories: ['Corte de Pelo'] },
      { name: 'Atención médica, doctor', subCategories: ['Nutricionista', 'Obra Social', 'Psicólogo', 'Dentista'] }
    ]
  },
  {
    name: 'Tecnología',
    icon: 'Monitor',
    color: '#3B82F6',
    subCategories: [
      { name: 'Software, aplicaciones, juegos', subCategories: ['Almacenamiento', 'Discord Nitro', 'Juegos'] },
      'Internet', 'Telefonía, móvil'
    ]
  },
  {
    name: 'Gastos financieros',
    icon: 'Coins',
    color: '#14B8A6',
    subCategories: [
      'Manutención', 
      { name: 'Banco', subCategories: ['Tarjeta Visa', 'Tarjeta Amex', 'Tarjeta MasterCard'] },
      'Asesoría', 'Multas', 'Préstamos, intereses', 'Seguros', 
      { name: 'Impuestos', subCategories: ['Autónomos'] }
    ]
  },
  {
    name: 'Inversiones',
    icon: 'TrendingUp',
    color: '#EC4899',
    subCategories: ['Colecciones', 'Ahorros', 'Inversiones financieras', 'Vehículos, bienes muebles', 'Bienes raíces']
  },
  {
    name: 'Ingresos',
    icon: 'Banknote',
    color: '#FBBF24',
    subCategories: [
      'Regalos', 'Manutención', 'Reembolsos (impuesto, compra)', 'Lotería, juegos de azar', 'Cheques, cupones', 
      'Ingresos por préstamo o alquiler', 'Cuotas y subvenciones', 'Ingresos por alquiler', 'Venta', 'Intereses, dividendos', 
      { name: 'Salario, facturas', subCategories: ['Sueldo'] },
      'Premio'
    ]
  },
  {
    name: 'Otros',
    icon: 'List',
    color: '#9CA3AF',
    subCategories: ['General']
  }
];

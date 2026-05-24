export interface MerchantSuggestion {
  rawDescription: string;
  normalizedDescription: string;
  merchantName: string;
  merchantKey: string;
  category: string;
  subCategory: string;
  isLikelyRecurring: boolean;
  confidence: number;
}

const KNOWN_MERCHANTS = [
  {
    key: 'spotify',
    name: 'Spotify',
    patterns: [/spotify/i],
    category: 'Ocio y cultura',
    subCategory: 'Streaming / musica',
    recurring: true,
  },
  {
    key: 'netflix',
    name: 'Netflix',
    patterns: [/netflix/i],
    category: 'Ocio y cultura',
    subCategory: 'Streaming / musica',
    recurring: true,
  },
  {
    key: 'youtube',
    name: 'YouTube',
    patterns: [/youtube|google.*youtube/i],
    category: 'Ocio y cultura',
    subCategory: 'Streaming / musica',
    recurring: true,
  },
  {
    key: 'mercado-pago',
    name: 'Mercado Pago',
    patterns: [/mercado\s*pago|mercadopago|mpago|mp\*/i],
    category: 'Otros',
    subCategory: 'Otros',
    recurring: false,
  },
  {
    key: 'pedidos-ya',
    name: 'PedidosYa',
    patterns: [/pedidos?\s*ya|pedidosya/i],
    category: 'Comida',
    subCategory: 'Delivery',
    recurring: false,
  },
  {
    key: 'uber',
    name: 'Uber',
    patterns: [/uber/i],
    category: 'Transporte',
    subCategory: 'Apps / taxi',
    recurring: false,
  },
  {
    key: 'cabify',
    name: 'Cabify',
    patterns: [/cabify/i],
    category: 'Transporte',
    subCategory: 'Apps / taxi',
    recurring: false,
  },
  {
    key: 'apple',
    name: 'Apple',
    patterns: [/apple\.com|apple/i],
    category: 'Servicios',
    subCategory: 'Software / suscripciones',
    recurring: true,
  },
  {
    key: 'openai',
    name: 'OpenAI',
    patterns: [/openai|chatgpt/i],
    category: 'Educacion y trabajo',
    subCategory: 'Herramientas trabajo',
    recurring: true,
  },
  {
    key: 'edenor',
    name: 'Edenor',
    patterns: [/edenor/i],
    category: 'Servicios',
    subCategory: 'Luz / gas / agua',
    recurring: true,
  },
  {
    key: 'personal-flow',
    name: 'Personal Flow',
    patterns: [/personal\s*flow|flow/i],
    category: 'Servicios',
    subCategory: 'Internet / telefono',
    recurring: true,
  },
  {
    key: 'osde',
    name: 'OSDE',
    patterns: [/osde/i],
    category: 'Salud',
    subCategory: 'Prepaga / obra social',
    recurring: true,
  },
  {
    key: 'hoyts',
    name: 'Hoyts',
    patterns: [/hoyts|cinemark|showcase/i],
    category: 'Ocio y cultura',
    subCategory: 'Cine / teatro / eventos',
    recurring: false,
  },
  {
    key: 'airbnb',
    name: 'Airbnb',
    patterns: [/airbnb/i],
    category: 'Viajes',
    subCategory: 'Alojamiento',
    recurring: false,
  },
  {
    key: 'kfc',
    name: 'KFC',
    patterns: [/\bkfc\b/i],
    category: 'Comida',
    subCategory: 'Restaurantes',
    recurring: false,
  },
  {
    key: 'autopistas-del-sol',
    name: 'Autopistas del Sol',
    patterns: [/autopistas?\s+del\s+s/i],
    category: 'Vehiculo / Auto',
    subCategory: 'Peajes',
    recurring: false,
  },
];

export function suggestMerchant(description: string): MerchantSuggestion {
  const normalizedDescription = normalizeMerchantText(description);
  const known = KNOWN_MERCHANTS.find(merchant =>
    merchant.patterns.some(pattern => pattern.test(description) || pattern.test(normalizedDescription)),
  );

  if (known) {
    return {
      rawDescription: description,
      normalizedDescription,
      merchantName: known.name,
      merchantKey: known.key,
      category: known.category,
      subCategory: known.subCategory,
      isLikelyRecurring: known.recurring,
      confidence: 0.92,
    };
  }

  const merchantName = titleCase(
    normalizedDescription
      .split(' ')
      .filter(part => part.length > 2)
      .slice(0, 3)
      .join(' '),
  ) || 'Comercio sin identificar';

  return {
    rawDescription: description,
    normalizedDescription,
    merchantName,
    merchantKey: slugify(merchantName || normalizedDescription),
    category: 'Otros',
    subCategory: 'Otros',
    isLikelyRecurring: false,
    confidence: 0.45,
  };
}

export function buildMerchantRecurringKey(description: string, fallbackCategory = '') {
  const merchant = suggestMerchant(description);
  if (merchant.confidence >= 0.8) return merchant.merchantKey;

  const usefulParts = merchant.normalizedDescription
    .split(' ')
    .filter(part => part.length > 3 && !/^\d+$/.test(part))
    .slice(0, 4)
    .join('-');

  return usefulParts || slugify(fallbackCategory);
}

function normalizeMerchantText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(comprobante|compra|consumo|debito|credito|visa|mastercard|nro|numero|tarjeta)\b/g, ' ')
    .replace(/[0-9]{3,}/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value: string) {
  return normalizeMerchantText(value).replace(/\s+/g, '-');
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, letter => letter.toUpperCase()).trim();
}

import type { NeutralType, TransactionKind } from './finance.types';
import { inferTravelContext } from '../travel/travelContext';

export interface FinanceSubcategoryDefinition {
  id: string;
  categoryId: string;
  name: string;
  isDefault: boolean;
  isArchived: boolean;
  sortOrder: number;
  keywords?: string[];
  metadata?: {
    vehicleCostType?: 'tenencia' | 'uso';
  };
}

export interface FinanceCategoryDefinition {
  id: string;
  name: string;
  kind: TransactionKind;
  reportGroup?: string;
  isDefault: boolean;
  isArchived: boolean;
  sortOrder: number;
  icon: string;
  color: string;
  keywords?: string[];
  subcategories: FinanceSubcategoryDefinition[];
}

export interface FinanceClassificationSuggestion {
  kind: TransactionKind;
  neutralType?: NeutralType;
  category: string;
  subcategory: string;
  travelCategory?: string;
  travelTripSuggestion?: string;
  confidence: number;
  reason: string;
}

export interface FinanceClassificationResult {
  input: string;
  suggestion: FinanceClassificationSuggestion;
  alternatives: FinanceClassificationSuggestion[];
  suggestedTags: string[];
  shouldCreateNewCategory: boolean;
  shouldCreateNewSubcategory: boolean;
}

export const DEFAULT_FINANCE_CATEGORIES: FinanceCategoryDefinition[] = [
  category('comida', 'Comida', 'expense', 10, 'Utensils', '#EF4444', ['comida', 'almuerzo', 'cena', 'restaurant', 'resto', 'bar', 'delivery', 'supermercado', 'mercado'], [
    sub('supermercado', 'Supermercado', ['super', 'supermercado', 'carrefour', 'coto', 'dia', 'jumbo']),
    sub('almuerzo-cena', 'Almuerzo / cena afuera', ['almuerzo', 'cena', 'restaurant', 'resto', 'bar', 'cafe']),
    sub('delivery', 'Delivery', ['delivery', 'pedidosya', 'rappi']),
    sub('otros-comida', 'Otros comida', ['kiosco', 'panaderia', 'verduleria']),
  ]),
  category('vivienda', 'Vivienda', 'expense', 20, 'Home', '#F59E0B', ['alquiler', 'expensas', 'casa', 'departamento', 'muebles'], [
    sub('alquiler', 'Alquiler', ['alquiler']),
    sub('expensas', 'Expensas', ['expensas']),
    sub('mantenimiento', 'Mantenimiento', ['mantenimiento', 'reparacion', 'plomero', 'electricista']),
    sub('equipamiento-hogar', 'Equipamiento hogar', ['mueble', 'sillon', 'cama', 'vajilla']),
  ]),
  category('servicios', 'Servicios', 'expense', 30, 'Monitor', '#3B82F6', ['luz', 'gas', 'agua', 'internet', 'telefono', 'celular', 'flow', 'personal'], [
    sub('internet-telefono', 'Internet / telefono', ['internet', 'telefono', 'celular', 'flow', 'personal']),
    sub('energia-servicios', 'Luz / gas / agua', ['edenor', 'edesur', 'metrogas', 'aysa', 'luz', 'gas', 'agua']),
    sub('software-suscripciones', 'Software / suscripciones', ['spotify', 'netflix', 'youtube', 'apple', 'openai', 'chatgpt', 'software']),
  ]),
  category('transporte', 'Transporte', 'expense', 40, 'Bus', '#6B7280', ['uber', 'cabify', 'taxi', 'sube', 'subte', 'tren', 'colectivo'], [
    sub('uber-cabify', 'Uber-Cabify', ['uber', 'cabify', 'taxi']),
    sub('transporte-publico', 'Transporte publico', ['sube', 'subte', 'tren', 'colectivo', 'bondi']),
    sub('larga-distancia', 'Larga distancia', ['micro', 'bus', 'tren larga distancia']),
  ], 'Movilidad'),
  category('vehiculo-auto', 'Vehiculo / Auto', 'expense', 50, 'Car', '#A855F7', ['auto', 'vehiculo', 'nafta', 'peaje', 'seguro auto', 'patente', 'vtv', 'garage'], [
    sub('seguro-vehiculo', 'Seguro vehiculo', ['seguro auto', 'seguro vehiculo'], { vehicleCostType: 'tenencia' }),
    sub('patente', 'Patente', ['patente'], { vehicleCostType: 'tenencia' }),
    sub('vtv', 'VTV', ['vtv'], { vehicleCostType: 'tenencia' }),
    sub('cochera-garage', 'Cochera / garage', ['cochera', 'garage'], { vehicleCostType: 'tenencia' }),
    sub('service-mantenimiento', 'Service / mantenimiento', ['service', 'mantenimiento'], { vehicleCostType: 'tenencia' }),
    sub('combustible', 'Combustible', ['nafta', 'ypf', 'shell', 'axion', 'combustible'], { vehicleCostType: 'uso' }),
    sub('peajes', 'Peajes', ['peaje', 'autopista'], { vehicleCostType: 'uso' }),
    sub('estacionamiento', 'Estacionamiento', ['estacionamiento'], { vehicleCostType: 'uso' }),
    sub('lavado', 'Lavado', ['lavado', 'lava autos'], { vehicleCostType: 'uso' }),
    sub('multas', 'Multas', ['multa'], { vehicleCostType: 'uso' }),
    sub('reparaciones', 'Reparaciones', ['reparacion', 'neumatico', 'cubierta'], { vehicleCostType: 'uso' }),
  ], 'Movilidad'),
  category('salud', 'Salud', 'expense', 60, 'HeartPulse', '#10B981', ['salud', 'medico', 'pediatra', 'farmacia', 'terapia', 'osde', 'dentista'], [
    sub('prepaga-obra-social', 'Prepaga / obra social', ['osde', 'prepaga', 'obra social']),
    sub('medicos-estudios', 'Medicos / estudios', ['medico', 'pediatra', 'estudio', 'clinica']),
    sub('farmacia', 'Farmacia', ['farmacia']),
    sub('terapia', 'Terapia', ['terapia', 'psicologo']),
    sub('fitness', 'Fitness', ['gym', 'gimnasio', 'entrenador', 'deporte']),
  ]),
  category('higiene-cuidado', 'Higiene', 'expense', 65, 'Heart', '#06B6D4', ['higiene', 'panal', 'panales', 'pañal', 'pañales', 'toallitas', 'bebe', 'beba', 'maximo', 'máximo'], [
    sub('bebe', 'Bebé', ['panal', 'panales', 'pañal', 'pañales', 'toallitas', 'bebe', 'beba', 'maximo', 'máximo']),
    sub('higiene-personal', 'Higiene personal', ['higiene', 'shampoo', 'jabon', 'desodorante', 'toallitas']),
  ]),
  category('compras', 'Compras', 'expense', 70, 'ShoppingBag', '#EC4899', ['compra', 'compre', 'ropa', 'calzado', 'zapatilla', 'zapatillas', 'zapas', 'zapato', 'zapatos', 'nike', 'adidas', 'campera', 'pantalon', 'remera', 'peluqueria'], [
    sub('ropa-calzado', 'Ropa y calzado', ['ropa', 'calzado', 'zapatilla', 'zapatillas', 'zapas', 'zapato', 'zapatos', 'nike', 'adidas', 'campera', 'pantalon', 'remera']),
    sub('cuidado-personal', 'Cuidado personal', ['peluqueria', 'barberia', 'corte', 'belleza']),
  ]),
  category('ocio-cultura', 'Ocio y cultura', 'expense', 80, 'Sparkles', '#14B8A6', ['cine', 'teatro', 'juego', 'salida', 'spotify', 'netflix', 'evento'], [
    sub('cine-teatro-eventos', 'Cine / teatro / eventos', ['cine', 'teatro', 'evento']),
    sub('streaming-musica', 'Streaming / musica', ['spotify', 'netflix', 'youtube', 'disney']),
    sub('juegos-hobbies', 'Juegos / hobbies', ['juego', 'hobby']),
  ]),
  category('viajes', 'Viajes', 'expense', 90, 'Plane', '#0EA5E9', ['viaje', 'hotel', 'airbnb', 'pasaje', 'vuelo', 'roma', 'italia'], [
    sub('pasajes', 'Pasajes', ['pasaje', 'vuelo', 'tren']),
    sub('alojamiento', 'Alojamiento', ['hotel', 'airbnb', 'estadia']),
    sub('comidas-salidas', 'Comidas y salidas', ['cena', 'almuerzo', 'desayuno', 'restaurant', 'bar', 'cafe']),
    sub('traslados-locales', 'Traslados locales', ['uber', 'cabify', 'taxi', 'metro', 'bus', 'subte']),
    sub('experiencias-entradas', 'Experiencias y entradas', ['museo', 'entrada', 'tour', 'excursion']),
    sub('compras-ropa-viaje', 'Compras y ropa', ['ropa', 'zapatillas', 'calzado', 'shopping']),
    sub('supermercado-farmacia-viaje', 'Supermercado y farmacia', ['supermercado', 'farmacia', 'carrefour']),
    sub('gastos-en-viaje', 'Gastos en viaje', ['viaje', 'turismo']),
  ]),
  category('educacion-trabajo', 'Educacion y trabajo', 'expense', 100, 'Briefcase', '#6366F1', ['curso', 'libro', 'educacion', 'trabajo', 'herramienta'], [
    sub('cursos-libros', 'Cursos / libros', ['curso', 'libro', 'educacion']),
    sub('herramientas-trabajo', 'Herramientas trabajo', ['herramienta', 'openai', 'chatgpt']),
  ]),
  category('mascotas', 'Mascotas', 'expense', 110, 'Heart', '#84CC16', ['gato', 'perro', 'mascota', 'veterinaria'], [
    sub('alimento', 'Alimento', ['comida gato', 'alimento', 'balanceado']),
    sub('veterinaria', 'Veterinaria', ['veterinaria', 'vet']),
    sub('otros-mascotas', 'Otros mascotas', ['mascota', 'gato', 'perro']),
  ]),
  category('finanzas-impuestos', 'Finanzas e impuestos', 'expense', 120, 'Coins', '#64748B', ['comision', 'impuesto', 'seguro', 'interes', 'contador'], [
    sub('comisiones-bancarias', 'Comisiones bancarias', ['comision', 'banco']),
    sub('impuestos', 'Impuestos', ['impuesto', 'afip', 'monotributo', 'autonomos']),
    sub('seguros', 'Seguros', ['seguro']),
    sub('intereses-deuda', 'Intereses deuda', ['interes', 'prestamo']),
  ]),
  category('ingresos', 'Ingresos', 'income', 130, 'Banknote', '#22C55E', ['sueldo', 'honorarios', 'venta', 'ingreso', 'cobre'], [
    sub('sueldo', 'Sueldo', ['sueldo', 'haberes']),
    sub('honorarios', 'Honorarios', ['honorarios', 'factura']),
    sub('ventas', 'Ventas', ['venta']),
    sub('rendimientos', 'Rendimientos', ['interes', 'dividendo', 'rendimiento']),
  ]),
  category('reintegros', 'Reintegros / devoluciones', 'income', 140, 'ArrowLeftRight', '#06B6D4', ['reembolso', 'reintegro', 'devolucion'], [
    sub('reembolso', 'Reembolso', ['reembolso']),
    sub('devolucion', 'Devolucion', ['devolucion']),
    sub('reintegro', 'Reintegro', ['reintegro']),
  ]),
  category('movimientos-neutros', 'Movimientos neutros', 'neutral', 150, 'ArrowLeftRight', '#9CA3AF', ['transferencia', 'pago visa', 'pago tarjeta', 'dolares', 'inversion', 'prestamo'], [
    sub('transferencia-interna', 'Transferencia interna', ['transferencia propia', 'entre cuentas']),
    sub('pago-tarjeta-credito', 'Pago tarjeta credito', ['pago visa', 'pago mastercard', 'pago tarjeta']),
    sub('cambio-moneda', 'Cambio de moneda', ['comprar dolares', 'comprar euros', 'cambio']),
    sub('movimiento-inversion', 'Movimiento inversion', ['inversion', 'broker', 'acciones', 'cripto']),
    sub('movimiento-prestamo', 'Movimiento prestamo', ['prestamo']),
    sub('ajuste-saldo', 'Ajuste de saldo', ['ajuste saldo']),
  ]),
  category('otros', 'Otros', 'expense', 999, 'List', '#9CA3AF', ['otros', 'sin categorizar'], [
    sub('otros', 'Otros', ['otros']),
  ]),
];

export function classifyFinanceText(input: string, learnedMappings: any[] = []): FinanceClassificationResult {
  const normalized = normalizeFinanceText(input);
  const learned = findLearnedClassification(normalized, learnedMappings);
  if (learned) return learned;

  const neutral = classifyNeutral(normalized);
  if (neutral) return buildResult(input, neutral, [], getSuggestedTags(normalized));

  const travel = inferTravelContext(input);
  if (travel) {
    return buildResult(input, {
      kind: 'expense',
      category: 'Viajes',
      subcategory: travel.travelCategory,
      travelCategory: travel.travelCategory,
      travelTripSuggestion: travel.travelTripSuggestion,
      confidence: travel.confidence === 'high' ? 0.94 : 0.76,
      reason: `Detecte contexto de viaje: ${travel.travelTripSuggestion}.`,
    }, [], getSuggestedTags(normalized));
  }

  const scored = DEFAULT_FINANCE_CATEGORIES
    .filter(category => category.kind !== 'neutral')
    .flatMap(category =>
      category.subcategories.map(subcategory => {
        const categoryScore = scoreTerms(normalized, category.keywords || []);
        const subcategoryScore = scoreTerms(normalized, subcategory.keywords || []);
        const score = categoryScore + subcategoryScore + (subcategoryScore > 0 ? 0.22 : 0);
        return { category, subcategory, score };
      }),
    )
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) {
    return buildResult(input, {
      kind: 'expense',
      category: 'Otros',
      subcategory: 'Otros',
      confidence: 0.35,
      reason: 'No encaja con suficiente claridad en una categoria actual.',
    }, [], getSuggestedTags(normalized), false, true);
  }

  const suggestion = {
    kind: best.category.kind,
    category: best.category.name,
    subcategory: best.subcategory.name,
    confidence: Math.min(0.98, 0.52 + best.score),
    reason: `Coincide con señales de ${best.subcategory.name}.`,
  };

  const alternatives = scored
    .slice(1)
    .filter(item => item.category.name !== suggestion.category || item.subcategory.name !== suggestion.subcategory)
    .slice(0, 3)
    .map(item => ({
      kind: item.category.kind,
      category: item.category.name,
      subcategory: item.subcategory.name,
      confidence: Math.min(0.9, 0.45 + item.score),
      reason: `Tambien podria entrar en ${item.subcategory.name}.`,
    }));

  return buildResult(input, suggestion, alternatives, getSuggestedTags(normalized));
}

export function buildFinanceLearningKey(input: string) {
  return normalizeFinanceText(input)
    .split(' ')
    .filter(part => part.length > 2 && !FINANCE_STOP_WORDS.has(part) && !/^\d+$/.test(part))
    .slice(0, 6)
    .join(' ');
}

export function toLegacyPredefinedCategories() {
  return DEFAULT_FINANCE_CATEGORIES
    .filter(category => !category.isArchived)
    .map(category => ({
      name: category.name,
      icon: category.icon,
      color: category.color,
      kind: category.kind,
      reportGroup: category.reportGroup,
      isDefault: category.isDefault,
      isArchived: category.isArchived,
      sortOrder: category.sortOrder,
      subCategories: category.subcategories
        .filter(subcategory => !subcategory.isArchived)
        .map(subcategory => ({
          name: subcategory.name,
          isDefault: subcategory.isDefault,
          isArchived: subcategory.isArchived,
          sortOrder: subcategory.sortOrder,
          metadata: subcategory.metadata,
        })),
    }));
}

function classifyNeutral(normalized: string): FinanceClassificationSuggestion | null {
  if (includesAny(normalized, ['pago visa', 'pago mastercard', 'pago tarjeta', 'tarjeta credito'])) {
    return neutralSuggestion('credit_card_payment', 'Pago tarjeta credito', 0.95, 'El pago de tarjeta es neutro si los consumos ya fueron cargados.');
  }
  if (includesAny(normalized, ['transferencia entre cuentas', 'transferencia propia', 'a mi cuenta'])) {
    return neutralSuggestion('internal_transfer', 'Transferencia interna', 0.9, 'Mover plata entre cuentas propias no es gasto ni ingreso.');
  }
  if (includesAny(normalized, ['comprar dolares', 'compra dolares', 'comprar euros', 'cambio moneda'])) {
    return neutralSuggestion('currency_exchange', 'Cambio de moneda', 0.9, 'Comprar moneda cambia composicion patrimonial, no consumo.');
  }
  if (includesAny(normalized, ['inversion', 'broker', 'acciones', 'bonos', 'cripto', 'fci'])) {
    return neutralSuggestion('investment_movement', 'Movimiento inversion', 0.86, 'Invertir mueve patrimonio, no deberia contarse como gasto operativo.');
  }
  if (includesAny(normalized, ['prestamo recibido', 'me prestaron', 'devolvi prestamo'])) {
    return neutralSuggestion('loan_movement', 'Movimiento prestamo', 0.84, 'Un prestamo modifica deuda, no ingreso operativo.');
  }
  return null;
}

function neutralSuggestion(neutralType: NeutralType, subcategory: string, confidence: number, reason: string): FinanceClassificationSuggestion {
  return {
    kind: 'neutral',
    neutralType,
    category: 'Movimientos neutros',
    subcategory,
    confidence,
    reason,
  };
}

function category(
  id: string,
  name: string,
  kind: TransactionKind,
  sortOrder: number,
  icon: string,
  color: string,
  keywords: string[],
  subcategories: Omit<FinanceSubcategoryDefinition, 'categoryId' | 'isDefault' | 'isArchived' | 'sortOrder'>[],
  reportGroup?: string,
): FinanceCategoryDefinition {
  return {
    id,
    name,
    kind,
    reportGroup,
    isDefault: true,
    isArchived: false,
    sortOrder,
    icon,
    color,
    keywords,
    subcategories: subcategories.map((subcategory, index) => ({
      ...subcategory,
      categoryId: id,
      isDefault: true,
      isArchived: false,
      sortOrder: index + 1,
    })),
  };
}

function sub(id: string, name: string, keywords: string[], metadata?: FinanceSubcategoryDefinition['metadata']) {
  return { id, name, keywords, metadata };
}

function buildResult(
  input: string,
  suggestion: FinanceClassificationSuggestion,
  alternatives: FinanceClassificationSuggestion[],
  suggestedTags: string[],
  shouldCreateNewCategory = false,
  shouldCreateNewSubcategory = false,
): FinanceClassificationResult {
  return {
    input,
    suggestion,
    alternatives,
    suggestedTags,
    shouldCreateNewCategory,
    shouldCreateNewSubcategory,
  };
}

function scoreTerms(value: string, terms: string[]) {
  const tokens = new Set(value.split(' ').filter(Boolean));
  return terms.reduce((score, term) => {
    const normalizedTerm = normalizeFinanceText(term);
    if (!normalizedTerm) return score;
    const isPhrase = normalizedTerm.includes(' ');
    const isMatch = isPhrase ? value.includes(normalizedTerm) : tokens.has(normalizedTerm);
    return isMatch ? score + 0.18 : score;
  }, 0);
}

function findLearnedClassification(normalized: string, learnedMappings: any[]): FinanceClassificationResult | null {
  const inputKey = buildFinanceLearningKey(normalized);
  if (!inputKey) return null;

  const learned = learnedMappings
    .map(mapping => {
      const mappingKey = mapping.learningKey || buildFinanceLearningKey(mapping.originalDescription || mapping.mappedDescription || '');
      const merchantHit = mapping.merchantKey && normalized.includes(normalizeFinanceText(mapping.merchantKey));
      const keyHit = mappingKey && (inputKey.includes(mappingKey) || mappingKey.includes(inputKey));
      const textScore = getTokenOverlapScore(inputKey, mappingKey);
      return { mapping, score: merchantHit ? 1 : keyHit ? 0.92 : textScore };
    })
    .filter(item => item.score >= 0.55 && item.mapping.category)
    .sort((a, b) => b.score - a.score)[0];

  if (!learned) return null;

  return buildResult(normalized, {
    kind: learned.mapping.kind || learned.mapping.type || 'expense',
    neutralType: learned.mapping.neutralType,
    category: learned.mapping.category,
    subcategory: learned.mapping.subCategory || learned.mapping.subcategory || 'Otros',
    confidence: Math.min(0.98, 0.82 + (Number(learned.mapping.useCount || 0) * 0.02)),
    reason: 'Aprendido de una correccion anterior.',
  }, [], getSuggestedTags(normalized));
}

function getTokenOverlapScore(a: string, b: string) {
  if (!a || !b) return 0;
  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  let shared = 0;
  aTokens.forEach(token => {
    if (bTokens.has(token)) shared += 1;
  });
  return shared / Math.min(aTokens.size, bTokens.size);
}

function getSuggestedTags(normalized: string) {
  const tags = ['gato', 'perro', 'visa', 'mastercard', 'bbva', 'galicia', 'spotify', 'netflix', 'openai', 'roma', 'viaje']
    .filter(tag => normalized.includes(tag));
  return Array.from(new Set(tags)).slice(0, 5);
}

function includesAny(value: string, terms: string[]) {
  return terms.some(term => value.includes(normalizeFinanceText(term)));
}

function normalizeFinanceText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FINANCE_STOP_WORDS = new Set([
  'compra',
  'consumo',
  'pago',
  'gasto',
  'tarjeta',
  'visa',
  'mastercard',
  'credito',
  'debito',
  'con',
  'para',
  'del',
  'por',
  'los',
  'las',
  'una',
  'uno',
]);

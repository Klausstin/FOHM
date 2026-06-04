import type { TravelCategory, TravelContextSuggestion } from './travel.types';

const TRAVEL_DESTINATIONS = [
  { city: 'Roma', country: 'Italia', terms: ['roma', 'italia', 'rome', 'italy'] },
  { city: 'Paris', country: 'Francia', terms: ['paris', 'francia', 'france'] },
  { city: 'Madrid', country: 'Espana', terms: ['madrid', 'espana', 'españa', 'spain'] },
  { city: 'Barcelona', country: 'Espana', terms: ['barcelona'] },
  { city: 'Londres', country: 'Reino Unido', terms: ['londres', 'london'] },
  { city: 'Nueva York', country: 'Estados Unidos', terms: ['nueva york', 'new york', 'nyc'] },
];

const TRAVEL_CATEGORY_RULES: Array<{ category: TravelCategory; terms: string[]; description?: string }> = [
  { category: 'Comidas y salidas', terms: ['cena', 'almuerzo', 'desayuno', 'restaurant', 'restaurante', 'bar', 'cafe', 'café', 'comida', 'merienda'] },
  { category: 'Traslados locales', terms: ['uber', 'cabify', 'taxi', 'metro', 'bus', 'subte', 'colectivo', 'tren local', 'tranvia'] },
  { category: 'Pasajes', terms: ['vuelo', 'avion', 'avión', 'pasaje', 'pasajes', 'tren entre ciudades'] },
  { category: 'Alojamiento', terms: ['hotel', 'airbnb', 'alojamiento', 'hospedaje', 'estadia', 'estadía'] },
  { category: 'Experiencias y entradas', terms: ['museo', 'entrada', 'tour', 'excursion', 'excursión', 'experiencia', 'paseo'] },
  { category: 'Compras y ropa', terms: ['ropa', 'zapatilla', 'zapatillas', 'calzado', 'shopping', 'tienda', 'zapatos'] },
  { category: 'Supermercado y farmacia', terms: ['supermercado', 'carrefour', 'farmacia', 'mercado'] },
  { category: 'Conectividad', terms: ['sim', 'chip', 'roaming', 'internet'] },
  { category: 'Seguro / documentacion', terms: ['seguro', 'visa turismo', 'pasaporte', 'documentacion', 'documentación'] },
  { category: 'Comisiones e impuestos', terms: ['comision', 'comisión', 'impuesto', 'tax', 'fee'] },
];

export function inferTravelContext(input: string): TravelContextSuggestion | null {
  const normalized = normalizeTravelText(input);
  const destination = findDestination(normalized);
  if (!destination) return null;

  const category = inferTravelCategory(normalized);
  const destinationName = `${destination.city} / ${destination.country}`;
  return {
    city: destination.city,
    country: destination.country,
    destination: destinationName,
    travelTripName: destinationName,
    travelTripSuggestion: destinationName,
    travelCategory: category,
    description: buildTravelDescription(normalized, destination.city, category),
    confidence: category === 'Otros' ? 'medium' : 'high',
  };
}

function findDestination(normalized: string) {
  return TRAVEL_DESTINATIONS.find(destination =>
    destination.terms.some(term => normalized.includes(normalizeTravelText(term))),
  );
}

function inferTravelCategory(normalized: string): TravelCategory {
  const rule = TRAVEL_CATEGORY_RULES.find(item =>
    item.terms.some(term => normalized.includes(normalizeTravelText(term))),
  );
  return rule?.category || 'Otros';
}

function buildTravelDescription(normalized: string, city: string, category: TravelCategory) {
  if (category === 'Comidas y salidas') {
    if (normalized.includes('cena')) return `Cena en ${city}`;
    if (normalized.includes('almuerzo')) return `Almuerzo en ${city}`;
    if (normalized.includes('desayuno')) return `Desayuno en ${city}`;
    if (normalized.includes('cafe')) return `Cafe en ${city}`;
    return `Comida en ${city}`;
  }
  if (category === 'Traslados locales') return `Traslado local en ${city}`;
  if (category === 'Pasajes') return `Pasaje de viaje a ${city}`;
  if (category === 'Alojamiento') return `Alojamiento en ${city}`;
  if (category === 'Experiencias y entradas') return `Experiencia en ${city}`;
  if (category === 'Compras y ropa') return `Compra en ${city}`;
  return `Gasto de viaje en ${city}`;
}

export function normalizeTravelText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

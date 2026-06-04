export type TravelVisibility = 'private' | 'shared_with_partner' | 'household_shared';

export type TravelStatus = 'planned' | 'active' | 'finished';

export type TravelCategory =
  | 'Pasajes'
  | 'Alojamiento'
  | 'Comidas y salidas'
  | 'Traslados locales'
  | 'Experiencias y entradas'
  | 'Compras y ropa'
  | 'Supermercado y farmacia'
  | 'Conectividad'
  | 'Seguro / documentacion'
  | 'Comisiones e impuestos'
  | 'Imprevistos'
  | 'Otros';

export interface TravelTrip {
  id: string;
  uid: string;
  householdId: string;
  name: string;
  destination: string;
  country?: string;
  city?: string;
  startDate?: string;
  endDate?: string;
  members: string[];
  defaultCurrency: string;
  visibility: TravelVisibility;
  status: TravelStatus;
  createdAt?: any;
}

export interface TravelContextSuggestion {
  city?: string;
  country?: string;
  destination: string;
  travelTripName: string;
  travelTripSuggestion: string;
  travelCategory: TravelCategory;
  description?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface InflationPoint {
  date: string;
  index: number;
  monthlyRate: number | null;
}

export interface InflationSnapshot {
  sourceName: string;
  sourceUrl: string;
  seriesId: string;
  fetchedAt: string;
  latest: InflationPoint | null;
  points: InflationPoint[];
}

const IPC_NATIONAL_SERIES_ID = '148.3_INIVELNAL_DICI_M_26';
const IPC_API_URL = `https://apis.datos.gob.ar/series/api/series/?ids=${IPC_NATIONAL_SERIES_ID}&limit=24&format=json`;
const CACHE_KEY = 'veo.argentinaInflation.ipcNational';

export async function fetchArgentinaInflationSnapshot(): Promise<InflationSnapshot> {
  const response = await fetch(IPC_API_URL);
  if (!response.ok) throw new Error('No se pudo consultar el IPC oficial.');

  const payload = await response.json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const points = rows
    .map((row: any[]) => ({
      date: String(row[0]),
      index: Number(row[1]),
    }))
    .filter((row: { date: string; index: number }) => row.date && Number.isFinite(row.index))
    .map((row: { date: string; index: number }, index: number, all: { date: string; index: number }[]) => {
      const previous = all[index - 1];
      const monthlyRate = previous?.index ? row.index / previous.index - 1 : null;
      return { ...row, monthlyRate };
    });

  const snapshot = buildInflationSnapshot(points);
  cacheInflationSnapshot(snapshot);
  return snapshot;
}

export function getCachedArgentinaInflationSnapshot(): InflationSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) as InflationSnapshot : null;
  } catch {
    return null;
  }
}

export function cacheInflationSnapshot(snapshot: InflationSnapshot) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Cache is optional; projections still work without it.
  }
}

export function getLatestMonthlyInflationRate(snapshot: InflationSnapshot | null) {
  return snapshot?.latest?.monthlyRate ?? null;
}

function buildInflationSnapshot(points: InflationPoint[]): InflationSnapshot {
  return {
    sourceName: 'Datos Argentina / INDEC - IPC Nivel General Nacional',
    sourceUrl: IPC_API_URL,
    seriesId: IPC_NATIONAL_SERIES_ID,
    fetchedAt: new Date().toISOString(),
    latest: [...points].reverse().find(point => point.monthlyRate !== null) || null,
    points,
  };
}

export interface InflationAwareChange {
  label: string;
  previousNominal: number;
  currentNominal: number;
  inflationRate: number;
  previousInCurrentValue: number;
  nominalChange: number;
  realChange: number;
  nominalChangeRate: number | null;
  realChangeRate: number | null;
  interpretation: 'real_increase' | 'real_decrease' | 'stable' | 'insufficient_data';
  read: string;
}

export interface RealValueAdjustment {
  nominalAmount: number;
  realAmount: number;
  inflationMultiplier: number;
  source: 'index' | 'monthly_rate' | 'none';
}

export function compareNominalAndRealChange(
  label: string,
  previousNominal: number,
  currentNominal: number,
  inflationRate?: number | null,
): InflationAwareChange {
  if (!previousNominal || !currentNominal || inflationRate == null) {
    return {
      label,
      previousNominal,
      currentNominal,
      inflationRate: inflationRate ?? 0,
      previousInCurrentValue: previousNominal,
      nominalChange: currentNominal - previousNominal,
      realChange: currentNominal - previousNominal,
      nominalChangeRate: previousNominal ? currentNominal / previousNominal - 1 : null,
      realChangeRate: null,
      interpretation: 'insufficient_data',
      read: `Todavia falta inflacion o historial para leer ${label} en terminos reales.`,
    };
  }

  const previousInCurrentValue = previousNominal * (1 + inflationRate);
  const nominalChange = currentNominal - previousNominal;
  const realChange = currentNominal - previousInCurrentValue;
  const nominalChangeRate = previousNominal ? nominalChange / previousNominal : null;
  const realChangeRate = previousInCurrentValue ? realChange / previousInCurrentValue : null;
  const realChangeAbs = Math.abs(realChangeRate ?? 0);
  const interpretation = realChangeAbs < 0.015
    ? 'stable'
    : realChange > 0
      ? 'real_increase'
      : 'real_decrease';

  return {
    label,
    previousNominal,
    currentNominal,
    inflationRate,
    previousInCurrentValue,
    nominalChange,
    realChange,
    nominalChangeRate,
    realChangeRate,
    interpretation,
    read: buildRealChangeRead(label, nominalChange, realChange, interpretation),
  };
}

export function adjustNominalByInflation(
  nominalAmount: number,
  inflationMultiplier?: number | null,
): RealValueAdjustment {
  if (!inflationMultiplier || inflationMultiplier <= 0) {
    return {
      nominalAmount,
      realAmount: nominalAmount,
      inflationMultiplier: 1,
      source: 'none',
    };
  }

  return {
    nominalAmount,
    realAmount: nominalAmount * inflationMultiplier,
    inflationMultiplier,
    source: 'index',
  };
}

export function projectValueWithMonthlyInflation(
  currentValue: number,
  monthlyInflationRate: number | null | undefined,
  months: number,
) {
  if (!monthlyInflationRate || months <= 0) return currentValue;
  return currentValue * Math.pow(1 + monthlyInflationRate, months);
}

function buildRealChangeRead(
  label: string,
  nominalChange: number,
  realChange: number,
  interpretation: InflationAwareChange['interpretation'],
) {
  if (interpretation === 'insufficient_data') {
    return `Todavia falta data para separar la lectura nominal y real de ${label}.`;
  }

  const nominalDirection = nominalChange >= 0 ? 'subio' : 'bajo';
  if (interpretation === 'stable') {
    return `${label} ${nominalDirection} nominalmente, pero en terminos reales quedo casi igual.`;
  }

  if (interpretation === 'real_increase') {
    return `${label} subio incluso despues de ajustar por inflacion.`;
  }

  return `${label} puede haber subido nominalmente, pero bajo en terminos reales.`;
}

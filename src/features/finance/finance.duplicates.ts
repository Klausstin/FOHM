// Detección de movimientos duplicados (exacta y semántica).
// Extraído de FinanceTracker.tsx (Fase A del refactor).
import { format } from 'date-fns';
import type { DuplicateMatch, PendingTransaction } from './finance.importTypes';

export function findLikelyDuplicateReason(candidate: Partial<PendingTransaction>, existingTransactions: any[]) {
  return findLikelyDuplicateMatch(candidate, existingTransactions)?.reason || '';
}

export function findLikelyDuplicateMatch(candidate: Partial<PendingTransaction>, existingTransactions: any[]): DuplicateMatch | null {
  if (candidate.statementFingerprint) {
    const sameStatement = existingTransactions.find(transaction => transaction.statementFingerprint === candidate.statementFingerprint);
    if (sameStatement) {
      return {
        reason: 'Este resumen parece ya importado.',
        duplicateOfId: sameStatement.id,
      };
    }
  }

  if (candidate.transactionFingerprint) {
    const sameFingerprint = existingTransactions.find(transaction => transaction.transactionFingerprint === candidate.transactionFingerprint);
    if (sameFingerprint) {
      return {
        reason: 'Ya existe un movimiento identico.',
        duplicateOfId: sameFingerprint.id,
      };
    }
  }

  const candidateDate = toDayKey(candidate.date);
  const candidateAmount = Number(candidate.amount || 0);
  const candidateText = normalizeDuplicateText(candidate.description || '');
  if (!candidateDate || !candidateAmount || !candidateText) return null;

  const possibleDuplicate = existingTransactions.find(transaction => {
    const sameDay = toDayKey(transaction.date) === candidateDate;
    const sameAmount = Math.abs(Number(transaction.amount || 0) - candidateAmount) < 0.01;
    const sameText = normalizeDuplicateText(transaction.description || '') === candidateText;
    return sameDay && sameAmount && sameText;
  });

  if (possibleDuplicate) {
    return {
      reason: 'Coincide en fecha, importe y concepto con un movimiento existente.',
      duplicateOfId: possibleDuplicate.id,
    };
  }

  return findSemanticDuplicateMatch(candidate, existingTransactions);
}

export function findSemanticDuplicateReason(candidate: Partial<PendingTransaction>, existingTransactions: any[]) {
  return findSemanticDuplicateMatch(candidate, existingTransactions)?.reason || '';
}

export function findSemanticDuplicateMatch(candidate: Partial<PendingTransaction>, existingTransactions: any[]): DuplicateMatch | null {
  const candidateDate = getDateFromValue(candidate.date);
  const candidateAmount = Number(candidate.amount || 0);
  const candidateText = normalizeDuplicateText([
    candidate.description,
    candidate.originalDescription,
    candidate.merchantName,
    candidate.category,
    candidate.subCategory,
  ].filter(Boolean).join(' '));

  if (!candidateDate || !candidateAmount || !candidateText) return null;

  const semanticDuplicate = existingTransactions
    .map(transaction => {
    if (transaction.status === 'ignored') return false;
    if (transaction.statementFingerprint && transaction.statementFingerprint === candidate.statementFingerprint) return true;

    const existingDate = getDateFromValue(transaction.date);
    if (!existingDate) return false;

    const daysApart = Math.abs((candidateDate.getTime() - existingDate.getTime()) / 86400000);
    if (daysApart > 95) return false;

    const accountCompatible = areAccountsCompatibleForReconciliation(candidate, transaction);
    const merchantMatch = Boolean(
      candidate.merchantKey &&
      (
        transaction.merchantKey === candidate.merchantKey ||
        normalizeDuplicateText(transaction.merchant || '').includes(normalizeDuplicateText(candidate.merchantKey))
      ),
    );
    const textScore = getTextOverlapScore(
      candidateText,
      normalizeDuplicateText([
        transaction.description,
        transaction.note,
        transaction.merchantName,
        transaction.merchant,
        ...(Array.isArray(transaction.tags) ? transaction.tags : []),
        transaction.category,
        transaction.subCategory,
      ].filter(Boolean).join(' ')),
    );
    const amountMatch = areAmountsCompatibleAcrossCurrencies(candidate, transaction);
    const categoryMatch = normalizeDuplicateText(candidate.category || '') === normalizeDuplicateText(transaction.category || '') ||
      normalizeDuplicateText(candidate.subCategory || '') === normalizeDuplicateText(transaction.subCategory || '');
    const manualCandidate = transaction.source === 'manual' || transaction.source === 'catchup_estimate' || transaction.source === 'catchup_inferred';
    const meaningfulTextMatch = textScore >= 0.12;
    const highValueForeignCardMatch = amountMatch &&
      ['USD', 'EUR'].some(currency => currency === String(candidate.currency || '').toUpperCase() || currency === String(transaction.currency || '').toUpperCase()) &&
      Math.max(candidateAmount, Number(transaction.amount || 0), Number(transaction.originalAmount || 0)) >= 80;

    if (!manualCandidate || !accountCompatible || !amountMatch) return false;

    let score = 0;
    if (daysApart <= 45) score += 1;
    if (merchantMatch) score += 3;
    if (meaningfulTextMatch) score += 2;
    if (categoryMatch) score += 1;
    if (highValueForeignCardMatch) score += 2;

    return {
      transaction,
      score,
    };
  })
    .filter((item): item is { transaction: any; score: number } => Boolean(item) && typeof item !== 'boolean' && item.score >= 3)
    .sort((a, b) => b.score - a.score)[0]?.transaction;

  if (!semanticDuplicate) return null;

  return {
    reason: buildSemanticDuplicateReason(semanticDuplicate, candidate),
    duplicateOfId: semanticDuplicate.id,
  };
}

export function areAccountsCompatibleForReconciliation(candidate: Partial<PendingTransaction>, existing: any) {
  const candidateAccountId = candidate.sourceAccountId || candidate.accountId || '';
  const existingAccountId = existing.sourceAccountId || existing.accountId || '';
  if (candidateAccountId && existingAccountId && candidateAccountId === existingAccountId) return true;

  const candidateText = normalizeDuplicateText([
    candidate.accountName,
    candidate.description,
    candidate.originalDescription,
    candidate.importSource,
  ].filter(Boolean).join(' '));
  const existingText = normalizeDuplicateText([
    existing.accountName,
    existing.description,
    existing.note,
    existing.paymentType,
    existing.importSource,
  ].filter(Boolean).join(' '));

  const bothVisa = candidateText.includes('visa') && existingText.includes('visa');
  const bothMastercard = (candidateText.includes('master') || candidateText.includes('mc')) && (existingText.includes('master') || existingText.includes('mc'));
  const bothBbva = candidateText.includes('bbva') && existingText.includes('bbva');
  return Boolean(bothBbva && (bothVisa || bothMastercard));
}

export function buildSemanticDuplicateReason(existing: any, candidate: Partial<PendingTransaction>) {
  const existingDate = getDateFromValue(existing.date);
  const existingAmount = Number(existing.originalAmount || existing.amount || 0);
  const existingCurrency = String(existing.originalCurrency || existing.currency || '').toUpperCase();
  const candidateAmount = Number(candidate.amount || 0);
  const candidateCurrency = String(candidate.currency || '').toUpperCase();
  const amountDetail = existingCurrency && candidateCurrency && existingCurrency !== candidateCurrency
    ? ` (${existingAmount.toLocaleString()} ${existingCurrency} vs ${candidateAmount.toLocaleString()} ${candidateCurrency})`
    : '';
  const dateDetail = existingDate ? ` del ${format(existingDate, 'dd/MM/yyyy')}` : '';
  return `Parece el mismo gasto que ya cargaste con Luz${dateDetail}: "${existing.description || existing.category || 'movimiento manual'}"${amountDetail}. Conviene unirlo al existente si corresponde.`;
}

export function getDateFromValue(value: any) {
  if (!value) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getTextOverlapScore(a: string, b: string) {
  const ignored = new Set(['gasto', 'pago', 'compra', 'tarjeta', 'visa', 'bbva', 'usd', 'ars', 'eur', 'con', 'del', 'de', 'la', 'el', 'en', 'un', 'una']);
  const aTokens = new Set(a.split(' ').filter(token => token.length > 2 && !ignored.has(token)));
  const bTokens = new Set(b.split(' ').filter(token => token.length > 2 && !ignored.has(token)));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let shared = 0;
  aTokens.forEach(token => {
    if (bTokens.has(token)) shared += 1;
  });

  return shared / Math.min(aTokens.size, bTokens.size);
}

export function areAmountsCompatibleAcrossCurrencies(candidate: Partial<PendingTransaction>, existing: any) {
  const candidateAmount = Math.abs(Number(candidate.amount || 0));
  const existingAmounts = [
    Math.abs(Number(existing.amount || 0)),
    Math.abs(Number(existing.originalAmount || 0)),
    Math.abs(Number(existing.settlementAmount || 0)),
  ].filter(amount => Number.isFinite(amount) && amount > 0);
  const existingAmount = existingAmounts[0] || 0;
  if (!candidateAmount || !existingAmount) return false;

  const candidateCurrency = String(candidate.currency || '').toUpperCase();
  const existingCurrencies = [
    String(existing.currency || '').toUpperCase(),
    String(existing.originalCurrency || '').toUpperCase(),
    String(existing.settlementCurrency || '').toUpperCase(),
  ].filter(Boolean);

  for (const amount of existingAmounts) {
    for (const existingCurrency of existingCurrencies) {
      if (candidateCurrency && existingCurrency && candidateCurrency === existingCurrency) {
        if (Math.abs(candidateAmount - amount) / Math.max(candidateAmount, amount) <= 0.08) return true;
      }

      const foreignCardPair = new Set([candidateCurrency, existingCurrency]);
      if (foreignCardPair.has('EUR') && foreignCardPair.has('USD')) {
        const ratio = candidateAmount / amount;
        if (ratio >= 0.65 && ratio <= 1.45) return true;
      }
    }
  }

  return false;
}

export function toDayKey(value: any) {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function normalizeDuplicateText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0-9]{5,}/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCreditCardPaymentCategory(category?: string, subCategory?: string) {
  const text = normalizeDuplicateText(`${category || ''} ${subCategory || ''}`);
  return text.includes('movimientos neutros') && text.includes('pago tarjeta credito');
}

export function isInternalTransferCategory(category?: string, subCategory?: string) {
  const text = normalizeDuplicateText(`${category || ''} ${subCategory || ''}`);
  return text.includes('movimientos neutros') && (text.includes('transferencia interna') || text.includes('pago tarjeta credito'));
}

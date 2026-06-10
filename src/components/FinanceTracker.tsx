import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db, collection, addDoc, query, where, orderBy, onSnapshot, handleFirestoreError, OperationType, doc, updateDoc, getDocs, getDoc } from '../firebase.ts';
import { User } from 'firebase/auth';
import { 
  Wallet, Plus, FileText, TrendingUp, TrendingDown, PieChart, Upload, Trash2, Filter, Sparkles, AlertCircle, Check, X, Edit2, Save, Banknote, CreditCard, Briefcase,
  Utensils, ShoppingBag, Home, Bus, Car, Monitor, Coins, List, User as UserIcon, Tag, ChevronRight, ChevronDown, Calendar, ArrowUpRight, ArrowDownLeft, ArrowLeftRight
} from 'lucide-react';

const ICON_MAP: { [key: string]: any } = {
  Utensils, ShoppingBag, Home, Bus, Car, Monitor, Coins, TrendingUp, List, Banknote, User: UserIcon
};

const CategoriaIcon = ({ name, color, size = 18 }: { name: string, color?: string, size?: number }) => {
  const Icon = ICON_MAP[name] || Tag;
  return <Icon size={size} style={{ color: color || 'inherit' }} />;
};

import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { useDropzone } from 'react-dropzone';
import * as pdfjsLib from 'pdfjs-dist';
import { categorizeFinanceFromText, analyzeFinancialState } from '../services/gemini.ts';
import {
  applyTransactionToAccountBalances,
  createFinancialAccount,
  createFinancialTransaction,
  deleteFinancialAccount,
  deleteFinancialTransaction,
  reverseTransactionFromAccountBalances,
  shouldApplyTransactionToAccountBalances,
  subscribeToHouseholdFinancialAccounts,
  subscribeToHouseholdFinancialTransactions,
  updateFinancialAccount,
  updateFinancialTransaction,
} from '../features/finance/finance.service.ts';
import { buildCatchupEstimatedTransaction, estimateFinanceCatchupMinutes, getDaysSinceLastFinanceUpdate, shouldSuggestFinanceCatchup } from '../features/finance/finance.helpers.ts';
import { buildFinancialInsights } from '../features/finance/finance.insights.ts';
import { parseFinanceCsvText, parseFinanceStatementText } from '../features/finance/finance.import.ts';
import { findBestAccountForImportedTransaction, formatAccountBalance, getAccountBalanceDelta, getAccountReconciliationInfo } from '../features/finance/finance.accounts.ts';
import { fetchArgentinaInflationSnapshot, getCachedArgentinaInflationSnapshot, getLatestMonthlyInflationRate } from '../features/finance/argentinaInflation.ts';
import { buildFinanceLearningKey } from '../features/finance/finance.taxonomy.ts';
import { sanitizeFinanceCategories } from '../features/finance/finance.categorySanitizer.ts';
import { upsertFinanceLearningMapping } from '../features/finance/finance.learning.ts';
import type { CreateFinancialTransactionInput } from '../features/finance/finance.types.ts';

// Set up PDF.js worker using a more reliable CDN link
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

function buildPdfPageText(items: any[]) {
  const rows: { y: number; items: { x: number; text: string }[] }[] = [];

  for (const item of items) {
    const text = String(item.str || '').trim();
    if (!text) continue;
    const y = Math.round(item.transform?.[5] || 0);
    const x = Number(item.transform?.[4] || 0);
    const row = rows.find(candidate => Math.abs(candidate.y - y) <= 2);
    if (row) {
      row.items.push({ x, text });
    } else {
      rows.push({ y, items: [{ x, text }] });
    }
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map(row =>
      row.items
        .sort((a, b) => a.x - b.x)
        .map(item => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .join('\n');
}

interface DuplicateMatch {
  reason: string;
  duplicateOfId?: string;
}

function findLikelyDuplicateReason(candidate: Partial<PendingTransaction>, existingTransactions: any[]) {
  return findLikelyDuplicateMatch(candidate, existingTransactions)?.reason || '';
}

function findLikelyDuplicateMatch(candidate: Partial<PendingTransaction>, existingTransactions: any[]): DuplicateMatch | null {
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

function findSemanticDuplicateReason(candidate: Partial<PendingTransaction>, existingTransactions: any[]) {
  return findSemanticDuplicateMatch(candidate, existingTransactions)?.reason || '';
}

function findSemanticDuplicateMatch(candidate: Partial<PendingTransaction>, existingTransactions: any[]): DuplicateMatch | null {
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

function areAccountsCompatibleForReconciliation(candidate: Partial<PendingTransaction>, existing: any) {
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

function buildSemanticDuplicateReason(existing: any, candidate: Partial<PendingTransaction>) {
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

function getDateFromValue(value: any) {
  if (!value) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTextOverlapScore(a: string, b: string) {
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

function areAmountsCompatibleAcrossCurrencies(candidate: Partial<PendingTransaction>, existing: any) {
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

function toDayKey(value: any) {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function normalizeDuplicateText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0-9]{5,}/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function enrichImportedTransactionWithAccounts(transaction: any, accounts: any[]) {
  const sourceMatch = findBestAccountForImportedTransaction(transaction, accounts);
  const accountId = transaction.accountId || sourceMatch.account?.id || findSuggestedSourceAccount(transaction, accounts);
  const toAccountId = transaction.toAccountId || findSuggestedDestinationAccount(transaction, accounts);
  const needsAccountReview = transaction.type === 'transfer' ? !accountId || !toAccountId : !accountId;

  return {
    ...transaction,
    accountId,
    toAccountId,
    accountMatchConfidence: sourceMatch.confidence,
    accountMatchReason: sourceMatch.reason,
    needsReview: Boolean(transaction.needsReview || needsAccountReview || sourceMatch.confidence === 'low'),
  };
}

function buildStatementClosingSuggestion(
  statement: any,
  transactions: any[],
  fileName: string,
  accounts: any[],
): StatementClosingSuggestion | null {
  if (!statement || typeof statement.closingBalance !== 'number') return null;

  const accountId = transactions.find(transaction => transaction.accountId)?.accountId;
  if (!accountId) return null;

  const account = accounts.find(item => item.id === accountId);
  if (!account) return null;

  const closingBalance = Number(statement.closingBalance || 0);
  const targetBalance = account.type === 'credit_card' ? -Math.abs(closingBalance) : closingBalance;

  return {
    id: `${fileName}:${statement.statementFingerprint || statement.periodEnd || closingBalance}`,
    accountId,
    accountName: account.name,
    currency: statement.currency || account.currency || 'ARS',
    fileName,
    periodEnd: statement.periodEnd,
    closingBalance,
    targetBalance,
    statementLabel: statement.accountLabel,
  };
}

function findSuggestedSourceAccount(transaction: any, accounts: any[]) {
  if (transaction.importSource === 'bbva_visa') return findVisaCreditCardAccount(accounts)?.id || '';
  if (transaction.importSource === 'bbva_caja_ahorro_ars') return findCajaAhorroAccount(accounts)?.id || '';
  return '';
}

function findSuggestedDestinationAccount(transaction: any, accounts: any[]) {
  const text = normalizeDuplicateText(`${transaction.description || ''} ${transaction.subCategory || ''}`);
  if (transaction.type === 'transfer' && (text.includes('visa') || text.includes('master') || text.includes('mastercard') || text.includes('mc'))) {
    return findCreditCardAccountByText(accounts, text)?.id || '';
  }
  return '';
}

function findVisaCreditCardAccount(accounts: any[]) {
  return findCreditCardAccountByText(accounts, 'visa');
}

function findCreditCardAccountByText(accounts: any[], sourceText: string) {
  const wantsVisa = sourceText.includes('visa');
  const wantsMastercard = sourceText.includes('mastercard') || sourceText.includes('master') || sourceText.includes('mc');

  const exactMatch = accounts.find(account => {
    const text = normalizeDuplicateText(`${account.name || ''} ${account.type || ''} ${account.institution || ''} ${account.statementLabel || ''} ${account.accountNumberLast4 || ''} ${account.alias || ''}`);
    if (account.type !== 'credit_card') return false;
    if (wantsVisa) return text.includes('visa');
    if (wantsMastercard) return text.includes('mastercard') || text.includes('master') || text.includes('mc');
    return false;
  });

  if (exactMatch) return exactMatch;
  return wantsVisa || wantsMastercard ? undefined : accounts.find(account => account.type === 'credit_card');
}

function findCajaAhorroAccount(accounts: any[]) {
  const assetAccounts = accounts.filter(account => account.type !== 'credit_card');
  return assetAccounts.find(account => {
    const text = normalizeDuplicateText(`${account.name || ''} ${account.type || ''} ${account.currency || ''} ${account.institution || ''} ${account.statementLabel || ''} ${account.alias || ''} ${account.accountNumberLast4 || ''}`);
    return account.currency === 'ARS' && (text.includes('caja') || text.includes('ahorro') || text.includes('cuenta sueldo') || text.includes('bbva'));
  }) || assetAccounts.find(account => account.currency === 'ARS' && account.type === 'bank');
}

function pendingTransactionNeedsAccount(pt: Partial<PendingTransaction>) {
  if (isWalletHistoryPendingTransaction(pt)) return false;
  if (pt.type === 'transfer') return !pt.accountId || !pt.toAccountId;
  return !pt.accountId;
}

function canConfirmPendingTransaction(pt: PendingTransaction) {
  return !pt.duplicateReason && !pendingTransactionNeedsAccount(pt);
}

function getPendingCategoryType(category: string) {
  const normalizedCategory = normalizeDuplicateText(category || '');
  if (normalizedCategory.includes('ingreso')) return 'income';
  if (normalizedCategory.includes('transferencia') || normalizedCategory.includes('finanza')) return 'transfer';
  return 'expense';
}

function formatPendingDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-AR');
}

function isCsvFile(file: File) {
  return file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
}

function isCsvPendingTransaction(transaction: Partial<PendingTransaction>) {
  return transaction.importSource === 'generic_csv' || transaction.fileName?.toLowerCase().endsWith('.csv');
}

function isWalletHistoryPendingTransaction(transaction: Partial<PendingTransaction>) {
  return transaction.importSource === 'wallet_history' || transaction.importMode === 'historical_learning';
}

function shortFingerprint(value?: string) {
  if (!value) return '';
  return value.length > 18 ? `${value.slice(0, 18)}...` : value;
}

function getPendingImportNextStep(summary: {
  readyCount: number;
  duplicateCount: number;
  missingAccountCount: number;
  cardPaymentCount: number;
  walletHistoryCount?: number;
}) {
  if (summary.walletHistoryCount && summary.walletHistoryCount > 0) {
    return 'Detecte historial de Wallet. Sirve para aprendizaje y analisis historico: al guardarlo conserva el rastro original, pero no toca saldos reales.';
  }
  if (summary.duplicateCount > 0) {
    return 'Primero resolvemos duplicados: vinculalos si son el mismo gasto que ya cargaste, descartalos si el resumen ya estaba importado, o guardalos igual solo si fueron compras realmente separadas.';
  }
  if (summary.missingAccountCount > 0) {
    return 'Despues asignamos cuenta: elegi de donde salio cada grupo. Si es pago de tarjeta, VEO necesita origen y destino para no contarlo como gasto doble.';
  }
  if (summary.readyCount > 0) {
    return `Hay ${summary.readyCount} movimiento(s) listos. Podes guardarlos juntos y corregir categorias despues si hace falta; VEO aprende de esas correcciones.`;
  }
  if (summary.cardPaymentCount > 0) {
    return 'Los pagos de tarjeta se tratan como transferencias entre cuentas: sirven para saldos, pero no duplican los consumos.';
  }
  return 'No queda ninguna accion clara pendiente. Si algo no corresponde, limpialo y volve a importar.';
}

function applyLearnedFinanceMapping(transaction: any, mappings: any[]) {
  const originalText = normalizeDuplicateText(transaction.originalDescription || transaction.description || '');
  const learningKey = buildFinanceLearningKey(transaction.originalDescription || transaction.description || '');
  const merchantKey = transaction.merchantKey || '';
  const learnedMapping = mappings
    .map(mapping => {
    const mappingText = normalizeDuplicateText(mapping.originalDescription || '');
      const mappingLearningKey = mapping.learningKey || buildFinanceLearningKey(mapping.originalDescription || mapping.mappedDescription || '');
      const merchantMatch = merchantKey && mapping.merchantKey === merchantKey;
      const exactTextMatch = mappingText && mappingText === originalText;
      const learningMatch = learningKey && mappingLearningKey && (learningKey.includes(mappingLearningKey) || mappingLearningKey.includes(learningKey));
      return {
        mapping,
        score: merchantMatch ? 3 : exactTextMatch ? 2 : learningMatch ? 1 : 0,
      };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.mapping;

  if (!learnedMapping) return transaction;

  return {
    ...transaction,
    description: learnedMapping.mappedDescription || transaction.description,
    category: learnedMapping.category || transaction.category,
    subCategory: learnedMapping.subCategory || transaction.subCategory || '',
    subSubCategory: learnedMapping.subSubCategory || transaction.subSubCategory || '',
    isFixed: learnedMapping.isFixed ?? transaction.isFixed,
    accountId: transaction.accountId || learnedMapping.accountId || '',
    sourceAccountId: transaction.sourceAccountId || transaction.accountId || learnedMapping.sourceAccountId || learnedMapping.accountId || '',
    toAccountId: transaction.toAccountId || (transaction.type === 'transfer' ? learnedMapping.toAccountId || '' : ''),
    paymentType: transaction.paymentType && transaction.paymentType !== 'Otro' ? transaction.paymentType : learnedMapping.paymentType || transaction.paymentType,
    beneficiaryType: transaction.beneficiaryType || learnedMapping.beneficiaryType,
    beneficiaryLabel: transaction.beneficiaryLabel || learnedMapping.beneficiaryLabel,
    scope: transaction.scope || learnedMapping.scope,
    visibility: transaction.visibility || learnedMapping.visibility,
    merchantName: learnedMapping.merchantName || transaction.merchantName,
    merchantKey: learnedMapping.merchantKey || transaction.merchantKey,
  };
}

function isUnclearFinanceCategory(finance: any) {
  const category = normalizeDuplicateText(finance.category || '');
  const subCategory = normalizeDuplicateText(finance.subCategory || '');
  return (
    !category ||
    category === 'sin categorizar' ||
    category === 'sin categoria' ||
    category === 'otros' ||
    subCategory === 'otros' ||
    finance.confidence === 'inferred'
  );
}

function getFinanceCategoryClarityStats(finances: any[]) {
  const expenses = finances.filter(finance => finance.status !== 'ignored' && finance.type === 'expense');
  const unclear = expenses.filter(isUnclearFinanceCategory);
  const totalAmountByCurrency = new Map<string, number>();

  for (const finance of unclear) {
    const currency = finance.currency || 'ARS';
    totalAmountByCurrency.set(currency, (totalAmountByCurrency.get(currency) || 0) + Number(finance.amount || 0));
  }

  return {
    count: unclear.length,
    expenseCount: expenses.length,
    share: expenses.length ? unclear.length / expenses.length : 0,
    totalAmountByCurrency: Array.from(totalAmountByCurrency.entries())
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
  };
}

function buildFinanceCategoryGroups(finances: any[]) {
  const groups = new Map<string, any[]>();
  const candidates = finances.filter(finance => {
    if (finance.status === 'ignored' || finance.type !== 'expense') return false;
    return isUnclearFinanceCategory(finance);
  });

  for (const finance of candidates) {
    const key = finance.merchantKey || normalizeDuplicateText(finance.originalDescription || finance.description || '');
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), finance]);
  }

  return Array.from(groups.entries())
    .map(([key, items]) => {
      const amounts = items.map(item => Number(item.amount || 0)).filter(Number.isFinite);
      const first = items[0];
      return {
        key,
        label: first.merchantName || first.description || first.originalDescription || 'Movimiento similar',
        count: items.length,
        averageAmount: amounts.length ? amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length : 0,
        currency: first.currency || 'ARS',
        currentCategory: first.category || 'Sin categorizar',
        reason: getFinanceCategoryGroupReason(first),
        originalDescription: first.originalDescription || first.description || '',
        merchantName: first.merchantName || '',
        merchantKey: first.merchantKey || '',
        accountId: first.accountId || '',
        sourceAccountId: first.sourceAccountId || first.accountId || '',
        toAccountId: first.toAccountId || '',
        paymentType: first.paymentType || '',
        beneficiaryType: first.beneficiaryType || '',
        beneficiaryLabel: first.beneficiaryLabel || legacyBeneficiaryLabel(first),
        scope: first.scope || legacyScope(first),
        visibility: first.visibility || 'household_shared',
        transactionIds: items.map(item => item.id).filter(Boolean),
      };
    })
    .filter(group => group.count >= 2)
    .sort((a, b) => b.count - a.count || b.averageAmount - a.averageAmount)
    .slice(0, 6);
}

function getFinanceCategoryGroupReason(finance: any) {
  const category = normalizeDuplicateText(finance.category || '');
  const subCategory = normalizeDuplicateText(finance.subCategory || '');
  if (!category || category === 'sin categorizar' || category === 'sin categoria') return 'Sin categoria clara';
  if (category === 'otros' || subCategory === 'otros') return 'Cayo en Otros';
  if (finance.confidence === 'inferred') return 'Clasificacion inferida';
  return 'Revisar precision';
}

function buildPendingImportGroups(transactions: PendingTransaction[]): PendingImportGroup[] {
  const groups = new Map<string, PendingTransaction[]>();

  for (const transaction of transactions) {
    const key = getPendingImportGroupKey(transaction);
    groups.set(key, [...(groups.get(key) || []), transaction]);
  }

  return Array.from(groups.entries())
    .map(([key, items]) => {
      const first = items[0];
      const duplicateCount = items.filter(item => item.duplicateReason).length;
      const missingAccountCount = items.filter(pendingTransactionNeedsAccount).length;
      const kind: PendingImportGroup['kind'] = duplicateCount === items.length
        ? 'duplicate'
        : missingAccountCount > 0
          ? 'missing_account'
          : 'mixed_review';
      const totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const title = kind === 'duplicate'
        ? 'Posibles duplicados'
        : kind === 'missing_account'
          ? 'Falta cuenta'
          : 'Revisar similares';
      const detailParts = [
        first.category,
        first.subCategory,
        first.merchantName,
        first.fileName,
      ].filter(Boolean);

      return {
        key,
        kind,
        title,
        detail: detailParts.join(' / ') || first.description || first.originalDescription || 'Movimiento importado',
        count: items.length,
        totalAmount,
        currency: first.currency || 'ARS',
        category: first.category || '',
        subCategory: first.subCategory || '',
        type: first.type,
        transactionIds: items.map(item => item.id),
        sample: first,
        canBulkConfirm: items.every(canConfirmPendingTransaction),
      };
    })
    .filter(group => group.count > 1 || group.kind !== 'mixed_review')
    .sort((a, b) => {
      const priority = { duplicate: 0, missing_account: 1, mixed_review: 2 };
      return priority[a.kind] - priority[b.kind] || b.count - a.count || b.totalAmount - a.totalAmount;
    })
    .slice(0, 8);
}

function getPendingImportGroupKey(transaction: PendingTransaction) {
  if (transaction.duplicateReason) {
    const statementKey = transaction.statementFingerprint ? shortFingerprint(transaction.statementFingerprint) : '';
    return `duplicate:${statementKey || transaction.fileName || 'pdf'}:${transaction.category}:${transaction.subCategory || ''}`;
  }

  if (pendingTransactionNeedsAccount(transaction)) {
    return [
      'missing-account',
      transaction.type,
      transaction.currency || 'ARS',
      transaction.importSource || transaction.fileName || 'pdf',
      transaction.category || '',
      transaction.subCategory || '',
    ].join(':');
  }

  return [
    'review',
    transaction.type,
    transaction.currency || 'ARS',
    transaction.category || '',
    transaction.subCategory || '',
    transaction.merchantKey || normalizeDuplicateText(transaction.description || transaction.originalDescription || ''),
  ].join(':');
}

function buildAccountBalanceSummary(accounts: any[]) {
  const byCurrency = new Map<string, {
    currency: string;
    liquidity: number;
    creditCardDebt: number;
    investments: number;
    netWorth: number;
    accountCount: number;
  }>();

  for (const account of accounts || []) {
    const currency = account.currency || 'ARS';
    const current = byCurrency.get(currency) || {
      currency,
      liquidity: 0,
      creditCardDebt: 0,
      investments: 0,
      netWorth: 0,
      accountCount: 0,
    };
    const balance = Number(account.balance || 0);
    const type = String(account.type || '').toLowerCase();

    current.accountCount += 1;
    if (type === 'credit_card') {
      current.creditCardDebt += Math.min(balance, 0);
    } else if (type === 'investment') {
      current.investments += balance;
      current.netWorth += balance;
    } else {
      current.liquidity += balance;
      current.netWorth += balance;
    }

    if (type === 'credit_card') {
      current.netWorth += balance;
    }

    byCurrency.set(currency, current);
  }

  return Array.from(byCurrency.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

function buildAccountReconciliationQueue(accounts: any[]) {
  return (accounts || [])
    .map(account => ({
      account,
      reconciliation: getAccountReconciliationInfo(account),
    }))
    .filter(item => item.reconciliation.tone !== 'ok')
    .sort((a, b) => getReconciliationWeight(b.reconciliation.tone) - getReconciliationWeight(a.reconciliation.tone));
}

function getReconciliationWeight(tone: string) {
  if (tone === 'danger') return 4;
  if (tone === 'warn') return 3;
  if (tone === 'neutral') return 2;
  return 1;
}

function buildAccountActivityById(accounts: any[], finances: any[], pendingTransactions: PendingTransaction[] = []) {
  const entries = new Map<string, {
    movementCount: number;
    pendingCount: number;
    netActivity: number;
  }>();

  for (const account of accounts || []) {
    entries.set(account.id, {
      movementCount: 0,
      pendingCount: 0,
      netActivity: 0,
    });
  }

  for (const finance of finances || []) {
    const sourceAccountId = finance.accountId || finance.sourceAccountId || '';
    const destinationAccountId = finance.toAccountId || '';
    const touchedAccountIds = [sourceAccountId, destinationAccountId].filter(Boolean);
    const hasReviewFlag = finance.isConfirmed === false || finance.needsReview || finance.status === 'pending' || finance.duplicateReason;

    for (const accountId of touchedAccountIds) {
      const current = entries.get(accountId);
      if (current && hasReviewFlag) current.pendingCount += 1;
    }

    if (!finance.accountBalanceApplied) continue;

    const transactionDate = parseFinanceDateValue(finance.date);
    for (const account of accounts || []) {
      const reconciledAt = parseFinanceDateValue(account.lastReconciledAt);
      if (reconciledAt && transactionDate && transactionDate <= reconciledAt) continue;

      let delta = 0;
      if (sourceAccountId === account.id) {
        delta += getAccountBalanceDelta({
          accountType: account.type,
          transactionType: finance.type,
          amount: Number(finance.amount || 0),
          direction: 'source',
        });
      }
      if (finance.type === 'transfer' && destinationAccountId === account.id) {
        delta += getAccountBalanceDelta({
          accountType: account.type,
          transactionType: finance.type,
          amount: Number(finance.amount || 0),
          direction: 'destination',
        });
      }

      if (delta !== 0) {
        const current = entries.get(account.id);
        if (current) {
          current.netActivity += delta;
          current.movementCount += 1;
        }
      }
    }
  }

  for (const transaction of pendingTransactions || []) {
    const accountId = transaction.accountId || transaction.sourceAccountId || '';
    const current = accountId ? entries.get(accountId) : null;
    if (current) current.pendingCount += 1;
  }

  return entries;
}

type BalanceIntegrityIssueType =
  | 'missing_balance_application'
  | 'missing_account'
  | 'missing_transfer_destination'
  | 'applied_without_effect';

interface BalanceIntegrityIssue {
  id: string;
  type: BalanceIntegrityIssueType;
  finance: any;
  title: string;
  helper: string;
  canApplyBalance: boolean;
}

type FinanceDiagnosticTone = 'ok' | 'warn' | 'danger' | 'neutral';

interface FinanceDiagnosticItem {
  id: string;
  title: string;
  value: string;
  detail: string;
  tone: FinanceDiagnosticTone;
  priority: number;
  actionable: boolean;
}

interface MonthlyAccountUsage {
  accountId: string;
  accountName: string;
  accountType?: string;
  amount: number;
  currency: string;
  share: number;
}

function buildBalanceIntegrityIssues(finances: any[]) {
  return (finances || [])
    .map(finance => {
      const status = finance.status || 'posted';
      if (status === 'ignored') return null;

      const sourceAccountId = finance.sourceAccountId || finance.accountId || '';
      const toAccountId = finance.toAccountId || '';
      const type = finance.type || (finance.kind === 'income' ? 'income' : finance.kind === 'neutral' ? 'neutral' : 'expense');
      const shouldAffectBalance = shouldApplyTransactionToAccountBalances({
        ...finance,
        accountId: sourceAccountId,
        sourceAccountId,
        toAccountId,
        date: parseFinanceDateValue(finance.date) || new Date(),
      });

      if ((type === 'expense' || type === 'income') && !sourceAccountId && Number(finance.amount || 0) > 0) {
        return {
          id: `${finance.id}-missing-account`,
          type: 'missing_account' as const,
          finance,
          title: 'Movimiento sin cuenta usada',
          helper: 'Tiene monto y tipo financiero, pero no sabemos de que cuenta salio o entro.',
          canApplyBalance: false,
        };
      }

      if (type === 'transfer' && sourceAccountId && !toAccountId) {
        return {
          id: `${finance.id}-missing-transfer-destination`,
          type: 'missing_transfer_destination' as const,
          finance,
          title: 'Transferencia sin destino',
          helper: 'Para mover saldo entre cuentas, VEO necesita cuenta origen y cuenta destino.',
          canApplyBalance: false,
        };
      }

      if (shouldAffectBalance && !finance.accountBalanceApplied) {
        return {
          id: `${finance.id}-missing-balance-application`,
          type: 'missing_balance_application' as const,
          finance,
          title: 'No impacto el saldo',
          helper: 'El movimiento esta contabilizado, pero todavia no ajusto el saldo de la cuenta.',
          canApplyBalance: true,
        };
      }

      if (!shouldAffectBalance && finance.accountBalanceApplied) {
        return {
          id: `${finance.id}-applied-without-effect`,
          type: 'applied_without_effect' as const,
          finance,
          title: 'Saldo aplicado con regla dudosa',
          helper: 'El movimiento figura como aplicado, pero por sus datos actuales no deberia mover saldo.',
          canApplyBalance: false,
        };
      }

      return null;
    })
    .filter(Boolean) as BalanceIntegrityIssue[];
}

function buildFinanceDiagnosticItems({
  balanceIntegrityIssues,
  pendingTransactions,
  categoryClarityStats,
  categoryLearningGroups,
  accountReconciliationQueue,
  userMappings,
  finances,
  userAccounts,
}: {
  balanceIntegrityIssues: BalanceIntegrityIssue[];
  pendingTransactions: PendingTransaction[];
  categoryClarityStats: ReturnType<typeof getFinanceCategoryClarityStats>;
  categoryLearningGroups: any[];
  accountReconciliationQueue: any[];
  userMappings: any[];
  finances: any[];
  userAccounts: any[];
}): FinanceDiagnosticItem[] {
  const missingAccountIssues = balanceIntegrityIssues.filter(issue => issue.type === 'missing_account' || issue.type === 'missing_transfer_destination').length;
  const unappliedBalanceIssues = balanceIntegrityIssues.filter(issue => issue.type === 'missing_balance_application').length;
  const pendingReadyCount = pendingTransactions.filter(canConfirmPendingTransaction).length;
  const unclearShare = Math.round((categoryClarityStats.share || 0) * 100);
  const activeMovements = finances.filter(finance => finance.status !== 'ignored').length;

  const items: FinanceDiagnosticItem[] = [
    {
      id: 'balance-integrity',
      title: 'Saldos',
      value: String(balanceIntegrityIssues.length),
      detail: balanceIntegrityIssues.length
        ? `${unappliedBalanceIssues} sin impacto y ${missingAccountIssues} sin cuenta/destino.`
        : 'Sin alertas de saldo detectadas.',
      tone: missingAccountIssues > 0 ? 'danger' : balanceIntegrityIssues.length > 0 ? 'warn' : 'ok',
      priority: missingAccountIssues > 0 ? 100 : balanceIntegrityIssues.length > 0 ? 90 : 10,
      actionable: balanceIntegrityIssues.length > 0,
    },
    {
      id: 'pending-imports',
      title: 'Importaciones',
      value: String(pendingTransactions.length),
      detail: pendingTransactions.length
        ? `${pendingReadyCount} listos para guardar; el resto necesita revision.`
        : 'No hay borradores de resumen esperando.',
      tone: pendingTransactions.length > 0 ? 'warn' : 'ok',
      priority: pendingTransactions.length > 0 ? 80 : 10,
      actionable: pendingTransactions.length > 0,
    },
    {
      id: 'category-clarity',
      title: 'Categorias',
      value: `${categoryClarityStats.count}`,
      detail: categoryClarityStats.count
        ? `${unclearShare}% de gastos quedaron flojos o inferidos.`
        : 'Los gastos cargados tienen categoria clara.',
      tone: categoryClarityStats.count > 0 ? 'warn' : 'ok',
      priority: categoryClarityStats.count > 0 ? 70 : 10,
      actionable: categoryClarityStats.count > 0,
    },
    {
      id: 'category-learning',
      title: 'Patrones',
      value: String(categoryLearningGroups.length),
      detail: categoryLearningGroups.length
        ? 'Hay grupos similares que conviene resolver juntos.'
        : 'No hay grupos repetidos en Otros por ahora.',
      tone: categoryLearningGroups.length > 0 ? 'warn' : 'ok',
      priority: categoryLearningGroups.length > 0 ? 65 : 10,
      actionable: categoryLearningGroups.length > 0,
    },
    {
      id: 'accounts',
      title: 'Cuentas',
      value: String(accountReconciliationQueue.length),
      detail: accountReconciliationQueue.length
        ? `${accountReconciliationQueue.length} cuenta(s) piden conciliacion.`
        : `${userAccounts.length} cuenta(s) sin alertas de conciliacion.`,
      tone: accountReconciliationQueue.length > 0 ? 'warn' : 'ok',
      priority: accountReconciliationQueue.length > 0 ? 60 : 10,
      actionable: accountReconciliationQueue.length > 0,
    },
    {
      id: 'memory',
      title: 'Memoria',
      value: String(userMappings.length),
      detail: userMappings.length
        ? 'Aprendizajes activos para clasificar mejor.'
        : 'Todavia hay poca memoria aprendida.',
      tone: userMappings.length > 0 ? 'ok' : 'neutral',
      priority: userMappings.length > 0 ? 20 : 30,
      actionable: false,
    },
    {
      id: 'coverage',
      title: 'Datos',
      value: String(activeMovements),
      detail: activeMovements ? 'Movimientos utiles para analisis.' : 'Faltan movimientos reales para leer patrones.',
      tone: activeMovements > 0 ? 'ok' : 'neutral',
      priority: activeMovements > 0 ? 10 : 40,
      actionable: false,
    },
  ];

  return items.sort((a, b) => b.priority - a.priority);
}

function buildMonthlyAccountUsage(finances: any[], accounts: any[], month?: string, currency = 'ARS'): MonthlyAccountUsage | null {
  if (!month) return null;

  const accountById = new Map((accounts || []).map(account => [account.id, account]));
  const totals = new Map<string, number>();
  let total = 0;

  for (const finance of finances || []) {
    if (finance.status === 'ignored' || finance.type !== 'expense') continue;
    if ((finance.currency || 'ARS') !== currency) continue;

    const date = parseFinanceDateValue(finance.date);
    if (!date || format(date, 'yyyy-MM') !== month) continue;

    const accountId = finance.sourceAccountId || finance.accountId || '';
    if (!accountId) continue;

    const amount = Number(finance.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    totals.set(accountId, (totals.get(accountId) || 0) + amount);
    total += amount;
  }

  const [accountId, amount] = Array.from(totals.entries()).sort(([, a], [, b]) => b - a)[0] || [];
  if (!accountId || !amount) return null;

  const account = accountById.get(accountId);
  return {
    accountId,
    accountName: account?.name || 'Cuenta sin nombre',
    accountType: account?.type,
    amount,
    currency,
    share: total > 0 ? amount / total : 0,
  };
}

function parseFinanceDateValue(value: any) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatSignedMoney(value: number, currency: string) {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded.toLocaleString()} ${currency}`;
}

function getAccountTypeLabel(type?: string) {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'bank') return 'Banco';
  if (normalized === 'wallet') return 'Billetera';
  if (normalized === 'cash') return 'Efectivo';
  if (normalized === 'credit_card') return 'Tarjeta';
  if (normalized === 'investment') return 'Inversion';
  return normalized || 'Cuenta';
}

function getAccountHealthLabel(account: any) {
  const type = String(account.type || '').toLowerCase();
  const balance = Number(account.balance || 0);
  if (type === 'credit_card') {
    if (balance < 0) return 'Deuda abierta';
    if (balance === 0) return 'Sin deuda';
    return 'Saldo a favor';
  }
  if (type === 'investment') return 'Patrimonio';
  if (balance < 0) return 'Revisar saldo';
  return 'Disponible';
}

function createEmptyAccountDraft() {
  return {
    name: '',
    currency: 'ARS',
    balance: 0,
    color: '#3B82F6',
    type: 'bank',
    institution: '',
    accountNumberLast4: '',
    statementLabel: '',
    alias: '',
    closingDay: '',
    dueDay: '',
    creditLimit: '',
    notes: '',
  };
}

function cleanOptionalText(value: unknown) {
  const text = String(value || '').trim();
  return text || null;
}

function cleanOptionalNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanAccountDay(value: unknown) {
  const parsed = cleanOptionalNumber(value);
  if (!parsed) return null;
  return Math.min(31, Math.max(1, Math.round(parsed)));
}

function buildAccountPayload(draft: any) {
  const type = draft.type || 'bank';
  const isCreditCard = type === 'credit_card';

  return {
    name: String(draft.name || '').trim(),
    currency: draft.currency || 'ARS',
    balance: Number(draft.balance || 0),
    color: draft.color || '#3B82F6',
    type,
    institution: cleanOptionalText(draft.institution),
    accountNumberLast4: cleanOptionalText(draft.accountNumberLast4),
    statementLabel: cleanOptionalText(draft.statementLabel),
    alias: cleanOptionalText(draft.alias),
    closingDay: isCreditCard ? cleanAccountDay(draft.closingDay) : null,
    dueDay: isCreditCard ? cleanAccountDay(draft.dueDay) : null,
    creditLimit: isCreditCard ? cleanOptionalNumber(draft.creditLimit) : null,
    notes: cleanOptionalText(draft.notes),
  };
}

function buildBalanceAdjustmentNote(accountName: string, previousBalance: number, nextBalance: number, currency: string) {
  const difference = nextBalance - previousBalance;
  return [
    `Conciliacion manual de ${accountName}.`,
    `Saldo anterior: ${previousBalance.toLocaleString()} ${currency}.`,
    `Saldo real: ${nextBalance.toLocaleString()} ${currency}.`,
    `Diferencia ajustada: ${difference.toLocaleString()} ${currency}.`,
  ].join(' ');
}

const FINANCE_TYPES = [
  { id: 'expense', label: 'Gasto', icon: <TrendingDown size={14} />, color: 'text-red-600', bg: 'bg-red-50', activeClass: 'bg-red-500 text-white border-red-500 shadow-md' },
  { id: 'income', label: 'Ingreso', icon: <TrendingUp size={14} />, color: 'text-green-600', bg: 'bg-green-50', activeClass: 'bg-green-500 text-white border-green-500 shadow-md' },
  { id: 'transfer', label: 'Transferencia', icon: <PieChart size={14} />, color: 'text-yellow-600', bg: 'bg-yellow-50', activeClass: 'bg-yellow-500 text-white border-yellow-500 shadow-md' },
];

const CURRENCIES = ['ARS', 'USD', 'EUR', 'BRL', 'CLP', 'UYU'];
const PAYMENT_TYPES = ['Efectivo', 'Tarjeta de Débito', 'Tarjeta de credito', 'Transferencia', 'Mercado Pago', 'Otro'];
const PAYMENT_STATUSES = ['Contabilizado', 'Pendiente', 'Anulado'];
const FINANCE_BENEFICIARIES = [
  { type: 'family', label: 'Familia', scope: 'familia' },
  { type: 'household', label: 'Hogar', scope: 'hogar' },
  { type: 'couple', label: 'Pareja', scope: 'pareja' },
  { type: 'child', label: 'Máximo', scope: 'familia' },
  { type: 'user', label: 'Agustín', scope: 'personal' },
  { type: 'user', label: 'Vicky', scope: 'personal' },
  { type: 'other', label: 'Otro', scope: 'familia' },
];

function legacyBeneficiaryLabel(finance: any) {
  if (finance.assignedTo === 'Ambos') return 'Pareja';
  return finance.beneficiaryLabel || 'Familia';
}

function legacyScope(finance: any) {
  if (finance.assignedTo === 'Ambos') return 'pareja';
  return finance.scope || 'familia';
}

interface ParsedFinanceTrace {
  originalConcept?: string;
  transferDetail?: string;
  counterpartyName?: string;
  counterpartyAlias?: string;
  counterpartyAccount?: string;
  importedFile?: string;
  reconciliations: string[];
  otherLines: string[];
}

function parseFinanceTraceNote(note?: string): ParsedFinanceTrace {
  const trace: ParsedFinanceTrace = {
    reconciliations: [],
    otherLines: [],
  };

  String(note || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .forEach(line => {
      const [rawLabel, ...rest] = line.split(':');
      const label = rawLabel.trim().toLowerCase();
      const value = rest.join(':').trim();

      if (!value) {
        trace.otherLines.push(line);
        return;
      }

      if (label === 'concepto original') trace.originalConcept = value;
      else if (label === 'detalle transferencia') trace.transferDetail = value;
      else if (label === 'destinatario') trace.counterpartyName = value;
      else if (label === 'alias') trace.counterpartyAlias = value;
      else if (label === 'cbu/cvu') trace.counterpartyAccount = value;
      else if (label === 'archivo importado') trace.importedFile = value;
      else if (label.startsWith('conciliado con')) trace.reconciliations.push(line);
      else trace.otherLines.push(line);
    });

  return trace;
}

function hasFinanceTrace(trace: ParsedFinanceTrace, finance: any) {
  return Boolean(
    trace.originalConcept ||
    trace.transferDetail ||
    trace.counterpartyName ||
    trace.counterpartyAlias ||
    trace.counterpartyAccount ||
    trace.importedFile ||
    trace.reconciliations.length ||
    trace.otherLines.length ||
    finance.importSource ||
    finance.merchantName ||
    finance.merchant ||
    finance.duplicateOfId ||
    finance.duplicateReason ||
    finance.transactionFingerprint ||
    finance.statementFingerprint
  );
}

function getFinanceSearchText(finance: any, accounts: any[], members: any[]) {
  const sourceAccount = accounts.find(account => account.id === (finance.sourceAccountId || finance.accountId));
  const destinationAccount = accounts.find(account => account.id === finance.toAccountId);
  const generator = members.find(member => member.uid === finance.generatedBy || member.id === finance.generatedBy);
  const trace = parseFinanceTraceNote(finance.note);

  return [
    finance.description,
    finance.note,
    finance.category,
    finance.subCategory,
    finance.subSubCategory,
    finance.type,
    finance.currency,
    finance.amount,
    finance.paymentType,
    finance.paymentStatus,
    finance.source,
    finance.confidence,
    finance.importSource,
    finance.merchantName,
    finance.merchant,
    finance.merchantKey,
    finance.beneficiaryLabel,
    finance.scope,
    finance.originalDescription,
    finance.duplicateReason,
    sourceAccount?.name,
    sourceAccount?.currency,
    sourceAccount?.type,
    destinationAccount?.name,
    destinationAccount?.currency,
    destinationAccount?.type,
    generator?.displayName,
    generator?.email,
    trace.originalConcept,
    trace.transferDetail,
    trace.counterpartyName,
    trace.counterpartyAlias,
    trace.counterpartyAccount,
    trace.importedFile,
    ...trace.reconciliations,
    ...trace.otherLines,
    ...(Array.isArray(finance.tags) ? finance.tags : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

interface PendingTransaction {
  id: string;
  amount: number;
  currency?: string;
  description: string;
  category: string;
  subCategory?: string;
  subSubCategory?: string;
  type: string;
  accountId?: string;
  accountName?: string;
  sourceAccountId?: string;
  toAccountId?: string;
  date: string;
  isFixed: boolean;
  originalDescription: string;
  fileName: string;
  confidence: number;
  needsReview: boolean;
  merchantName?: string;
  merchantKey?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  counterpartyAlias?: string;
  transferDetail?: string;
  importSource?: string;
  importMode?: string;
  sourceAccountLabel?: string;
  sourceCategoryLabel?: string;
  statementAccountLabel?: string;
  tags?: string[];
  paymentType?: string;
  accountMatchConfidence?: string;
  accountMatchReason?: string;
  transactionFingerprint?: string;
  statementFingerprint?: string;
  duplicateOfId?: string;
  duplicateReason?: string;
}

interface WalletMemoryMappingImport {
  originalDescription: string;
  mappedDescription: string;
  category: string;
  subCategory?: string;
  kind?: string;
  merchantName?: string;
  merchantKey?: string;
  useCount?: number;
  confidence?: number;
}

interface StatementClosingSuggestion {
  id: string;
  accountId: string;
  accountName: string;
  currency: string;
  fileName: string;
  periodEnd?: string;
  closingBalance: number;
  targetBalance: number;
  statementLabel?: string;
}

interface PendingImportGroup {
  key: string;
  kind: 'duplicate' | 'missing_account' | 'mixed_review';
  title: string;
  detail: string;
  count: number;
  totalAmount: number;
  currency: string;
  category: string;
  subCategory?: string;
  type: string;
  transactionIds: string[];
  sample: PendingTransaction;
  canBulkConfirm: boolean;
}

export default function FinanceTracker({ user }: { user: any }) {
  const [finances, setFinances] = useState<any[]>([]);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('ARS');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategoria] = useState('');
  const [subSubCategory, setSubSubCategoria] = useState('');
  const [type, setType] = useState('expense');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [isFixed, setIsFijo] = useState(false);
  const [payer, setPayer] = useState('');
  const [beneficiaryType, setBeneficiaryType] = useState('family');
  const [beneficiaryLabel, setBeneficiaryLabel] = useState('Familia');
  const [scope, setScope] = useState('familia');
  const [paymentType, setPaymentType] = useState('Efectivo');
  const [paymentStatus, setPaymentStatus] = useState('Contabilizado');
  const [generatedBy, setGeneratedBy] = useState(user.uid);
  const [assignedTo, setAssignedTo] = useState(user.uid);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);
  const [userCategories, setUserCategories] = useState<any[]>([]);
  const [userMappings, setUserMappings] = useState<any[]>([]);
  const [userAccounts, setUserAccounts] = useState<any[]>([]);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [newAccount, setNewAccount] = useState(createEmptyAccountDraft());
  const [householdMembers, setHouseholdMembers] = useState<any[]>([]);
  const uniqueHouseholdMembers = useMemo(() => {
    const byIdentity = new Map<string, any>();
    const fallbackUser = {
      id: user.uid,
      uid: user.uid,
      displayName: user.displayName || user.email || 'Agustin',
      email: user.email || '',
    };

    [fallbackUser, ...(householdMembers || [])].forEach(member => {
      const uid = member.uid || member.id || member.email;
      if (!uid) return;
      const existing = byIdentity.get(uid);
      byIdentity.set(uid, {
        ...existing,
        ...member,
        uid,
        id: member.id || existing?.id || uid,
        displayName: member.displayName || existing?.displayName || member.email || existing?.email || 'Sin nombre',
        email: member.email || existing?.email || '',
      });
    });

    return Array.from(byIdentity.values()).sort((a, b) =>
      (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '', 'es'),
    );
  }, [householdMembers, user.displayName, user.email, user.uid]);
  const [showCatchupPrompt, setShowCatchupPrompt] = useState(false);
  const [showCatchupWizard, setShowCatchupWizard] = useState(false);
  const [catchupDraft, setCatchupDraft] = useState({
    accountId: '',
    amount: '',
    currency: 'ARS',
    description: '',
    category: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    estimatedReason: '',
  });
  const [isSavingCatchup, setIsSavingCatchup] = useState(false);
  const [inflationMonthlyRate, setInflationMonthlyRate] = useState<number | null>(null);
  const [lastImportResult, setLastImportResult] = useState<{
    saved: number;
    review: number;
    duplicates: number;
    missingAccount: number;
    files: number;
    statementClosings: StatementClosingSuggestion[];
  } | null>(null);
  const [walletMemoryPreview, setWalletMemoryPreview] = useState<WalletMemoryMappingImport[]>([]);
  const [walletMemoryStatus, setWalletMemoryStatus] = useState('');
  const [isApplyingWalletMemory, setIsApplyingWalletMemory] = useState(false);
  
  // Filtering states
  const [filterDateRange, setFilterDateRange] = useState('all'); // all, day, month, quarter, year, custom
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterAmountMin, setFilterAmountMin] = useState('');
  const [filterAmountMax, setFilterAmountMax] = useState('');
  const [filterGeneratedBy, setFilterGeneratedBy] = useState('all');
  const [filterAssignedTo, setFilterAssignedTo] = useState('all');
  const [filterBeneficiary, setFilterBeneficiary] = useState('all');
  const [filterScope, setFilterScope] = useState('all');
  const [filterAccount, setFilterAccount] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeListTab, setActiveListTab] = useState<'all' | 'reviews'>('all');
  const [showPendingImportDetails, setShowPendingImportDetails] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);

  const pendingImportSummary = useMemo(() => {
    const byFile = pendingTransactions.reduce<Record<string, number>>((acc, transaction) => {
      const fileName = transaction.fileName || 'Archivo';
      acc[fileName] = (acc[fileName] || 0) + 1;
      return acc;
    }, {});

    const readyCount = pendingTransactions.filter(canConfirmPendingTransaction).length;
    const duplicateCount = pendingTransactions.filter(transaction => transaction.duplicateReason).length;
    const missingAccountCount = pendingTransactions.filter(pendingTransactionNeedsAccount).length;
    const cardPaymentCount = pendingTransactions.filter(transaction => transaction.type === 'transfer' && transaction.subCategory === 'Pago de tarjeta').length;
    const usdCount = pendingTransactions.filter(transaction => transaction.currency === 'USD').length;
    const fixedCount = pendingTransactions.filter(transaction => transaction.isFixed).length;
    const walletHistoryCount = pendingTransactions.filter(isWalletHistoryPendingTransaction).length;

    return {
      byFile,
      readyCount,
      duplicateCount,
      missingAccountCount,
      cardPaymentCount,
      usdCount,
      fixedCount,
      walletHistoryCount,
    };
  }, [pendingTransactions]);
  const pendingImportGroups = useMemo(() => buildPendingImportGroups(pendingTransactions), [pendingTransactions]);
  const accountActivityById = useMemo(
    () => buildAccountActivityById(userAccounts, finances, pendingTransactions),
    [userAccounts, finances, pendingTransactions],
  );

  useEffect(() => {
    const cachedInflation = getCachedArgentinaInflationSnapshot();
    setInflationMonthlyRate(getLatestMonthlyInflationRate(cachedInflation));

    fetchArgentinaInflationSnapshot()
      .then(snapshot => setInflationMonthlyRate(getLatestMonthlyInflationRate(snapshot)))
      .catch(() => {
        // VEO keeps local projections if the official IPC source is not reachable.
      });
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToHouseholdFinancialTransactions(user.householdId, (data) => {
      setFinances(data);
      setShowCatchupPrompt(shouldSuggestFinanceCatchup(data));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'finances');
    });

    const unsubAccounts = subscribeToHouseholdFinancialAccounts(user.householdId, setUserAccounts, (error) => {
      handleFirestoreError(error, OperationType.GET, 'accounts');
    });

    return () => {
      unsubscribe();
      unsubAccounts();
    };
  }, [user.householdId]);

  useEffect(() => {
    // Fetch household members
    const qMembers = query(collection(db, 'users'), where('householdId', '==', user.householdId));
    const unsubMembers = onSnapshot(qMembers, (snap) => {
      setHouseholdMembers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    const qCats = query(collection(db, 'categories'), where('householdId', '==', user.householdId));
    const unsubCats = onSnapshot(qCats, (snap) => {
      setUserCategories(sanitizeFinanceCategories(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'categories');
    });

    const qMappings = query(collection(db, 'mappings'), where('householdId', '==', user.householdId));
    const unsubMappings = onSnapshot(qMappings, (snap) => {
      setUserMappings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'mappings');
    });

    const qAccounts = query(collection(db, 'accounts'), where('householdId', '==', user.householdId));
    const unsubAccounts = onSnapshot(qAccounts, (snap) => {
      setUserAccounts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'accounts');
    });

    return () => {
      unsubMembers();
      unsubCats();
      unsubMappings();
      unsubAccounts();
    };
  }, [user.householdId, user.uid]);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const accountPayload = buildAccountPayload(newAccount);
      if (editingAccount) {
        const previousBalance = Number(editingAccount.balance || 0);
        const nextBalance = Number(accountPayload.balance || 0);
        const balanceWasReconciled = Math.abs(previousBalance - nextBalance) >= 0.01;
        await updateFinancialAccount(editingAccount.id, {
          ...accountPayload,
          ...(balanceWasReconciled ? { lastReconciledAt: new Date() } : {}),
        });
        if (balanceWasReconciled) {
          await createFinancialTransaction({
            uid: user.uid,
            householdId: user.householdId,
            amount: Math.abs(nextBalance - previousBalance),
            currency: accountPayload.currency,
            description: `Ajuste de saldo - ${accountPayload.name}`,
            note: buildBalanceAdjustmentNote(accountPayload.name, previousBalance, nextBalance, accountPayload.currency),
            category: 'Movimientos neutros',
            subCategory: 'Ajuste de saldo',
            type: 'neutral',
            kind: 'neutral',
            neutralType: 'balance_adjustment',
            accountId: editingAccount.id,
            sourceAccountId: editingAccount.id,
            date: new Date(),
            source: 'manual',
            status: 'posted',
            confidence: 'exact',
            isConfirmed: true,
            accountBalanceApplied: true,
            paymentStatus: 'Contabilizado',
          });
        }
      } else {
        await createFinancialAccount({
          ...accountPayload,
          uid: user.uid,
          householdId: user.householdId,
          lastReconciledAt: new Date(),
        });
      }
      setIsAddingAccount(false);
      setEditingAccount(null);
      setNewAccount(createEmptyAccountDraft());
    } catch (error) {
      handleFirestoreError(error, editingAccount ? OperationType.UPDATE : OperationType.CREATE, 'accounts');
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta cuenta? Los registros asociados no se eliminarán, pero la cuenta ya no estará disponible.')) return;
    try {
      await deleteFinancialAccount(id);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'accounts');
    }
  };

  const handleReconcileStatementClosing = async (suggestion: StatementClosingSuggestion) => {
    const account = userAccounts.find(item => item.id === suggestion.accountId);
    if (!account) return;

    const previousBalance = Number(account.balance || 0);
    const nextBalance = Number(suggestion.targetBalance || 0);
    const difference = nextBalance - previousBalance;

    try {
      await updateFinancialAccount(account.id, {
        balance: nextBalance,
        lastReconciledAt: new Date(),
      } as any);

      if (Math.abs(difference) >= 0.01) {
        await createFinancialTransaction({
          uid: user.uid,
          householdId: user.householdId,
          amount: Math.abs(difference),
          currency: suggestion.currency,
          description: `Ajuste de cierre - ${account.name}`,
          note: buildBalanceAdjustmentNote(account.name, previousBalance, nextBalance, suggestion.currency),
          category: 'Movimientos neutros',
          subCategory: 'Ajuste de saldo',
          type: 'neutral',
          kind: 'neutral',
          neutralType: 'balance_adjustment',
          accountId: account.id,
          sourceAccountId: account.id,
          date: suggestion.periodEnd ? new Date(suggestion.periodEnd) : new Date(),
          source: 'pdf',
          status: 'posted',
          confidence: 'exact',
          isConfirmed: true,
          accountBalanceApplied: true,
          paymentStatus: 'Contabilizado',
          importSource: suggestion.fileName,
        });
      }

      setLastImportResult(prev => prev
        ? {
            ...prev,
            statementClosings: prev.statementClosings.filter(item => item.id !== suggestion.id),
          }
        : prev);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `accounts/${account.id}`);
    }
  };

  const startEditingAccount = (acc: any) => {
    setEditingAccount(acc);
    setNewAccount({
      name: acc.name || '',
      currency: acc.currency || 'ARS',
      balance: Number(acc.balance || 0),
      color: acc.color || '#3B82F6',
      type: acc.type || 'bank',
      institution: acc.institution || '',
      accountNumberLast4: acc.accountNumberLast4 || '',
      statementLabel: acc.statementLabel || '',
      alias: acc.alias || '',
      closingDay: acc.closingDay || '',
      dueDay: acc.dueDay || '',
      creditLimit: acc.creditLimit || '',
      notes: acc.notes || '',
    });
    setIsAddingAccount(true);
  };

  const handleSubmit = async (e?: React.FormEvent, keepFields = false) => {
    e?.preventDefault();
    if (!amount || !category) return;

    try {
      const transactionInput: CreateFinancialTransactionInput = {
        uid: user.uid,
        householdId: user.householdId,
        amount: parseFloat(amount),
        currency,
        description,
        note,
        category,
        subCategory,
        subSubCategory,
        type,
        accountId,
        sourceAccountId: accountId,
        toAccountId,
        tags,
        isFixed,
        date: new Date(date),
        source: 'manual',
        confidence: 'exact',
        status: paymentStatus === 'Pendiente' ? 'pending' : paymentStatus === 'Anulado' ? 'ignored' : 'posted',
        needsReview: false,
        reconciliationBatchId: null,
        estimatedReason: null,
        isConfirmed: true,
        createdByUserId: generatedBy || user.uid,
        generatedBy: generatedBy || user.uid,
        assignedTo: assignedTo || user.uid,
        payer,
        beneficiaryType: beneficiaryType as any,
        beneficiaryLabel,
        scope: scope as any,
        visibility: 'household_shared',
        paymentType,
        paymentStatus
      };

      const transactionRef = await createFinancialTransaction(transactionInput);
      const balanceApplied = await applyTransactionToAccountBalances(transactionInput);
      if (transactionRef?.id) {
        await updateFinancialTransaction(transactionRef.id, { accountBalanceApplied: balanceApplied } as any);
      }
      setAmount('');
      setDescription('');
      setNote('');
      setTags([]);
      
      if (!keepFields) {
        setCurrency('ARS');
        setCategory('');
        setSubCategoria('');
        setSubSubCategoria('');
        setAccountId('');
        setToAccountId('');
        setDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
        setIsFijo(false);
        setPayer('');
        setBeneficiaryType('family');
        setBeneficiaryLabel('Familia');
        setScope('familia');
        setPaymentType('Efectivo');
        setPaymentStatus('Contabilizado');
        setGeneratedBy(user.uid);
        setAssignedTo(user.uid);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'finances');
    }
  };

  const processPdf = async (file: File) => {
    const reader = new FileReader();
    return new Promise<{ transactions: PendingTransaction[]; statementClosings: StatementClosingSuggestion[] }>((resolve, reject) => {
      reader.onload = async () => {
        try {
          const typedarray = new Uint8Array(reader.result as ArrayBuffer);
          const pdf = await pdfjsLib.getDocument(typedarray).promise;
          let fullText = '';
          
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = buildPdfPageText(textContent.items as any[]);
            fullText += pageText + '\n';
          }

          const parsedStatement = parseFinanceStatementText(fullText, file.name);
          if (parsedStatement.transactions.length > 0) {
            const duplicateStatement = parsedStatement.statement?.statementFingerprint
              ? finances.some(finance => finance.statementFingerprint === parsedStatement.statement?.statementFingerprint)
              : false;
            const mapped = parsedStatement.transactions.map((transaction: any) => {
              const statementAwareTransaction = {
                ...transaction,
                statementAccountLabel: parsedStatement.statement?.accountLabel || '',
              };
              const learnedTransaction = applyLearnedFinanceMapping(statementAwareTransaction, userMappings);
              const enrichedTransaction = enrichImportedTransactionWithAccounts(learnedTransaction, userAccounts);
              const duplicateMatch = duplicateStatement
                ? { reason: 'Este resumen parece ya importado.', duplicateOfId: undefined }
                : findLikelyDuplicateMatch(enrichedTransaction, finances);
              return {
                ...enrichedTransaction,
                id: Math.random().toString(36).substr(2, 9),
                originalDescription: enrichedTransaction.description,
                fileName: file.name,
                duplicateReason: duplicateMatch?.reason || '',
                duplicateOfId: duplicateMatch?.duplicateOfId || '',
                needsReview: enrichedTransaction.needsReview || duplicateStatement || Boolean(duplicateMatch?.reason),
              };
            });
            resolve({
              transactions: mapped,
              statementClosings: [
                buildStatementClosingSuggestion(parsedStatement.statement, mapped, file.name, userAccounts),
              ].filter(Boolean) as StatementClosingSuggestion[],
            });
            return;
          }

          const transactions = await categorizeFinanceFromText(fullText, userMappings);
          
          if (!Array.isArray(transactions)) {
            throw new Error("La IA no devolvió una lista de transacciones válida.");
          }

          const mapped = transactions.map((t: any) => {
            const learnedTransaction = applyLearnedFinanceMapping(t, userMappings);
            const enrichedTransaction = enrichImportedTransactionWithAccounts(learnedTransaction, userAccounts);
            const duplicateMatch = findLikelyDuplicateMatch(enrichedTransaction, finances);
            return {
              ...enrichedTransaction,
              id: Math.random().toString(36).substr(2, 9),
              originalDescription: enrichedTransaction.description,
              fileName: file.name,
              confidence: enrichedTransaction.confidence || 0,
              duplicateReason: duplicateMatch?.reason || '',
              duplicateOfId: duplicateMatch?.duplicateOfId || '',
              needsReview: enrichedTransaction.needsReview || Boolean(duplicateMatch?.reason),
            };
          });
          resolve({ transactions: mapped, statementClosings: [] });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const processCsv = async (file: File) => {
    const text = await file.text();
    const parsedStatement = parseFinanceCsvText(text, file.name);
    const duplicateStatement = parsedStatement.statement?.statementFingerprint
      ? finances.some(finance => finance.statementFingerprint === parsedStatement.statement?.statementFingerprint)
      : false;

    const mapped = parsedStatement.transactions.map((transaction: any) => {
      const statementAwareTransaction = {
        ...transaction,
        statementAccountLabel: parsedStatement.statement?.accountLabel || file.name,
      };
      const learnedTransaction = applyLearnedFinanceMapping(statementAwareTransaction, userMappings);
      const enrichedTransaction = enrichImportedTransactionWithAccounts(learnedTransaction, userAccounts);
      const duplicateMatch = duplicateStatement
        ? { reason: 'Este CSV parece ya importado.', duplicateOfId: undefined }
        : findLikelyDuplicateMatch(enrichedTransaction, finances);
      return {
        ...enrichedTransaction,
        id: Math.random().toString(36).substr(2, 9),
        originalDescription: enrichedTransaction.description,
        fileName: file.name,
        statementAccountLabel: enrichedTransaction.sourceAccountLabel || parsedStatement.statement?.accountLabel || file.name,
        confidence: enrichedTransaction.confidence || 0,
        duplicateReason: duplicateMatch?.reason || '',
        duplicateOfId: duplicateMatch?.duplicateOfId || '',
        needsReview: true,
      };
    });

    return {
      transactions: mapped,
      statementClosings: [] as StatementClosingSuggestion[],
    };
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setIsProcessingPdf(true);
    try {
      const allPending: PendingTransaction[] = [];
      const statementClosings: StatementClosingSuggestion[] = [];
      for (const file of acceptedFiles) {
        const fileResult = isCsvFile(file) ? await processCsv(file) : await processPdf(file);
        allPending.push(...fileResult.transactions);
        statementClosings.push(...fileResult.statementClosings);
      }
      const reviewTransactions = allPending.filter(transaction =>
        isCsvPendingTransaction(transaction) ||
        transaction.duplicateReason ||
        pendingTransactionNeedsAccount(transaction)
      );
      const readyTransactions = allPending.filter(transaction =>
        !isCsvPendingTransaction(transaction) &&
        !transaction.duplicateReason &&
        !pendingTransactionNeedsAccount(transaction)
      );

      for (const transaction of readyTransactions) {
        await confirmTransaction(transaction);
      }

      setPendingTransactions(prev => [...prev, ...reviewTransactions]);
      setLastImportResult({
        saved: readyTransactions.length,
        review: reviewTransactions.length,
        duplicates: reviewTransactions.filter(transaction => transaction.duplicateReason).length,
        missingAccount: reviewTransactions.filter(pendingTransactionNeedsAccount).length,
        files: acceptedFiles.length,
        statementClosings,
      });
    } catch (error) {
      console.error("Error processing finance imports:", error);
      alert("No pude procesar algunos archivos. Probemos de nuevo o revisemos el formato.");
    } finally {
      setIsProcessingPdf(false);
    }
  }, [user.uid, userMappings, userAccounts, finances]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: {
      'application/pdf': ['.pdf'],
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
    },
    multiple: true
  });

  const confirmTransaction = async (pt: PendingTransaction) => {
    try {
      const transactionInput: CreateFinancialTransactionInput = {
        uid: user.uid,
        householdId: user.householdId,
        amount: pt.amount,
        currency: pt.currency || currency,
        description: pt.description,
        note: buildPendingTransactionNote(pt),
        category: pt.category,
        subCategory: pt.subCategory || '',
        subSubCategory: pt.subSubCategory || '',
        type: pt.type,
        accountId: pt.accountId || '',
        sourceAccountId: pt.accountId || '',
        toAccountId: pt.toAccountId || '',
        tags: [
          isWalletHistoryPendingTransaction(pt) ? 'wallet-history' : isCsvPendingTransaction(pt) ? 'csv' : 'pdf',
          ...(Array.isArray(pt.tags) ? pt.tags : []),
          ...(pt.type === 'transfer' && pt.subCategory === 'Pago de tarjeta' ? ['pago-tarjeta'] : []),
        ].filter(Boolean),
        isFixed: pt.isFixed,
        date: new Date(pt.date),
        source: isCsvPendingTransaction(pt) ? 'csv' : 'pdf',
        isConfirmed: true,
        generatedBy: user.uid,
        assignedTo: user.uid,
        createdByUserId: user.uid,
        beneficiaryType: 'household',
        beneficiaryLabel: 'Hogar',
        scope: 'hogar',
        visibility: 'household_shared',
        confidence: pt.confidence >= 0.9 ? 'exact' : pt.confidence >= 0.7 ? 'estimated' : 'inferred',
        status: 'posted',
        needsReview: false,
        estimatedReason: null,
        reconciliationBatchId: null,
        paymentStatus: isWalletHistoryPendingTransaction(pt) ? 'Historico' : 'Contabilizado',
        merchantName: pt.merchantName || '',
        merchantKey: pt.merchantKey || '',
        importSource: pt.importSource || pt.fileName,
        transactionFingerprint: pt.transactionFingerprint || '',
        statementFingerprint: pt.statementFingerprint || '',
        duplicateReason: pt.duplicateReason || '',
        accountBalanceApplied: false,
      };

      const transactionRef = await createFinancialTransaction(transactionInput);
      const balanceApplied = isWalletHistoryPendingTransaction(pt)
        ? false
        : await applyTransactionToAccountBalances(transactionInput);
      if (transactionRef?.id) {
        await updateFinancialTransaction(transactionRef.id, { accountBalanceApplied: balanceApplied } as any);
      }

      await upsertFinanceLearningMapping({
        uid: user.uid,
        householdId: user.householdId,
        originalDescription: pt.originalDescription || pt.description,
        mappedDescription: pt.description,
        category: pt.category,
        subCategory: pt.subCategory || '',
        subSubCategory: pt.subSubCategory || '',
        kind: pt.type === 'transfer' ? 'neutral' : pt.type as any,
        isFixed: pt.isFixed,
        accountId: pt.accountId || '',
        sourceAccountId: pt.accountId || '',
        toAccountId: pt.toAccountId || '',
        paymentType: pt.type === 'transfer' ? 'Transferencia' : '',
        beneficiaryType: transactionInput.beneficiaryType,
        beneficiaryLabel: transactionInput.beneficiaryLabel,
        scope: transactionInput.scope,
        visibility: transactionInput.visibility,
        merchantName: pt.merchantName || '',
        merchantKey: pt.merchantKey || '',
        transactionFingerprint: pt.transactionFingerprint || '',
      }, userMappings);

      setPendingTransactions(prev => prev.filter(t => t.id !== pt.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'finances');
    }
  };

  const buildPendingTransactionNote = (pt: PendingTransaction) => {
    const lines = [
      pt.originalDescription ? `Concepto original: ${pt.originalDescription}` : '',
      pt.importMode === 'historical_learning' ? 'Modo importacion: historial para aprendizaje' : '',
      pt.sourceAccountLabel ? `Cuenta original: ${pt.sourceAccountLabel}` : '',
      pt.sourceCategoryLabel ? `Categoria original: ${pt.sourceCategoryLabel}` : '',
      pt.transferDetail && pt.transferDetail !== pt.originalDescription ? `Detalle transferencia: ${pt.transferDetail}` : '',
      pt.counterpartyName ? `Destinatario: ${pt.counterpartyName}` : '',
      pt.counterpartyAlias ? `Alias: ${pt.counterpartyAlias}` : '',
      pt.counterpartyAccount ? `CBU/CVU: ${pt.counterpartyAccount}` : '',
      pt.fileName ? `Archivo importado: ${pt.fileName}` : '',
    ].filter(Boolean);

    return lines.join('\n');
  };

  const handleWalletMemoryPreviewFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const candidates = Array.isArray(parsed)
        ? parsed.filter(isValidWalletMemoryCandidate).slice(0, 200)
        : [];

      if (candidates.length === 0) {
        setWalletMemoryPreview([]);
        setWalletMemoryStatus('No encontre candidatos validos en ese archivo.');
        return;
      }

      setWalletMemoryPreview(candidates);
      setWalletMemoryStatus(`Listos para activar: ${candidates.length} aprendizaje(s).`);
    } catch {
      setWalletMemoryPreview([]);
      setWalletMemoryStatus('No pude leer el JSON de candidatos Wallet.');
    }
  };

  const activateWalletMemoryPreview = async () => {
    if (walletMemoryPreview.length === 0 || isApplyingWalletMemory) return;

    setIsApplyingWalletMemory(true);
    setWalletMemoryStatus('Activando memoria Wallet...');

    try {
      for (const candidate of walletMemoryPreview) {
        await upsertFinanceLearningMapping({
          uid: user.uid,
          householdId: user.householdId,
          originalDescription: candidate.originalDescription,
          mappedDescription: candidate.mappedDescription,
          category: candidate.category,
          subCategory: candidate.subCategory || '',
          kind: 'expense',
          isFixed: Number(candidate.useCount || 0) >= 3,
          merchantName: candidate.merchantName || candidate.mappedDescription,
          merchantKey: candidate.merchantKey || '',
          scope: 'familia',
          visibility: 'household_shared',
          useCount: Number(candidate.useCount || 1),
        }, userMappings);
      }

      setWalletMemoryStatus(`Memoria Wallet activada: ${walletMemoryPreview.length} aprendizaje(s).`);
      setWalletMemoryPreview([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'mappings');
      setWalletMemoryStatus('No pude activar la memoria Wallet. Revisemos permisos o conexion.');
    } finally {
      setIsApplyingWalletMemory(false);
    }
  };

  const isValidWalletMemoryCandidate = (candidate: any): candidate is WalletMemoryMappingImport => (
    candidate &&
    typeof candidate.originalDescription === 'string' &&
    typeof candidate.mappedDescription === 'string' &&
    typeof candidate.category === 'string' &&
    candidate.originalDescription.trim().length > 0 &&
    candidate.mappedDescription.trim().length > 0 &&
    candidate.category.trim().length > 0
  );

  const linkPendingDuplicateToExisting = async (pt: PendingTransaction) => {
    if (!pt.duplicateOfId) return;

    try {
      const existing = finances.find(finance => finance.id === pt.duplicateOfId);
      const linkedTags = Array.from(new Set([
        ...(Array.isArray(existing?.tags) ? existing.tags : []),
        'conciliado-pdf',
        pt.importSource || 'pdf',
      ].filter(Boolean)));
      const existingNote = existing?.note || '';
      const reconciliationNote = `Conciliado con ${pt.fileName || pt.importSource || 'PDF'}: ${pt.originalDescription || pt.description}`;

      await updateFinancialTransaction(pt.duplicateOfId, {
        tags: linkedTags,
        note: existingNote.includes(reconciliationNote)
          ? existingNote
          : [existingNote, reconciliationNote].filter(Boolean).join('\n'),
        merchantName: existing?.merchantName || pt.merchantName || '',
        merchantKey: existing?.merchantKey || pt.merchantKey || '',
        merchant: existing?.merchant || pt.merchantName || '',
        importSource: existing?.importSource || pt.importSource || pt.fileName || '',
        transactionFingerprint: existing?.transactionFingerprint || pt.transactionFingerprint || '',
        statementFingerprint: existing?.statementFingerprint || pt.statementFingerprint || '',
        originalAmount: existing?.originalAmount || pt.amount,
        originalCurrency: existing?.originalCurrency || pt.currency || currency,
        settlementAmount: existing?.settlementAmount || pt.amount,
        settlementCurrency: existing?.settlementCurrency || pt.currency || currency,
        duplicateReason: '',
        needsReview: false,
        isConfirmed: true,
      } as any);

      setPendingTransactions(prev => prev.filter(transaction => transaction.id !== pt.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `finances/${pt.duplicateOfId}`);
    }
  };

  const updatePending = (id: string, updates: Partial<PendingTransaction>) => {
    setPendingTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const confirmReadyPendingTransactions = async () => {
    const readyTransactions = pendingTransactions.filter(canConfirmPendingTransaction);
    for (const transaction of readyTransactions) {
      await confirmTransaction(transaction);
    }
  };

  const applyAccountToPendingGroup = (group: PendingImportGroup, accountId: string, toAccountId?: string) => {
    if (!accountId) return;
    const ids = new Set(group.transactionIds);
    setPendingTransactions(prev => prev.map(transaction => {
      if (!ids.has(transaction.id)) return transaction;
      return {
        ...transaction,
        accountId,
        toAccountId: transaction.type === 'transfer' ? (toAccountId || transaction.toAccountId || '') : transaction.toAccountId,
      };
    }));
  };

  const applyCategoryToPendingGroup = (
    group: PendingImportGroup,
    updates: { category: string; subCategory?: string; subSubCategory?: string; isFixed?: boolean },
  ) => {
    if (!updates.category) return;
    const ids = new Set(group.transactionIds);
    setPendingTransactions(prev => prev.map(transaction => {
      if (!ids.has(transaction.id)) return transaction;
      const nextType = getPendingCategoryType(updates.category);
      return {
        ...transaction,
        category: updates.category,
        subCategory: updates.subCategory || '',
        subSubCategory: updates.subSubCategory || '',
        type: nextType,
        isFixed: Boolean(updates.isFixed),
        toAccountId: nextType === 'transfer' ? transaction.toAccountId : '',
      };
    }));
  };

  const discardPendingGroup = (group: PendingImportGroup) => {
    const ids = new Set(group.transactionIds);
    setPendingTransactions(prev => prev.filter(transaction => !ids.has(transaction.id)));
  };

  const linkPendingDuplicateGroup = async (group: PendingImportGroup) => {
    const ids = new Set(group.transactionIds);
    const groupTransactions = pendingTransactions.filter(transaction => ids.has(transaction.id) && transaction.duplicateOfId);

    for (const transaction of groupTransactions) {
      await linkPendingDuplicateToExisting(transaction);
    }
  };

  const confirmPendingGroup = async (group: PendingImportGroup, forceDuplicates = false) => {
    const ids = new Set(group.transactionIds);
    const groupTransactions = pendingTransactions
      .filter(transaction => ids.has(transaction.id))
      .map(transaction => forceDuplicates ? { ...transaction, duplicateReason: '' } : transaction)
      .filter(canConfirmPendingTransaction);

    for (const transaction of groupTransactions) {
      await confirmTransaction(transaction);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Seguro que queres eliminar este movimiento?')) return;
    try {
      const existingTransaction = finances.find(finance => finance.id === id);
      if (existingTransaction?.accountBalanceApplied) {
        await reverseTransactionFromAccountBalances(existingTransaction);
      }
      await deleteFinancialTransaction(id);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'finances');
    }
  };

  const startEditing = (f: any) => {
    setEditingId(f.id);
    setEditForm({
      ...f,
      originalCategory: f.category,
      originalSubCategory: f.subCategory || '',
      originalSubSubCategory: f.subSubCategory || '',
      originalAccountId: f.accountId || '',
      originalSourceAccountId: f.sourceAccountId || '',
      originalToAccountId: f.toAccountId || '',
      originalPaymentType: f.paymentType || '',
      originalBeneficiaryLabel: f.beneficiaryLabel || legacyBeneficiaryLabel(f),
      originalScope: f.scope || legacyScope(f),
      date: format(f.date.toDate(), "yyyy-MM-dd'T'HH:mm"),
    });
  };

  const saveEdit = async () => {
    if (!editingId || !editForm) return;
    try {
      const { amount, currency, description, note, category, subCategory, subSubCategory, type, accountId, sourceAccountId, toAccountId, tags, isFixed, date, generatedBy, assignedTo, payer, beneficiaryType, beneficiaryId, beneficiaryLabel, scope, visibility, paymentType, paymentStatus, isConfirmed, originalDescription, originalCategory, originalSubCategory, originalSubSubCategory, originalAccountId, originalSourceAccountId, originalToAccountId, originalPaymentType, originalBeneficiaryLabel, originalScope, merchantName, merchantKey } = editForm;
      const existingTransaction = finances.find(finance => finance.id === editingId);
      if (existingTransaction?.accountBalanceApplied) {
        await reverseTransactionFromAccountBalances(existingTransaction);
      }

      const updatedStatus = paymentStatus === 'Pendiente' ? 'pending' : paymentStatus === 'Anulado' ? 'ignored' : editForm.status || 'posted';
      const updatedTransaction = {
        amount: parseFloat(amount),
        currency,
        description,
        note,
        category,
        subCategory,
        subSubCategory: subSubCategory || '',
        type,
        accountId,
        sourceAccountId: sourceAccountId || accountId || '',
        toAccountId: toAccountId || null,
        tags,
        isFixed,
        date: new Date(date),
        generatedBy,
        assignedTo,
        payer,
        createdByUserId: editForm.createdByUserId || generatedBy || user.uid,
        beneficiaryType: beneficiaryType || 'household',
        beneficiaryId: beneficiaryId || '',
        beneficiaryLabel: beneficiaryLabel || 'Hogar',
        scope: scope || 'familia',
        visibility: visibility || 'household_shared',
        paymentType,
        paymentStatus,
        status: updatedStatus,
        isConfirmed: true, // Mark as confirmed when edited/saved
        needsReview: false,
        accountBalanceApplied: false,
      };

      await updateFinancialTransaction(editingId, updatedTransaction as any);

      const balanceApplied = await applyTransactionToAccountBalances({
        uid: existingTransaction?.uid || user.uid,
        householdId: existingTransaction?.householdId || user.householdId,
        ...updatedTransaction,
      } as CreateFinancialTransactionInput);
      await updateFinancialTransaction(editingId, { accountBalanceApplied: balanceApplied } as any);

      // If it was an AI transaction and the user corrected it, update mappings
      const categoryChanged = category !== originalCategory || (subCategory || '') !== (originalSubCategory || '') || (subSubCategory || '') !== (originalSubSubCategory || '');
      const contextChanged =
        (accountId || '') !== (originalAccountId || '') ||
        (sourceAccountId || '') !== (originalSourceAccountId || '') ||
        (toAccountId || '') !== (originalToAccountId || '') ||
        (paymentType || '') !== (originalPaymentType || '') ||
        (beneficiaryLabel || '') !== (originalBeneficiaryLabel || '') ||
        (scope || '') !== (originalScope || '');
      if ((originalDescription || description || merchantKey) && (categoryChanged || contextChanged)) {
        const normalizedOriginal = normalizeDuplicateText(originalDescription || description || '');
        await upsertFinanceLearningMapping({
          uid: user.uid,
          householdId: user.householdId,
          originalDescription: originalDescription || description,
          mappedDescription: description || originalDescription,
          category,
          subCategory: subCategory || '',
          subSubCategory: subSubCategory || '',
          kind: type === 'transfer' ? 'neutral' : type,
          isFixed,
          accountId: accountId || '',
          sourceAccountId: sourceAccountId || accountId || '',
          toAccountId: toAccountId || '',
          paymentType: paymentType || '',
          beneficiaryType: beneficiaryType || '',
          beneficiaryLabel: beneficiaryLabel || '',
          scope: scope || '',
          visibility: visibility || 'household_shared',
          merchantName: merchantName || '',
          merchantKey: merchantKey || '',
        }, userMappings);

        const similarFinances = finances.filter(finance => {
          if (finance.id === editingId) return false;
          const sameMerchant = merchantKey && finance.merchantKey === merchantKey;
          const sameOriginal = normalizedOriginal && normalizeDuplicateText(finance.originalDescription || finance.description || '') === normalizedOriginal;
          const stillUsingOldCategory = (finance.category || '') === (originalCategory || '') || finance.category === 'Sin categorizar';
          return (sameMerchant || sameOriginal) && stillUsingOldCategory;
        });

        await Promise.all(
          similarFinances.map(finance =>
            updateFinancialTransaction(finance.id, {
              category,
              subCategory: subCategory || '',
              subSubCategory: subSubCategory || '',
              isFixed,
            } as any),
          ),
        );
      }

      setEditingId(null);
      setEditForm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'finances');
    }
  };

  const filteredFinances = finances.filter(f => {
    const fDate = f.date.toDate();
    const now = new Date();
    
    // Review Filter
    if (activeListTab === 'reviews' && f.isConfirmed !== false && !f.needsReview) return false;

    // Date Filter
    if (filterDateRange === 'day') {
      if (format(fDate, 'yyyy-MM-dd') !== format(now, 'yyyy-MM-dd')) return false;
    } else if (filterDateRange === 'month') {
      if (format(fDate, 'yyyy-MM') !== format(now, 'yyyy-MM')) return false;
    } else if (filterDateRange === 'quarter') {
      const fQuarter = Math.floor(fDate.getMonth() / 3);
      const nowQuarter = Math.floor(now.getMonth() / 3);
      if (fQuarter !== nowQuarter || fDate.getFullYear() !== now.getFullYear()) return false;
    } else if (filterDateRange === 'year') {
      if (fDate.getFullYear() !== now.getFullYear()) return false;
    } else if (filterDateRange === 'custom') {
      if (customStartDate && fDate < new Date(customStartDate)) return false;
      if (customEndDate && fDate > new Date(customEndDate)) return false;
    }

    // Categoria Filter
    if (filterCategory !== 'all' && f.category !== filterCategory) return false;

    // Amount Filter
    if (filterAmountMin && f.amount < parseFloat(filterAmountMin)) return false;
    if (filterAmountMax && f.amount > parseFloat(filterAmountMax)) return false;

    // Person Filters
    if (filterGeneratedBy !== 'all' && f.generatedBy !== filterGeneratedBy) return false;
    if (filterAssignedTo !== 'all' && f.assignedTo !== filterAssignedTo) return false;
    if (filterBeneficiary !== 'all' && (f.beneficiaryLabel || legacyBeneficiaryLabel(f)) !== filterBeneficiary) return false;
    if (filterScope !== 'all' && (f.scope || legacyScope(f)) !== filterScope) return false;
    if (filterAccount !== 'all' && (f.sourceAccountId || f.accountId) !== filterAccount && f.toAccountId !== filterAccount) return false;

    // Search Query
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      if (!getFinanceSearchText(f, userAccounts, uniqueHouseholdMembers).includes(searchLower)) return false;
    }

    return true;
  });

  const runAnalysis = async () => {
    if (finances.length === 0) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeFinancialState(finances.slice(0, 50));
      setAnalysisResult(result);
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const openCatchupWizard = () => {
    setCatchupDraft({
      accountId: userAccounts[0]?.id || '',
      amount: '',
      currency: userAccounts[0]?.currency || 'ARS',
      description: '',
      category: userCategories[0]?.name || 'Sin categoria',
      date: format(new Date(), 'yyyy-MM-dd'),
      estimatedReason: '',
    });
    setShowCatchupWizard(true);
  };

  const handleSaveCatchupEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catchupDraft.amount || !catchupDraft.description || !catchupDraft.category || !catchupDraft.estimatedReason) return;

    const amountValue = parseFloat(catchupDraft.amount);
    if (Number.isNaN(amountValue) || amountValue <= 0) return;

    const reconciliationBatchId = `catchup-${user.uid}-${Date.now()}`;
    const transaction = buildCatchupEstimatedTransaction({
      uid: user.uid,
      householdId: user.householdId,
      accountId: catchupDraft.accountId,
      amount: amountValue,
      currency: catchupDraft.currency,
      description: catchupDraft.description,
      category: catchupDraft.category,
      date: new Date(`${catchupDraft.date}T12:00:00`),
      estimatedReason: catchupDraft.estimatedReason,
      reconciliationBatchId,
    });

    setIsSavingCatchup(true);
    try {
      const transactionRef = await createFinancialTransaction(transaction);
      const balanceApplied = await applyTransactionToAccountBalances(transaction);
      if (transactionRef?.id) {
        await updateFinancialTransaction(transactionRef.id, { accountBalanceApplied: balanceApplied } as any);
      }
      setShowCatchupWizard(false);
      setShowCatchupPrompt(false);
      setCatchupDraft({
        accountId: '',
        amount: '',
        currency: 'ARS',
        description: '',
        category: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        estimatedReason: '',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'finances');
    } finally {
      setIsSavingCatchup(false);
    }
  };

  const accountBalanceSummary = useMemo(() => buildAccountBalanceSummary(userAccounts), [userAccounts]);
  const primaryBalanceSummary = accountBalanceSummary.find(item => item.currency === 'ARS') || accountBalanceSummary[0];
  const accountReconciliationQueue = useMemo(() => buildAccountReconciliationQueue(userAccounts), [userAccounts]);
  const balanceIntegrityIssues = useMemo(() => buildBalanceIntegrityIssues(finances), [finances]);

  const reviewCount = finances.filter(f => f.isConfirmed === false || f.needsReview).length;
  const reviewFinances = finances.filter(f => f.isConfirmed === false || f.needsReview);
  const estimatedReviewFinances = reviewFinances.filter(f => f.source === 'catchup_estimate' || f.confidence === 'estimated' || f.confidence === 'inferred');
  const financialInsights = useMemo(() => buildFinancialInsights(finances, inflationMonthlyRate), [finances, inflationMonthlyRate]);
  const monthlyAccountUsage = useMemo(
    () => buildMonthlyAccountUsage(finances, userAccounts, financialInsights.periodDashboard.month, financialInsights.periodDashboard.currency),
    [finances, userAccounts, financialInsights.periodDashboard.month, financialInsights.periodDashboard.currency],
  );
  const categoryClarityStats = useMemo(() => getFinanceCategoryClarityStats(finances), [finances]);
  const categoryLearningGroups = useMemo(() => buildFinanceCategoryGroups(finances), [finances]);
  const financeDiagnosticItems = useMemo(() => buildFinanceDiagnosticItems({
    balanceIntegrityIssues,
    pendingTransactions,
    categoryClarityStats,
    categoryLearningGroups,
    accountReconciliationQueue,
    userMappings,
    finances,
    userAccounts,
  }), [
    balanceIntegrityIssues,
    pendingTransactions,
    categoryClarityStats,
    categoryLearningGroups,
    accountReconciliationQueue,
    userMappings,
    finances,
    userAccounts,
  ]);
  const daysSinceLastUpdate = getDaysSinceLastFinanceUpdate(finances);

  const openFinanceEdit = (finance: any, tab: 'all' | 'reviews' = 'reviews') => {
    const financeDate = parseFinanceDateValue(finance.date) || new Date();
    setEditingId(finance.id);
    setEditForm({
      ...finance,
      originalCategory: finance.category,
      originalSubCategory: finance.subCategory || '',
      originalSubSubCategory: finance.subSubCategory || '',
      originalAccountId: finance.accountId || '',
      originalSourceAccountId: finance.sourceAccountId || '',
      originalToAccountId: finance.toAccountId || '',
      originalPaymentType: finance.paymentType || '',
      originalBeneficiaryLabel: finance.beneficiaryLabel || legacyBeneficiaryLabel(finance),
      originalScope: finance.scope || legacyScope(finance),
      date: format(financeDate, "yyyy-MM-dd'T'HH:mm"),
    });
    setActiveListTab(tab);
  };

  const handleApplyMissingBalance = async (finance: any) => {
    try {
      const balanceApplied = await applyTransactionToAccountBalances({
        uid: finance.uid || user.uid,
        householdId: finance.householdId || user.householdId,
        amount: Number(finance.amount || 0),
        currency: finance.currency || 'ARS',
        description: finance.description || '',
        category: finance.category || 'Sin categoria',
        subCategory: finance.subCategory || '',
        subSubCategory: finance.subSubCategory || '',
        type: finance.type || 'expense',
        kind: finance.kind,
        neutralType: finance.neutralType,
        accountId: finance.sourceAccountId || finance.accountId || '',
        sourceAccountId: finance.sourceAccountId || finance.accountId || '',
        toAccountId: finance.toAccountId || '',
        date: parseFinanceDateValue(finance.date) || new Date(),
        status: finance.status || 'posted',
        source: finance.source || 'manual',
      } as any);

      await updateFinancialTransaction(finance.id, {
        accountBalanceApplied: balanceApplied,
        needsReview: balanceApplied ? false : finance.needsReview,
        paymentStatus: balanceApplied ? 'Contabilizado' : finance.paymentStatus,
      } as any);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `finances/${finance.id}`);
    }
  };

  const handleConfirmReviewedFinance = async (finance: any) => {
    try {
      let balanceApplied = Boolean(finance.accountBalanceApplied);
      if (finance.accountId && !finance.accountBalanceApplied) {
        balanceApplied = await applyTransactionToAccountBalances({
          uid: finance.uid || user.uid,
          householdId: finance.householdId || user.householdId,
          amount: Number(finance.amount || 0),
          currency: finance.currency || 'ARS',
          description: finance.description || '',
          category: finance.category || 'Sin categoria',
          type: finance.type || 'expense',
          accountId: finance.accountId || '',
          toAccountId: finance.toAccountId || '',
          date: typeof finance.date?.toDate === 'function' ? finance.date.toDate() : new Date(finance.date),
          status: 'posted',
        } as any);
      }
      await updateFinancialTransaction(finance.id, {
        status: 'posted',
        confidence: finance.confidence === 'inferred' ? 'estimated' : (finance.confidence || 'estimated'),
        needsReview: false,
        isConfirmed: true,
        paymentStatus: 'Contabilizado',
        accountBalanceApplied: balanceApplied,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `finances/${finance.id}`);
    }
  };

  const handleResolveReviewedFinance = async (finance: any, accountId?: string, toAccountId?: string) => {
    try {
      const resolvedAccountId = accountId ?? finance.accountId ?? '';
      const resolvedToAccountId = toAccountId ?? finance.toAccountId ?? '';
      let balanceApplied = Boolean(finance.accountBalanceApplied);
      if (resolvedAccountId && !finance.accountBalanceApplied) {
        balanceApplied = await applyTransactionToAccountBalances({
          uid: finance.uid || user.uid,
          householdId: finance.householdId || user.householdId,
          amount: Number(finance.amount || 0),
          currency: finance.currency || 'ARS',
          description: finance.description || '',
          category: finance.category || 'Sin categoria',
          type: finance.type || 'expense',
          accountId: resolvedAccountId,
          toAccountId: resolvedToAccountId,
          date: typeof finance.date?.toDate === 'function' ? finance.date.toDate() : new Date(finance.date),
          status: 'posted',
        } as any);
      }
      await updateFinancialTransaction(finance.id, {
        accountId: resolvedAccountId,
        toAccountId: resolvedToAccountId,
        status: 'posted',
        confidence: finance.confidence === 'inferred' ? 'estimated' : (finance.confidence || 'estimated'),
        needsReview: false,
        isConfirmed: true,
        paymentStatus: 'Contabilizado',
        accountBalanceApplied: balanceApplied,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `finances/${finance.id}`);
    }
  };

  const handleIgnoreReviewedFinance = async (finance: any) => {
    const confirmed = window.confirm('Ignorar este movimiento supuesto? No se borra, pero deja de contar como pendiente.');
    if (!confirmed) return;

    try {
      await updateFinancialTransaction(finance.id, {
        status: 'ignored',
        needsReview: false,
        isConfirmed: false,
        paymentStatus: 'Anulado',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `finances/${finance.id}`);
    }
  };

  const handleMarkRecurringAsFixed = async (insight: any) => {
    if (!insight?.transactionIds?.length) return;

    try {
      await Promise.all(
        insight.transactionIds.map((transactionId: string) =>
          updateFinancialTransaction(transactionId, {
            isFixed: true,
            needsReview: false,
          } as any),
        ),
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'finances');
    }
  };

  const handleApplyCategoryToGroup = async (group: any, draft: {
    category: string;
    subCategory: string;
    subSubCategory: string;
    isFixed: boolean;
    accountId: string;
    toAccountId: string;
    paymentType: string;
    beneficiaryType: string;
    beneficiaryLabel: string;
    scope: string;
    visibility: string;
  }) => {
    if (!group.transactionIds?.length) return;
    const hasChanges = Boolean(
      draft.category ||
      draft.subCategory ||
      draft.subSubCategory ||
      draft.accountId ||
      draft.toAccountId ||
      draft.paymentType ||
      draft.beneficiaryLabel ||
      draft.scope ||
      draft.isFixed,
    );
    if (!hasChanges) return;

    try {
      await upsertFinanceLearningMapping({
        uid: user.uid,
        householdId: user.householdId,
        originalDescription: group.originalDescription || group.label,
        mappedDescription: group.label,
        category: draft.category || group.currentCategory || '',
        subCategory: draft.subCategory || '',
        subSubCategory: draft.subSubCategory || '',
        kind: 'expense',
        isFixed: draft.isFixed,
        accountId: draft.accountId || '',
        sourceAccountId: draft.accountId || '',
        toAccountId: draft.toAccountId || '',
        paymentType: draft.paymentType || '',
        beneficiaryType: draft.beneficiaryType || '',
        beneficiaryLabel: draft.beneficiaryLabel || '',
        scope: draft.scope || '',
        visibility: draft.visibility || '',
        merchantName: group.merchantName || '',
        merchantKey: group.merchantKey || '',
      }, userMappings);

      await Promise.all(
        group.transactionIds.map((transactionId: string) => {
          const patch: any = {
            needsReview: false,
          };
          if (draft.category) patch.category = draft.category;
          if (draft.subCategory || draft.category) patch.subCategory = draft.subCategory || '';
          if (draft.subSubCategory || draft.subCategory || draft.category) patch.subSubCategory = draft.subSubCategory || '';
          if (draft.accountId) {
            patch.accountId = draft.accountId;
            patch.sourceAccountId = draft.accountId;
          }
          if (draft.toAccountId) patch.toAccountId = draft.toAccountId;
          if (draft.paymentType) patch.paymentType = draft.paymentType;
          if (draft.beneficiaryLabel) {
            patch.beneficiaryType = draft.beneficiaryType || 'household';
            patch.beneficiaryLabel = draft.beneficiaryLabel;
          }
          if (draft.scope) patch.scope = draft.scope;
          if (draft.visibility) patch.visibility = draft.visibility;
          if (draft.isFixed) patch.isFixed = true;

          return updateFinancialTransaction(transactionId, patch);
        }),
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'finances');
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Decidi mejor</p>
          <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Finanzas</h2>
          <p className="text-neutral-500 font-medium">Entende donde esta tu plata y si tus gastos sostienen la vida que queres construir.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsAddingAccount(true)}
            className="flex items-center gap-2 bg-white text-neutral-900 border border-neutral-200 px-4 py-2 rounded-xl font-bold hover:bg-neutral-50 transition-all shadow-sm"
          >
            <Plus size={18} />
            Nueva cuenta
          </button>
          <button
            onClick={runAnalysis}
            disabled={isAnalyzing}
            className="flex items-center gap-2 bg-neutral-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-200 disabled:opacity-50"
          >
            {isAnalyzing ? <Sparkles className="animate-spin" size={18} /> : <Sparkles size={18} />}
            Analizar finanzas
          </button>
        </div>
      </header>

      {showCatchupPrompt && (
        <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="bg-amber-400 text-neutral-900 p-3 rounded-2xl">
              <AlertCircle size={22} />
            </div>
            <div>
              <h3 className="font-black text-neutral-900">Puesta al dia recomendada</h3>
              <p className="text-sm text-neutral-600 mt-1 max-w-2xl">
                {getDaysSinceLastFinanceUpdate(finances) === null
                  ? 'Todavia no hay movimientos cargados.'
                  : `Pasaron ${getDaysSinceLastFinanceUpdate(finances)} dias desde el ultimo movimiento.`}
                {' '}La app ya esta preparada para registrar movimientos estimados y marcarlos como supuestos hasta revisarlos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCatchupWizard}
            className="px-5 py-3 rounded-2xl bg-neutral-900 text-white text-sm font-black border border-neutral-900 hover:bg-neutral-800 transition-all"
          >
            Empezar puesta al dia
          </button>
        </div>
      )}

      <FinanceReviewCenter
        reviewFinances={reviewFinances}
        accounts={userAccounts}
        onConfirm={handleResolveReviewedFinance}
        onEdit={(finance) => openFinanceEdit(finance, 'reviews')}
        onIgnore={handleIgnoreReviewedFinance}
        onViewAll={() => setActiveListTab('reviews')}
      />

      <FinanceCatchupSessionPanel
        userId={user.uid}
        pendingCount={reviewCount}
        daysSinceLastUpdate={daysSinceLastUpdate}
        hasNoMovements={finances.length === 0}
        onOpenCatchupWizard={openCatchupWizard}
      />

      <MonthlyFinanceSnapshot
        insights={financialInsights}
        clarityStats={categoryClarityStats}
        reviewCount={reviewCount}
        accountUsage={monthlyAccountUsage}
      />

      <FinanceDiagnosticPanel items={financeDiagnosticItems} />

      <AccountReconciliationPanel
        items={accountReconciliationQueue}
        onEditAccount={startEditingAccount}
      />

      <BalanceIntegrityPanel
        issues={balanceIntegrityIssues}
        accounts={userAccounts}
        onApplyBalance={handleApplyMissingBalance}
        onEdit={(finance) => openFinanceEdit(finance, 'all')}
      />

      <FinancialInsightsPanel
        insights={financialInsights}
        onMarkRecurringAsFixed={handleMarkRecurringAsFixed}
      />

      <CategoryLearningGroupsPanel
        groups={categoryLearningGroups}
        categories={userCategories}
        accounts={userAccounts}
        clarityStats={categoryClarityStats}
        onApply={handleApplyCategoryToGroup}
      />

      <AnimatePresence>
        {showCatchupWizard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start gap-4 mb-6">
                <div>
                  <h3 className="text-2xl font-black text-neutral-900">Modo puesta al dia</h3>
                  <p className="text-sm text-neutral-500 mt-2">
                    Carga un gasto aproximado para cerrar el periodo. Va a quedar marcado como supuesto y pendiente de revision.
                  </p>
                </div>
                <button onClick={() => setShowCatchupWizard(false)} className="text-neutral-400 hover:text-neutral-900">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSaveCatchupEstimate} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Cuenta afectada</label>
                    <select
                      value={catchupDraft.accountId}
                      onChange={e => {
                        const selectedAccount = userAccounts.find(acc => acc.id === e.target.value);
                        setCatchupDraft({
                          ...catchupDraft,
                          accountId: e.target.value,
                          currency: selectedAccount?.currency || catchupDraft.currency,
                        });
                      }}
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm"
                    >
                      <option value="">Sin cuenta</option>
                      {(userAccounts || []).map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Fecha aproximada</label>
                    <input
                      type="date"
                      required
                      value={catchupDraft.date}
                      onChange={e => setCatchupDraft({ ...catchupDraft, date: e.target.value })}
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Monto estimado</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={catchupDraft.amount}
                      onChange={e => setCatchupDraft({ ...catchupDraft, amount: e.target.value })}
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm"
                      placeholder="Ej: 42000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Moneda</label>
                    <select
                      value={catchupDraft.currency}
                      onChange={e => setCatchupDraft({ ...catchupDraft, currency: e.target.value })}
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm"
                    >
                      {(CURRENCIES || []).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Que recordas?</label>
                  <input
                    type="text"
                    required
                    value={catchupDraft.description}
                    onChange={e => setCatchupDraft({ ...catchupDraft, description: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm"
                    placeholder="Ej: supermercado, salidas, nafta, efectivo"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Categoria</label>
                  <input
                    type="text"
                    required
                    value={catchupDraft.category}
                    onChange={e => setCatchupDraft({ ...catchupDraft, category: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm"
                    list="catchup-categories"
                    placeholder="Ej: Comida, Transporte, Ocio"
                  />
                  <datalist id="catchup-categories">
                    {(userCategories || []).map(cat => (
                      <option key={cat.id} value={cat.name} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Por que es estimado?</label>
                  <textarea
                    required
                    value={catchupDraft.estimatedReason}
                    onChange={e => setCatchupDraft({ ...catchupDraft, estimatedReason: e.target.value })}
                    className="w-full h-24 bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm resize-none"
                    placeholder="Ej: no tengo el ticket, pero recuerdo que fue una compra grande de la semana."
                  />
                </div>

                <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
                  <p className="text-sm font-bold text-amber-900">Este movimiento se guardara como supuesto.</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Quedara con source catchup_estimate, confidence estimated y status needs_review para revisarlo cuando tengas mejor informacion.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCatchupWizard(false)}
                    className="flex-1 px-5 py-3 rounded-2xl font-bold text-neutral-500 hover:bg-neutral-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCatchup}
                    className="flex-[2] px-5 py-3 rounded-2xl bg-neutral-900 text-white font-black hover:bg-neutral-800 transition-all disabled:opacity-50"
                  >
                    {isSavingCatchup ? 'Guardando...' : 'Guardar movimiento supuesto'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wallets Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {(userAccounts || []).map(acc => {
          const reconciliation = getAccountReconciliationInfo(acc);
          const accountActivity = accountActivityById.get(acc.id);
          return (
            <motion.div
              key={acc.id}
              whileHover={{ y: -4 }}
              className="bg-white p-6 rounded-3xl border border-neutral-100 shadow-sm relative overflow-hidden group cursor-pointer"
              onClick={() => startEditingAccount(acc)}
            >
              <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-neutral-50 rounded-full opacity-50 group-hover:scale-110 transition-transform" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm"
                    style={{ backgroundColor: acc.color || '#3B82F6' }}
                  >
                    {acc.type === 'bank' ? <Banknote size={18} /> : 
                     acc.type === 'credit_card' ? <CreditCard size={18} /> : 
                     acc.type === 'investment' ? <Briefcase size={18} /> : 
                     <Wallet size={18} />}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteAccount(acc.id); }}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <h4 className="font-bold text-neutral-800 mb-1">{acc.name}</h4>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{getAccountTypeLabel(acc.type)}</p>
                  <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
                    acc.type === 'credit_card' && Number(acc.balance || 0) < 0
                      ? 'bg-red-50 text-red-700'
                      : acc.type === 'investment'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {getAccountHealthLabel(acc)}
                  </span>
                  <span
                    title={reconciliation.helper}
                    className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
                      reconciliation.tone === 'danger'
                        ? 'bg-red-50 text-red-700'
                        : reconciliation.tone === 'warn'
                          ? 'bg-amber-50 text-amber-700'
                          : reconciliation.tone === 'ok'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-neutral-50 text-neutral-500'
                    }`}
                  >
                    {reconciliation.label}
                  </span>
                </div>
                {(acc.institution || acc.statementLabel || acc.accountNumberLast4 || acc.alias) && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {acc.institution && <span className="rounded-full bg-neutral-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-neutral-500">{acc.institution}</span>}
                    {acc.statementLabel && <span className="rounded-full bg-neutral-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-neutral-500">{acc.statementLabel}</span>}
                    {acc.accountNumberLast4 && <span className="rounded-full bg-neutral-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-neutral-500">****{acc.accountNumberLast4}</span>}
                    {acc.alias && <span className="rounded-full bg-neutral-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-neutral-500">{acc.alias}</span>}
                  </div>
                )}
                {acc.type === 'credit_card' && (acc.closingDay || acc.dueDay || acc.creditLimit) && (
                  <div className="mb-3 flex flex-wrap gap-1.5 text-[10px] font-bold text-neutral-500">
                    {acc.closingDay && <span>Cierre dia {acc.closingDay}</span>}
                    {acc.dueDay && <span>Vence dia {acc.dueDay}</span>}
                    {acc.creditLimit && <span>Limite {Number(acc.creditLimit).toLocaleString()} {acc.currency}</span>}
                  </div>
                )}
                <p className="text-2xl font-black text-neutral-900">
                  {formatAccountBalance(Number(acc.balance || 0), acc.type)} <span className="text-sm font-bold text-neutral-400">{acc.currency}</span>
                </p>
                {accountActivity && (accountActivity.movementCount > 0 || accountActivity.pendingCount > 0) && (
                  <div className="mt-4 rounded-2xl bg-neutral-50 px-3 py-2 text-xs font-bold text-neutral-500">
                    {accountActivity.movementCount > 0 && (
                      <div className="flex items-center justify-between gap-2">
                        <span>Desde conciliacion</span>
                        <span className={accountActivity.netActivity < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                          {formatSignedMoney(accountActivity.netActivity, acc.currency)}
                        </span>
                      </div>
                    )}
                    {accountActivity.pendingCount > 0 && (
                      <div className="mt-1 flex items-center justify-between gap-2 text-amber-700">
                        <span>Para revisar</span>
                        <span>{accountActivity.pendingCount}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
        <button 
          onClick={() => {
            setEditingAccount(null);
            setNewAccount(createEmptyAccountDraft());
            setIsAddingAccount(true);
          }}
          className="border-2 border-dashed border-neutral-200 rounded-3xl flex flex-col items-center justify-center gap-2 text-neutral-400 hover:border-neutral-400 hover:text-neutral-500 transition-all min-h-[160px] bg-white group"
        >
          <div className="w-10 h-10 rounded-full bg-neutral-50 flex items-center justify-center group-hover:bg-neutral-100 transition-colors">
            <Plus size={20} />
          </div>
          <span className="text-sm font-bold">Nueva cuenta</span>
        </button>
      </div>

      <AnimatePresence>
        {isAddingAccount && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-neutral-900">
                  {editingAccount ? 'Editar cuenta' : 'Nueva cuenta'}
                </h3>
                <button onClick={() => setIsAddingAccount(false)} className="text-neutral-400 hover:text-neutral-900">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleAddAccount} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Nombre</label>
                  <input
                    type="text"
                    required
                    value={newAccount.name}
                    onChange={e => setNewAccount({ ...newAccount, name: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900"
                    placeholder="Ej: Banco Galicia, Efectivo..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Moneda</label>
                    <select
                      value={newAccount.currency}
                      onChange={e => setNewAccount({ ...newAccount, currency: e.target.value })}
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm"
                    >
                      {(CURRENCIES || []).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Tipo</label>
                    <select
                      value={newAccount.type}
                      onChange={e => setNewAccount({ ...newAccount, type: e.target.value })}
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm"
                    >
                      <option value="bank">Banco</option>
                      <option value="wallet">Billetera virtual</option>
                      <option value="cash">Efectivo</option>
                      <option value="investment">Inversion</option>
                      <option value="credit_card">Tarjeta de credito</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Saldo Inicial</label>
                    <input
                      type="number"
                      required
                      value={newAccount.balance}
                      onChange={e => setNewAccount({ ...newAccount, balance: parseFloat(e.target.value) })}
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Color</label>
                    <input
                      type="color"
                      value={newAccount.color}
                      onChange={e => setNewAccount({ ...newAccount, color: e.target.value })}
                      className="w-full h-11 bg-neutral-50 border border-neutral-100 rounded-xl p-1 cursor-pointer"
                    />
                  </div>
                </div>
                <div className="rounded-3xl border border-neutral-100 bg-neutral-50/60 p-4">
                  <p className="mb-3 text-xs font-black uppercase tracking-widest text-neutral-400">Datos para conciliacion</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Institucion</label>
                      <input
                        type="text"
                        value={newAccount.institution}
                        onChange={e => setNewAccount({ ...newAccount, institution: e.target.value })}
                        className="w-full bg-white border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900"
                        placeholder="Ej: BBVA, Galicia, Mercado Pago"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Etiqueta resumen</label>
                      <input
                        type="text"
                        value={newAccount.statementLabel}
                        onChange={e => setNewAccount({ ...newAccount, statementLabel: e.target.value })}
                        className="w-full bg-white border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900"
                        placeholder="Ej: Caja ARS, Visa, Mastercard"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Ultimos digitos</label>
                      <input
                        type="text"
                        value={newAccount.accountNumberLast4}
                        onChange={e => setNewAccount({ ...newAccount, accountNumberLast4: e.target.value })}
                        className="w-full bg-white border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900"
                        placeholder="Ej: 1234"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Alias / CVU / CBU</label>
                      <input
                        type="text"
                        value={newAccount.alias}
                        onChange={e => setNewAccount({ ...newAccount, alias: e.target.value })}
                        className="w-full bg-white border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900"
                        placeholder="Opcional"
                      />
                    </div>
                  </div>
                </div>
                {newAccount.type === 'credit_card' && (
                  <div className="rounded-3xl border border-neutral-100 bg-neutral-50/60 p-4">
                    <p className="mb-3 text-xs font-black uppercase tracking-widest text-neutral-400">Datos de tarjeta</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Cierre</label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={newAccount.closingDay}
                          onChange={e => setNewAccount({ ...newAccount, closingDay: e.target.value })}
                          className="w-full bg-white border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900"
                          placeholder="Dia"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Vencimiento</label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={newAccount.dueDay}
                          onChange={e => setNewAccount({ ...newAccount, dueDay: e.target.value })}
                          className="w-full bg-white border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900"
                          placeholder="Dia"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Limite</label>
                        <input
                          type="number"
                          value={newAccount.creditLimit}
                          onChange={e => setNewAccount({ ...newAccount, creditLimit: e.target.value })}
                          className="w-full bg-white border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900"
                          placeholder="Opcional"
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Notas internas</label>
                  <textarea
                    value={newAccount.notes}
                    onChange={e => setNewAccount({ ...newAccount, notes: e.target.value })}
                    className="min-h-[88px] w-full resize-none bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900"
                    placeholder="Algo que ayude a reconocer esta cuenta despues."
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-neutral-900 text-white py-4 rounded-2xl font-bold hover:bg-neutral-800 transition-all shadow-lg"
                >
                  {editingAccount ? 'Guardar Cambios' : 'Crear cuenta'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {analysisResult && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-neutral-900 text-white p-8 rounded-[2rem] shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <TrendingUp size={120} />
          </div>
          <div className="relative z-10">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Sparkles size={20} className="text-neutral-400" />
              Analisis financiero
            </h3>
            <div className="prose prose-invert max-w-none text-neutral-300 leading-relaxed">
              {analysisResult}
            </div>
            <button 
              onClick={() => setAnalysisResult(null)}
              className="mt-6 text-sm font-bold text-neutral-400 hover:text-white transition-colors"
            >
              Cerrar analisis
            </button>
          </div>
        </motion.div>
      )}

      <div className="rounded-[2rem] border border-neutral-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Memoria financiera</p>
            <h3 className="mt-1 text-xl font-black text-neutral-950">Aprendizajes Wallet</h3>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-neutral-500">
              Activa patrones confiables del historial viejo para mejorar la clasificacion futura. No crea gastos ni cambia saldos.
            </p>
            {walletMemoryStatus && (
              <p className="mt-2 text-xs font-bold text-neutral-700">{walletMemoryStatus}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-neutral-900 transition hover:bg-neutral-50">
              <Upload size={15} />
              Elegir JSON
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleWalletMemoryPreviewFile}
              />
            </label>
            <button
              type="button"
              onClick={activateWalletMemoryPreview}
              disabled={walletMemoryPreview.length === 0 || isApplyingWalletMemory}
              className="rounded-2xl bg-neutral-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {isApplyingWalletMemory ? 'Activando...' : `Activar (${walletMemoryPreview.length})`}
            </button>
          </div>
        </div>
        {walletMemoryPreview.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {walletMemoryPreview.slice(0, 8).map(candidate => (
              <span key={`${candidate.merchantKey || candidate.mappedDescription}-${candidate.category}`} className="rounded-full bg-neutral-100 px-3 py-2 text-xs font-bold text-neutral-700">
                {candidate.mappedDescription} {'->'} {candidate.category}{candidate.subCategory ? ` / ${candidate.subCategory}` : ''}
              </span>
            ))}
            {walletMemoryPreview.length > 8 && (
              <span className="rounded-full bg-neutral-950 px-3 py-2 text-xs font-bold text-white">
                +{walletMemoryPreview.length - 8}
              </span>
            )}
          </div>
        )}
      </div>

      {lastImportResult && (
        <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">Importacion terminada</p>
              <h3 className="mt-1 text-xl font-black text-neutral-950">
                VEO guardo {lastImportResult.saved} movimiento(s) y dejo {lastImportResult.review} para revisar.
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-emerald-800">
                Solo frenamos duplicados o movimientos sin cuenta clara. Las categorias se pueden corregir despues y VEO aprende de esas correcciones.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <ImportReviewStat label="Archivos" value={lastImportResult.files} tone="neutral" />
              <ImportReviewStat label="Duplicados" value={lastImportResult.duplicates} tone={lastImportResult.duplicates ? 'danger' : 'neutral'} />
              <ImportReviewStat label="Sin cuenta" value={lastImportResult.missingAccount} tone={lastImportResult.missingAccount ? 'warn' : 'neutral'} />
              <ImportReviewStat label="Cierres" value={lastImportResult.statementClosings.length} tone={lastImportResult.statementClosings.length ? 'info' : 'neutral'} />
            </div>
          </div>
          {lastImportResult.statementClosings.length > 0 && (
            <div className="mt-4 grid gap-2 lg:grid-cols-2">
              {lastImportResult.statementClosings.map(suggestion => (
                <div key={suggestion.id} className="rounded-2xl border border-emerald-100 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Saldo de cierre detectado</p>
                      <p className="mt-1 text-sm font-black text-neutral-950">
                        {suggestion.accountName}: {suggestion.targetBalance.toLocaleString()} {suggestion.currency}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-neutral-500">
                        {suggestion.fileName}{suggestion.periodEnd ? ` · ${format(new Date(suggestion.periodEnd), 'dd/MM/yyyy')}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleReconcileStatementClosing(suggestion)}
                      className="rounded-2xl bg-neutral-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800"
                    >
                      Conciliar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pending Transactions Review Section */}
      <AnimatePresence>
        {pendingTransactions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-amber-50 border border-amber-200 rounded-[2rem] p-8 space-y-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-amber-900">Resumen de importacion</h3>
                  <p className="text-sm text-amber-700 font-medium">
                    {pendingTransactions.length} movimientos extraidos. Guardamos solo lo que confirmes.
                  </p>
                  <p className="mt-2 max-w-3xl text-xs font-bold leading-5 text-amber-800">
                    {getPendingImportNextStep(pendingImportSummary)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={confirmReadyPendingTransactions}
                  disabled={pendingImportSummary.readyCount === 0}
                  className="rounded-2xl bg-neutral-950 px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
                >
                  Guardar listos ({pendingImportSummary.readyCount})
                </button>
                <button 
                  onClick={() => setPendingTransactions([])}
                  className="rounded-2xl bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-amber-700 transition hover:bg-amber-100"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={() => setShowPendingImportDetails(prev => !prev)}
                  className="rounded-2xl bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-amber-700 transition hover:bg-amber-100"
                >
                  {showPendingImportDetails ? 'Ocultar detalle' : `Ver detalle (${pendingTransactions.length})`}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <ImportReviewStat label="Listos" value={pendingImportSummary.readyCount} tone="neutral" />
              <ImportReviewStat label="Duplicados" value={pendingImportSummary.duplicateCount} tone={pendingImportSummary.duplicateCount ? 'danger' : 'neutral'} />
              <ImportReviewStat label="Sin cuenta" value={pendingImportSummary.missingAccountCount} tone={pendingImportSummary.missingAccountCount ? 'warn' : 'neutral'} />
              <ImportReviewStat label="Pagos tarjeta" value={pendingImportSummary.cardPaymentCount} tone="info" />
              <ImportReviewStat label="USD" value={pendingImportSummary.usdCount} tone="info" />
              <ImportReviewStat label="Fijos" value={pendingImportSummary.fixedCount} tone="neutral" />
              <ImportReviewStat label="Wallet" value={pendingImportSummary.walletHistoryCount} tone="info" />
            </div>

            <div className="rounded-2xl border border-amber-100 bg-white/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Archivos leidos</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(pendingImportSummary.byFile).map(([fileName, count]) => (
                  <span key={fileName} className="rounded-full bg-white px-3 py-2 text-xs font-bold text-neutral-600 shadow-sm">
                    {fileName}: {count}
                  </span>
                ))}
              </div>
              {(pendingImportSummary.duplicateCount > 0 || pendingImportSummary.missingAccountCount > 0) && (
                <p className="mt-3 text-xs font-semibold leading-5 text-amber-800">
                  Los duplicados y movimientos sin cuenta quedan frenados para revision. Si un pago de tarjeta fue detectado, se guarda como transferencia entre cuentas.
                </p>
              )}
              {pendingImportSummary.walletHistoryCount > 0 && (
                <p className="mt-3 text-xs font-semibold leading-5 text-amber-800">
                  Este historial de Wallet queda tratado como aprendizaje: conserva cuenta/categoria original y no toca saldos al guardarse.
                </p>
              )}
            </div>

            <PendingImportGroupsPanel
              groups={pendingImportGroups}
              accounts={userAccounts}
              categories={userCategories}
              onApplyAccounts={applyAccountToPendingGroup}
              onApplyCategory={applyCategoryToPendingGroup}
              onConfirmGroup={confirmPendingGroup}
              onDiscardGroup={discardPendingGroup}
              onLinkGroup={linkPendingDuplicateGroup}
            />

            {!showPendingImportDetails && (
              <div className="rounded-2xl border border-amber-100 bg-white/70 p-4 text-xs font-bold leading-5 text-amber-800">
                El detalle individual esta oculto para mantener limpia la revision. Usa los grupos de arriba para resolver rapido; abrilo solo si queres revisar un movimiento puntual.
              </div>
            )}

            {showPendingImportDetails && (
            <div className="grid grid-cols-1 gap-4">
              {(pendingTransactions || []).map((pt) => (
                <div key={pt.id} className="bg-white p-6 rounded-2xl border border-amber-100 shadow-sm space-y-4">
                  <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <PendingMeta label="Fecha" value={formatPendingDate(pt.date)} />
                      <PendingMeta label="Moneda" value={pt.currency || 'ARS'} />
                      <PendingMeta label="Detectado como" value={FINANCE_TYPES.find(item => item.id === pt.type)?.label || pt.type} />
                      <PendingMeta label="Confianza" value={`${Math.round(Number(pt.confidence || 0) * 100)}%`} />
                      <PendingMeta label="Comercio" value={pt.merchantName || 'No identificado'} />
                      <PendingMeta label="Fuente" value={pt.importSource || 'PDF'} />
                      <PendingMeta label="Cuenta del resumen" value={pt.statementAccountLabel || 'No detectada'} />
                      <PendingMeta label="Matching cuenta" value={pt.accountMatchConfidence || 'No evaluado'} />
                      <PendingMeta label="Archivo" value={pt.fileName} />
                      <PendingMeta label="Huella" value={shortFingerprint(pt.transactionFingerprint)} />
                    </div>
                    {pt.accountMatchReason && (
                      <p className="mt-3 text-xs font-bold text-neutral-500">
                        Cuenta sugerida: <span className="text-neutral-900">{pt.accountMatchReason}</span>
                      </p>
                    )}
                    {typeof (pt as any).balanceDelta === 'number' && (
                      <p className="mt-3 text-xs font-bold text-neutral-500">
                        Impacto en saldo del resumen: {(pt as any).balanceDelta.toLocaleString()} {pt.currency || 'ARS'}
                      </p>
                    )}
                    <p className="mt-3 text-xs font-bold text-neutral-500">
                      Concepto original del PDF: <span className="text-neutral-900">{pt.originalDescription || pt.description}</span>
                    </p>
                    {pt.type === 'transfer' && (
                      <TransferTraceCard transaction={pt} />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex-1 min-w-[200px] space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Descripcion</label>
                      <input 
                        type="text"
                        value={pt.description}
                        onChange={(e) => updatePending(pt.id, { description: e.target.value })}
                        className="w-full bg-neutral-50 border-none rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div className="w-32 space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Importe</label>
                      <input 
                        type="number"
                        value={pt.amount}
                        onChange={(e) => updatePending(pt.id, { amount: parseFloat(e.target.value) })}
                        className="w-full bg-neutral-50 border-none rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div className="w-48 space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Categoria</label>
                      <select 
                        value={pt.category}
                        onChange={(e) => {
                          const nextType = getPendingCategoryType(e.target.value);
                          updatePending(pt.id, {
                            category: e.target.value,
                            subCategory: '',
                            type: nextType,
                            toAccountId: nextType === 'transfer' ? pt.toAccountId : '',
                          });
                        }}
                        className="w-full bg-neutral-50 border-none rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Elegir categoria</option>
                        {(userCategories || []).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="w-44 space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Tipo</label>
                      <select
                        value={pt.type}
                        onChange={(e) => updatePending(pt.id, {
                          type: e.target.value,
                          toAccountId: e.target.value === 'transfer' ? pt.toAccountId : '',
                        })}
                        className="w-full bg-neutral-50 border-none rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                      >
                        {(FINANCE_TYPES || []).map(t => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-48 space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Sub-Categoria</label>
                      <select 
                        value={pt.subCategory}
                        onChange={(e) => updatePending(pt.id, { subCategory: e.target.value, subSubCategory: '' })}
                        className="w-full bg-neutral-50 border-none rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Sin subcategoria</option>
                        {(userCategories.find(c => c.name === pt.category)?.subCategories || []).map((s: any) => {
                          const name = typeof s === 'string' ? s : s.name;
                          return <option key={name} value={name}>{name}</option>;
                        })}
                      </select>
                    </div>
                    <div className="w-56 space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Cuenta origen</label>
                      <select
                        value={pt.accountId || ''}
                        onChange={(e) => updatePending(pt.id, { accountId: e.target.value })}
                        className="w-full bg-neutral-50 border-none rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Elegir cuenta</option>
                        {(userAccounts || []).map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                        ))}
                      </select>
                    </div>
                    {pt.type === 'transfer' && (
                      <div className="w-56 space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Cuenta destino</label>
                        <select
                          value={pt.toAccountId || ''}
                          onChange={(e) => updatePending(pt.id, { toAccountId: e.target.value })}
                          className="w-full bg-neutral-50 border-none rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">Elegir destino</option>
                          {(userAccounts || []).map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex items-center gap-4 pt-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox"
                          checked={pt.isFixed}
                          onChange={(e) => updatePending(pt.id, { isFixed: e.target.checked })}
                          className="w-4 h-4 rounded border-neutral-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-xs font-bold text-neutral-600">Gasto fijo</span>
                      </label>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setPendingTransactions(prev => prev.filter(t => t.id !== pt.id))}
                          className="p-2 text-neutral-400 hover:text-red-500 transition-colors"
                        >
                          <X size={20} />
                        </button>
                        <button 
                          onClick={() => confirmTransaction(pt)}
                          disabled={!canConfirmPendingTransaction(pt)}
                          title={!canConfirmPendingTransaction(pt) ? 'Falta cuenta origen/destino o hay posible duplicado.' : 'Confirmar movimiento'}
                          className="bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-amber-700 transition-all shadow-md flex items-center gap-2 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:shadow-none"
                        >
                          <Check size={16} /> Confirmar
                        </button>
                      </div>
                    </div>
                  </div>
                  {pt.duplicateReason && (
                    <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-bold leading-5 text-red-800">
                      <p>Posible duplicado: {pt.duplicateReason}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setPendingTransactions(prev => prev.filter(t => t.id !== pt.id))}
                          className="rounded-xl bg-red-700 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-red-800"
                        >
                          Es el mismo
                        </button>
                        {pt.duplicateOfId && (
                          <button
                            type="button"
                            onClick={() => linkPendingDuplicateToExisting(pt)}
                            className="rounded-xl bg-neutral-950 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-neutral-800"
                          >
                            Vincular
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => confirmTransaction({ ...pt, duplicateReason: '' })}
                          disabled={pendingTransactionNeedsAccount(pt)}
                          className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:text-neutral-300"
                        >
                          Guardar igual
                        </button>
                      </div>
                    </div>
                  )}
                  {pt.type === 'transfer' && pt.subCategory === 'Pago de tarjeta' && (
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs font-bold leading-5 text-blue-800">
                      Pago de tarjeta: VEO lo registra como transferencia entre cuentas, no como gasto nuevo.
                    </div>
                  )}
                  {pendingTransactionNeedsAccount(pt) && (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
                      {pt.type === 'transfer'
                        ? 'Para confirmar una transferencia falta elegir cuenta origen y destino. Si en realidad fue un gasto, cambia el tipo a Gasto.'
                        : 'Para confirmar este movimiento falta elegir la cuenta origen.'}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-amber-600 font-bold">
                    <FileText size={12} />
                    Desde: {pt.fileName} - Original: "{pt.originalDescription}"
                  </div>
                </div>
              ))}
            </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {reviewFinances.length > 0 && (
        <section className="bg-white border border-amber-100 rounded-[2rem] p-6 shadow-sm space-y-5">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-neutral-900 flex items-center gap-2">
                <AlertCircle size={18} className="text-amber-500" />
                Movimientos para revisar
              </h3>
              <p className="text-sm text-neutral-500 mt-1 max-w-2xl">
                Hay {reviewFinances.length} movimiento(s) marcados como supuestos, inferidos o pendientes. Confirmalos cuando la caja cierre, editalos si recordas mejor el detalle o ignoralos si no corresponden.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveListTab('reviews')}
              className="px-4 py-2 rounded-2xl bg-neutral-900 text-white text-xs font-black uppercase tracking-widest hover:bg-neutral-800 transition-all"
            >
              Ver todos
            </button>
          </div>

          {estimatedReviewFinances.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {estimatedReviewFinances.slice(0, 4).map(finance => (
                <div key={finance.id} className="rounded-2xl bg-amber-50 border border-amber-100 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-neutral-900">{finance.description || finance.category}</p>
                      <p className="text-xs text-neutral-500 mt-1">
                        {finance.category} - {finance.currency || 'ARS'} {Number(finance.amount || 0).toLocaleString()}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700 border border-amber-100">
                      {finance.confidence || 'estimated'}
                    </span>
                  </div>

                  {finance.estimatedReason && (
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Motivo: {finance.estimatedReason}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleConfirmReviewedFinance(finance)}
                      className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition-all flex items-center gap-1"
                    >
                      <Check size={14} />
                      Confirmar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(finance.id);
                        setEditForm(finance);
                        setActiveListTab('reviews');
                      }}
                      className="px-3 py-2 rounded-xl bg-white text-neutral-700 text-xs font-black border border-amber-100 hover:bg-amber-100 transition-all flex items-center gap-1"
                    >
                      <Edit2 size={14} />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleIgnoreReviewedFinance(finance)}
                      className="px-3 py-2 rounded-xl bg-white text-neutral-500 text-xs font-black border border-amber-100 hover:bg-white/70 transition-all"
                    >
                      Ignorar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Input & Stats */}
        <div className="lg:col-span-1 space-y-6">
          {/* Balance Card */}
          <div className="bg-neutral-900 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
            <div className="relative z-10 space-y-6">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-1">Caja disponible</p>
                <h3 className="text-4xl font-black tracking-tighter">
                  {primaryBalanceSummary
                    ? `${primaryBalanceSummary.liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${primaryBalanceSummary.currency}`
                    : 'Sin cuentas'}
                </h3>
                <p className="mt-2 text-xs font-bold leading-5 text-neutral-400">
                  No mezcla monedas. Las tarjetas se leen como deuda separada.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-800">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-1">Deuda tarjetas</p>
                  <p className="text-lg font-bold text-white">
                    {primaryBalanceSummary
                      ? `${Math.abs(primaryBalanceSummary.creditCardDebt).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${primaryBalanceSummary.currency}`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Neto moneda</p>
                  <p className="text-lg font-bold text-white">
                    {primaryBalanceSummary
                      ? `${primaryBalanceSummary.netWorth.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${primaryBalanceSummary.currency}`
                      : '-'}
                  </p>
                </div>
              </div>
              {accountBalanceSummary.length > 1 && (
                <div className="space-y-2 rounded-2xl bg-white/5 p-3">
                  {accountBalanceSummary.map(item => (
                    <div key={item.currency} className="flex items-center justify-between text-xs font-black">
                      <span className="text-neutral-400">{item.currency}</span>
                      <span>{item.netWorth.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="absolute -bottom-4 -right-4 opacity-10">
              <Wallet size={100} />
            </div>
          </div>

          {/* Manual Entry */}
          <div className="bg-white p-6 rounded-[2rem] border border-neutral-200 shadow-sm">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Plus size={18} className="text-neutral-400" />
              Agregar registro
            </h3>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column */}
                <div className="space-y-4">
                  <div className="flex gap-2">
                    {(FINANCE_TYPES || []).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setType(t.id)}
                        className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-xl text-xs font-bold transition-all border ${
                          type === t.id 
                            ? t.activeClass 
                            : 'bg-white text-neutral-500 border-neutral-100 hover:border-neutral-300'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Cantidad *</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        required
                        className="flex-1 bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                      />
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-24 bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                      >
                        {(CURRENCIES || []).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">
                      {type === 'transfer' ? 'Cuenta origen' : 'Cuenta usada'}
                    </label>
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                    >
                      <option value="">Seleccionar cuenta</option>
                      {(userAccounts || []).map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                      ))}
                    </select>
                  </div>

                  {type === 'transfer' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">A cuenta</label>
                      <select
                        value={toAccountId}
                        onChange={(e) => setToAccountId(e.target.value)}
                        className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                      >
                        <option value="">Seleccionar cuenta destino</option>
                        {(userAccounts || []).map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Categoria *</label>
                    <select
                      value={category}
                      onChange={(e) => { setCategory(e.target.value); setSubCategoria(''); }}
                      required
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                    >
                      <option value="">Elegir</option>
                      {(userCategories || []).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>

                  {category && userCategories.find(c => c.name === category)?.subCategories?.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Subcategoria</label>
                      <select
                        value={subCategory}
                        onChange={(e) => { setSubCategoria(e.target.value); setSubSubCategoria(''); }}
                        className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                      >
                        <option value="">Ninguna</option>
                        {(userCategories.find(c => c.name === category)?.subCategories || []).map((sub: any) => {
                          const name = typeof sub === 'string' ? sub : sub.name;
                          return <option key={name} value={name}>{name}</option>;
                        })}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Etiquetas</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (tagInput.trim() && !tags.includes(tagInput.trim())) {
                              setTags([...tags, tagInput.trim()]);
                              setTagInput('');
                            }
                          }
                        }}
                        placeholder="Elegir o escribir..."
                        className="flex-1 bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (tagInput.trim() && !tags.includes(tagInput.trim())) {
                            setTags([...tags, tagInput.trim()]);
                            setTagInput('');
                          }
                        }}
                        className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 transition-all"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(tags || []).map(t => (
                          <span key={t} className="bg-neutral-100 text-neutral-600 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1">
                            {t}
                            <button type="button" onClick={() => setTags(tags.filter(tag => tag !== t))}><X size={10} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Fecha y hora</label>
                    <input
                      type="datetime-local"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                    />
                  </div>

                  <label className="flex items-center gap-2 px-1 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={isFixed}
                      onChange={(e) => setIsFijo(e.target.checked)}
                      className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                    />
                    <span className="text-xs font-bold text-neutral-600">Crear plantilla desde este registro</span>
                  </label>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-neutral-900 border-b border-neutral-100 pb-2">Otros detalles</h4>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Nota</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Describe el registro"
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all min-h-[80px]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Para</label>
                    <select
                      value={`${beneficiaryType}:${beneficiaryLabel}`}
                      onChange={(e) => {
                        const [nextType, nextLabel] = e.target.value.split(':');
                        const option = FINANCE_BENEFICIARIES.find(item => item.type === nextType && item.label === nextLabel);
                        setBeneficiaryType(nextType);
                        setBeneficiaryLabel(nextLabel);
                        setScope(option?.scope || 'familia');
                      }}
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                    >
                      {FINANCE_BENEFICIARIES.map(item => (
                        <option key={`${item.type}:${item.label}`} value={`${item.type}:${item.label}`}>{item.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Tipo de pago</label>
                    <select
                      value={paymentType}
                      onChange={(e) => setPaymentType(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                    >
                      {(PAYMENT_TYPES || []).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Estado del pago</label>
                    <select
                      value={paymentStatus}
                      onChange={(e) => setPaymentStatus(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                    >
                      {(PAYMENT_STATUSES || []).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Registrado por</label>
                      <select
                        value={generatedBy}
                        onChange={(e) => setGeneratedBy(e.target.value)}
                        className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                      >
                        {uniqueHouseholdMembers.map(m => <option key={m.uid} value={m.uid}>{m.displayName || m.email}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Scope</label>
                      <select
                        value={scope}
                        onChange={(e) => setScope(e.target.value)}
                        className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                      >
                        <option value="personal">Personal</option>
                        <option value="pareja">Pareja</option>
                        <option value="hogar">Hogar</option>
                        <option value="familia">Familia</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-4">
                <button
                  type="submit"
                  className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-md"
                >
                  Agregar registro
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit(undefined, true)}
                  className="w-full bg-white text-blue-600 border border-blue-600 py-4 rounded-xl font-bold text-sm hover:bg-blue-50 transition-all shadow-sm"
                >
                  Agregar y crear otro
                </button>
              </div>
            </form>
          </div>

          {/* PDF Upload */}
          <div 
            {...getRootProps()} 
            className={`p-8 rounded-[2rem] border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-4 ${
              isDragActive ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 bg-white hover:border-neutral-400'
            }`}
          >
            <input {...getInputProps()} />
            <div className="w-12 h-12 bg-neutral-100 rounded-2xl flex items-center justify-center text-neutral-500">
              {isProcessingPdf ? <Sparkles className="animate-spin" /> : <Upload />}
            </div>
            <div>
              <p className="text-sm font-bold text-neutral-900">
                {isProcessingPdf ? 'Procesando archivos...' : 'Subir resumenes bancarios'}
              </p>
              <p className="text-xs text-neutral-400 font-medium">Arrastra o selecciona PDFs o CSVs</p>
            </div>
            {isProcessingPdf && (
              <div className="w-full bg-neutral-100 h-1 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="bg-neutral-900 h-full"
                />
              </div>
            )}
          </div>
        </div>

        {/* List Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-4 border-b border-neutral-200 pb-px">
            <button 
              onClick={() => setActiveListTab('all')}
              className={`pb-4 px-2 text-sm font-bold transition-all relative ${activeListTab === 'all' ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}
            >
              Todos los registros
              {activeListTab === 'all' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900" />}
            </button>
            <button 
              onClick={() => setActiveListTab('reviews')}
              className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 ${activeListTab === 'reviews' ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}
            >
              Revisiones
              {reviewCount > 0 && (
                <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {reviewCount}
                </span>
              )}
              {activeListTab === 'reviews' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900" />}
            </button>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-neutral-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Filter size={18} className="text-neutral-400" />
                Filtros y busqueda
              </h3>
              {(filterDateRange !== 'all' || filterCategory !== 'all' || filterGeneratedBy !== 'all' || filterAssignedTo !== 'all' || filterBeneficiary !== 'all' || filterScope !== 'all' || filterAccount !== 'all' || searchQuery || filterAmountMin || filterAmountMax) && (
                <button 
                  onClick={() => {
                    setFilterDateRange('all');
                    setFilterCategory('all');
                    setFilterGeneratedBy('all');
                    setFilterAssignedTo('all');
                    setFilterBeneficiary('all');
                    setFilterScope('all');
                    setFilterAccount('all');
                    setSearchQuery('');
                    setFilterAmountMin('');
                    setFilterAmountMax('');
                  }}
                  className="text-xs font-bold text-neutral-400 hover:text-neutral-900 transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Periodo</label>
                <select 
                  value={filterDateRange}
                  onChange={(e) => setFilterDateRange(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-2 text-xs font-bold"
                >
                  <option value="all">Todo</option>
                  <option value="day">Hoy</option>
                  <option value="month">Este mes</option>
                  <option value="quarter">Este trimestre</option>
                  <option value="year">Este ano</option>
                  <option value="custom">Rango personalizado</option>
                </select>
              </div>

              {filterDateRange === 'custom' && (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Fecha inicial</label>
                    <input 
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-2 text-xs font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Fecha final</label>
                    <input 
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-2 text-xs font-bold"
                    />
                  </div>
                </>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Categoria</label>
                <select 
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-2 text-xs font-bold"
                >
                  <option value="all">Todas las categorias</option>
                  {(userCategories || []).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Cargado por</label>
                <select 
                  value={filterGeneratedBy}
                  onChange={(e) => setFilterGeneratedBy(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-2 text-xs font-bold"
                >
                  <option value="all">Todos</option>
                  {uniqueHouseholdMembers.map(m => <option key={m.uid} value={m.uid}>{m.displayName || m.email}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Para</label>
                <select 
                  value={filterBeneficiary}
                  onChange={(e) => setFilterBeneficiary(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-2 text-xs font-bold"
                >
                  <option value="all">Todos</option>
                  {FINANCE_BENEFICIARIES.map(item => <option key={item.label} value={item.label}>{item.label}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Scope</label>
                <select 
                  value={filterScope}
                  onChange={(e) => setFilterScope(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-2 text-xs font-bold"
                >
                  <option value="all">Todos</option>
                  <option value="personal">Personal</option>
                  <option value="pareja">Pareja</option>
                  <option value="hogar">Hogar</option>
                  <option value="familia">Familia</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Cuenta usada</label>
                <select 
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-2 text-xs font-bold"
                >
                  <option value="all">Todas las cuentas</option>
                  {(userAccounts || []).map(account => (
                    <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 lg:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Buscar</label>
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar descripcion, comercio, alias, CBU, cuenta, PDF..."
                  className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-2 text-xs font-bold"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {(filteredFinances || []).map((f) => {
                const typeInfo = FINANCE_TYPES.find(t => t.id === f.type);
                const isEditing = editingId === f.id;
                const generator = uniqueHouseholdMembers.find(m => m.uid === f.generatedBy);
                const assignee = f.assignedTo === 'Ambos' ? 'Ambos' : uniqueHouseholdMembers.find(m => m.uid === f.assignedTo);
                const sourceAccount = userAccounts.find(account => account.id === (f.sourceAccountId || f.accountId));
                const destinationAccount = userAccounts.find(account => account.id === f.toAccountId);
                const beneficiary = f.beneficiaryLabel || legacyBeneficiaryLabel(f);
                const trace = parseFinanceTraceNote(f.note);
                const shouldShowTrace = hasFinanceTrace(trace, f);
                const merchantLabel = f.merchantName || f.merchant;

                return (
                  <motion.div
                    key={f.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm flex flex-col gap-4 group hover:shadow-md transition-all"
                  >
                    {isEditing ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="flex gap-1">
                            <input 
                              type="number"
                              value={editForm.amount}
                              onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                              className="flex-1 bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                            />
                            <select 
                              value={editForm.currency}
                              onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                              className="w-16 bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                            >
                              {(CURRENCIES || []).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <select 
                            value={editForm.category}
                            onChange={(e) => setEditForm({ ...editForm, category: e.target.value, subCategory: '' })}
                            className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                          >
                            {(userCategories || []).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                          </select>
                          {editForm.category && userCategories.find(c => c.name === editForm.category)?.subCategories?.length > 0 && (
                            <select 
                              value={editForm.subCategory}
                              onChange={(e) => setEditForm({ ...editForm, subCategory: e.target.value, subSubCategory: '' })}
                              className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                            >
                              <option value="">Sin subcategoria</option>
                              {(userCategories.find(c => c.name === editForm.category)?.subCategories || []).map((sub: any) => {
                                const name = typeof sub === 'string' ? sub : sub.name;
                                return <option key={name} value={name}>{name}</option>;
                              })}
                            </select>
                          )}
                          <select 
                            value={editForm.accountId}
                            onChange={(e) => setEditForm({ ...editForm, accountId: e.target.value, sourceAccountId: e.target.value })}
                            className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                          >
                            <option value="">Sin cuenta usada</option>
                            {(userAccounts || []).map(acc => (
                              <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                            ))}
                          </select>
                          {editForm.type === 'transfer' && (
                            <select 
                              value={editForm.toAccountId}
                              onChange={(e) => setEditForm({ ...editForm, toAccountId: e.target.value })}
                              className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                            >
                              <option value="">Sin cuenta destino</option>
                              {(userAccounts || []).map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                              ))}
                            </select>
                          )}
                          <input 
                            type="datetime-local"
                            value={editForm.date}
                            onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                            className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input 
                            type="text"
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            placeholder="Descripcion"
                            className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                          />
                          <input 
                            type="text"
                            value={editForm.note}
                            onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                            placeholder="Nota"
                            className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                          />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <select
                            value={`${editForm.beneficiaryType || 'family'}:${editForm.beneficiaryLabel || legacyBeneficiaryLabel(editForm)}`}
                            onChange={(e) => {
                              const [nextType, nextLabel] = e.target.value.split(':');
                              const option = FINANCE_BENEFICIARIES.find(item => item.type === nextType && item.label === nextLabel);
                              setEditForm({
                                ...editForm,
                                beneficiaryType: nextType,
                                beneficiaryLabel: nextLabel,
                                scope: option?.scope || editForm.scope || 'familia',
                                visibility: editForm.visibility || 'household_shared',
                              });
                            }}
                            className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                          >
                            {FINANCE_BENEFICIARIES.map(item => (
                              <option key={`${item.type}:${item.label}`} value={`${item.type}:${item.label}`}>{item.label}</option>
                            ))}
                          </select>
                          <select 
                            value={editForm.paymentType}
                            onChange={(e) => setEditForm({ ...editForm, paymentType: e.target.value })}
                            className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                          >
                            {(PAYMENT_TYPES || []).map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <select 
                            value={editForm.paymentStatus}
                            onChange={(e) => setEditForm({ ...editForm, paymentStatus: e.target.value })}
                            className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                          >
                            {(PAYMENT_STATUSES || []).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <select 
                            value={editForm.type}
                            onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                            className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                          >
                            {(FINANCE_TYPES || []).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex gap-4">
                            <select 
                              value={editForm.generatedBy}
                              onChange={(e) => setEditForm({ ...editForm, generatedBy: e.target.value })}
                              className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                            >
                              {uniqueHouseholdMembers.map(m => <option key={m.uid} value={m.uid}>{m.displayName || m.email}</option>)}
                            </select>
                            <select 
                              value={editForm.scope || 'familia'}
                              onChange={(e) => setEditForm({ ...editForm, scope: e.target.value })}
                              className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                            >
                              <option value="personal">Personal</option>
                              <option value="pareja">Pareja</option>
                              <option value="hogar">Hogar</option>
                              <option value="familia">Familia</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setEditingId(null)} className="p-2 text-neutral-400 hover:text-neutral-600"><X size={18} /></button>
                            <button onClick={saveEdit} className="bg-neutral-900 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2"><Save size={14} /> Guardar</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 ${typeInfo?.bg} rounded-xl flex items-center justify-center relative`}>
                              {(() => {
                                const cat = userCategories.find(c => c.name === f.category);
                                if (cat) return <CategoriaIcon name={cat.icon} color={cat.color} size={18} />;
                                return typeInfo?.icon;
                              })()}
                              <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${typeInfo?.bg} ${typeInfo?.color} rounded-full border-2 border-white flex items-center justify-center`}>
                                <div className="scale-75">{typeInfo?.icon}</div>
                              </div>
                              {(f.isConfirmed === false || f.needsReview) && (
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 border-2 border-white rounded-full" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-neutral-900">{f.category}</p>
                                {(f.isConfirmed === false || f.needsReview) && (
                                  <span className="text-[9px] font-black uppercase tracking-tighter text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 flex items-center gap-1">
                                    <AlertCircle size={10} /> Revisar
                                  </span>
                                )}
                                {f.subCategory && (
                                  <span className="text-[10px] font-bold text-neutral-400 bg-neutral-50 px-2 py-0.5 rounded-full border border-neutral-100">
                                    {f.subCategory}
                                  </span>
                                )}
                                {sourceAccount && (
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                                    Salio de {sourceAccount.name}
                                  </span>
                                )}
                                {destinationAccount && (
                                  <span className="text-[10px] font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100">
                                    A {destinationAccount.name}
                                  </span>
                                )}
                                {beneficiary && (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                    Para {beneficiary}
                                  </span>
                                )}
                                {f.isFixed && (
                                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                    Fijo
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-neutral-400 font-medium truncate max-w-[200px]">
                                {f.description || f.note || 'Sin descripcion'}
                              </p>
                              {merchantLabel && (
                                <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-neutral-300">
                                  Comercio: {merchantLabel}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className={`text-sm font-black ${typeInfo?.color}`}>
                                {f.type === 'expense' ? '-' : '+'}{f.currency || '$'}{f.amount.toLocaleString()}
                              </p>
                              <p className="text-[10px] text-neutral-300 font-bold">
                                {format(f.date.toDate(), 'MMM d, yyyy')}
                              </p>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {(f.isConfirmed === false || f.needsReview) && (
                                <>
                                  <button 
                                    onClick={() => handleConfirmReviewedFinance(f)}
                                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                    title="Confirmar"
                                  >
                                    <Check size={16} />
                                  </button>
                                  <button 
                                    onClick={() => handleIgnoreReviewedFinance(f)}
                                    className="p-2 text-neutral-400 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-all"
                                    title="Ignorar"
                                  >
                                    <X size={16} />
                                  </button>
                                </>
                              )}
                              <button 
                                onClick={() => startEditing(f)}
                                className="p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 rounded-lg transition-all"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button 
                                onClick={() => handleDelete(f.id)}
                                className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                        {shouldShowTrace && (
                          <div className="rounded-2xl border border-neutral-100 bg-neutral-50/70 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Rastro</span>
                              {f.importSource && (
                                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-neutral-600 border border-neutral-100">
                                  {f.importSource}
                                </span>
                              )}
                              {trace.importedFile && (
                                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-neutral-600 border border-neutral-100">
                                  {trace.importedFile}
                                </span>
                              )}
                              {trace.reconciliations.length > 0 && (
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 border border-emerald-100">
                                  Conciliado
                                </span>
                              )}
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              <PendingMeta label="Concepto original" value={trace.originalConcept || f.originalDescription} />
                              <PendingMeta label="Detalle" value={trace.transferDetail} />
                              <PendingMeta label="Destinatario" value={trace.counterpartyName} />
                              <PendingMeta label="Alias" value={trace.counterpartyAlias} />
                              <PendingMeta label="CBU/CVU" value={trace.counterpartyAccount} />
                              <PendingMeta label="Comercio" value={merchantLabel} />
                              <PendingMeta label="Origen" value={sourceAccount?.name} />
                              <PendingMeta label="Destino" value={destinationAccount?.name} />
                            </div>
                            {(trace.reconciliations.length > 0 || trace.otherLines.length > 0 || f.duplicateReason) && (
                              <div className="mt-3 space-y-1 border-t border-neutral-200 pt-3">
                                {[...trace.reconciliations, ...trace.otherLines, f.duplicateReason].filter(Boolean).slice(0, 3).map((line, index) => (
                                  <p key={`${f.id}-trace-${index}`} className="text-xs font-semibold leading-5 text-neutral-500">
                                    {line}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-4 pt-2 border-t border-neutral-50">
                          {(f.source || f.confidence || f.estimatedReason) && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-black uppercase tracking-tighter text-neutral-300">Origen</span>
                              <span className="text-[10px] font-bold text-neutral-500">
                                {f.source || 'manual'}{f.confidence ? ` - ${f.confidence}` : ''}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-black uppercase tracking-tighter text-neutral-300">Registrado por</span>
                            <span className="text-[10px] font-bold text-neutral-500">{generator?.displayName || 'Sin dato'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-black uppercase tracking-tighter text-neutral-300">Para</span>
                            <span className="text-[10px] font-bold text-neutral-500">
                              {beneficiary || (f.assignedTo === 'Ambos' ? 'Pareja' : (assignee?.displayName || 'Familia'))}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-black uppercase tracking-tighter text-neutral-300">Scope</span>
                            <span className="text-[10px] font-bold text-neutral-500">{f.scope || legacyScope(f)}</span>
                          </div>
                          {f.estimatedReason && (
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-bold text-amber-700 truncate block">
                                Supuesto: {f.estimatedReason}
                              </span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {filteredFinances.length === 0 && (
              <div className="text-center py-20 bg-neutral-100 rounded-[2rem] border-2 border-dashed border-neutral-200">
                <p className="text-neutral-400 font-bold">No hay registros que coincidan con los filtros.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FinanceReviewCenter({
  reviewFinances,
  accounts,
  onConfirm,
  onEdit,
  onIgnore,
  onViewAll,
}: {
  reviewFinances: any[];
  accounts: any[];
  onConfirm: (finance: any, accountId?: string, toAccountId?: string) => void;
  onEdit: (finance: any) => void;
  onIgnore: (finance: any) => void;
  onViewAll: () => void;
}) {
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, string>>({});
  const [selectedDestinationAccounts, setSelectedDestinationAccounts] = useState<Record<string, string>>({});
  const visibleReviews = reviewFinances.slice(0, 3);
  const luzReviews = reviewFinances.filter(finance => finance.source === 'manual' && finance.needsReview);
  const estimatedReviews = reviewFinances.filter(finance => finance.source === 'catchup_estimate' || finance.confidence === 'estimated' || finance.confidence === 'inferred');

  if (reviewFinances.length === 0) {
    return (
      <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Revision</p>
            <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">Sin pendientes</h3>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
            Caja al dia
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-amber-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-600">Revision</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">{reviewFinances.length} pendiente(s)</h3>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <ReviewMiniStat label="Luz" value={luzReviews.length} />
          <ReviewMiniStat label="Supuestos" value={estimatedReviews.length} />
          <ReviewMiniStat label="Sin cuenta" value={reviewFinances.filter(finance => !finance.accountId).length} />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {visibleReviews.map(finance => {
          const selectedAccount = selectedAccounts[finance.id] ?? finance.accountId ?? '';
          const selectedDestinationAccount = selectedDestinationAccounts[finance.id] ?? finance.toAccountId ?? '';
          const account = accounts.find(item => item.id === selectedAccount);

          return (
            <article key={finance.id} className="rounded-[1.5rem] border border-amber-100 bg-amber-50/70 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-neutral-950">{finance.description || finance.category || 'Movimiento'}</p>
                  <p className="mt-1 text-sm font-black text-neutral-700">
                    {Number(finance.amount || 0).toLocaleString()} {finance.currency || 'ARS'}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase tracking-widest text-amber-700">
                  {finance.confidence || finance.source || 'review'}
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-amber-700">Cuenta</label>
                <select
                  value={selectedAccount}
                  onChange={(event) => setSelectedAccounts(prev => ({ ...prev, [finance.id]: event.target.value }))}
                  className="w-full rounded-2xl border border-amber-100 bg-white px-3 py-3 text-sm font-bold text-neutral-900 outline-none"
                >
                  <option value="">Sin cuenta</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                  ))}
                </select>
                {finance.type === 'transfer' && (
                  <>
                    <label className="text-[10px] font-black uppercase tracking-widest text-amber-700">Destino</label>
                    <select
                      value={selectedDestinationAccount}
                      onChange={(event) => setSelectedDestinationAccounts(prev => ({ ...prev, [finance.id]: event.target.value }))}
                      className="w-full rounded-2xl border border-amber-100 bg-white px-3 py-3 text-sm font-bold text-neutral-900 outline-none"
                    >
                      <option value="">Sin destino</option>
                      {accounts.map(account => (
                        <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                      ))}
                    </select>
                  </>
                )}
                <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  <span>{finance.category || 'Sin categoria'}</span>
                  {finance.paymentType && <span>{finance.paymentType}</span>}
                  {account?.type && <span>{account.type}</span>}
                </div>
              </div>

              {finance.estimatedReason && (
                <p className="mt-3 rounded-2xl bg-white/70 p-3 text-xs font-semibold leading-5 text-amber-800">
                  {finance.estimatedReason}
                </p>
              )}

              {finance.duplicateReason && (
                <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-semibold leading-5 text-red-800">
                  Posible duplicado: {finance.duplicateReason}
                </p>
              )}

              <div className="mt-4 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onConfirm(finance, selectedAccount, selectedDestinationAccount)}
                  className="rounded-2xl bg-neutral-950 px-3 py-2 text-xs font-black text-white transition hover:bg-neutral-800"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(finance)}
                  className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-neutral-700 transition hover:bg-amber-100"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => onIgnore(finance)}
                  className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-neutral-400 transition hover:bg-white/70"
                >
                  Ignorar
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {reviewFinances.length > 3 && (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-4 w-full rounded-2xl border border-neutral-200 py-3 text-xs font-black uppercase tracking-widest text-neutral-500 transition hover:bg-neutral-50"
        >
          Ver todos los pendientes
        </button>
      )}
    </section>
  );
}

function ReviewMiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-neutral-50 px-4 py-3">
      <p className="text-xl font-black text-neutral-950">{value}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
    </div>
  );
}

function ImportReviewStat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'warn' | 'danger' | 'info' }) {
  const toneClass = {
    neutral: 'border-white bg-white text-neutral-950',
    warn: 'border-amber-200 bg-amber-100 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-blue-100 bg-blue-50 text-blue-800',
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-1 text-[9px] font-black uppercase tracking-widest opacity-70">{label}</p>
    </div>
  );
}

function PendingImportGroupsPanel({
  groups,
  accounts,
  categories,
  onApplyAccounts,
  onApplyCategory,
  onConfirmGroup,
  onDiscardGroup,
  onLinkGroup,
}: {
  groups: PendingImportGroup[];
  accounts: any[];
  categories: any[];
  onApplyAccounts: (group: PendingImportGroup, accountId: string, toAccountId?: string) => void;
  onApplyCategory: (group: PendingImportGroup, updates: { category: string; subCategory?: string; subSubCategory?: string; isFixed?: boolean }) => void;
  onConfirmGroup: (group: PendingImportGroup, forceDuplicates?: boolean) => void;
  onDiscardGroup: (group: PendingImportGroup) => void;
  onLinkGroup: (group: PendingImportGroup) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, { accountId: string; toAccountId: string; category: string; subCategory: string; isFixed: boolean }>>({});
  if (groups.length === 0) return null;

  const updateDraft = (groupKey: string, patch: Partial<{ accountId: string; toAccountId: string; category: string; subCategory: string; isFixed: boolean }>) => {
    setDrafts(prev => ({
      ...prev,
      [groupKey]: {
        accountId: prev[groupKey]?.accountId || '',
        toAccountId: prev[groupKey]?.toAccountId || '',
        category: prev[groupKey]?.category || '',
        subCategory: prev[groupKey]?.subCategory || '',
        isFixed: prev[groupKey]?.isFixed || false,
        ...patch,
      },
    }));
  };

  return (
    <section className="rounded-2xl border border-amber-100 bg-white/80 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Resolver por grupos</p>
          <h3 className="mt-1 text-lg font-black text-neutral-950">Acciones rapidas sobre movimientos parecidos</h3>
        </div>
        <p className="max-w-xl text-xs font-semibold leading-5 text-amber-800">
          Usalo para descartar duplicados o asignar una misma cuenta a varios movimientos. La revision individual queda abajo como respaldo.
        </p>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {groups.map(group => {
          const draft = drafts[group.key] || {
            accountId: group.sample.accountId || '',
            toAccountId: group.sample.toAccountId || '',
            category: group.category || '',
            subCategory: group.subCategory || '',
            isFixed: Boolean(group.sample.isFixed),
          };
          const requiresDestination = group.sample.type === 'transfer';
          const canApplyAccounts = Boolean(draft.accountId && (!requiresDestination || draft.toAccountId));
          const selectedCategory = categories.find(category => category.name === draft.category);
          const subCategories = selectedCategory?.subCategories || [];
          const canApplyCategory = Boolean(draft.category);
          const groupTone = group.kind === 'duplicate'
            ? 'border-red-100 bg-red-50'
            : group.kind === 'missing_account'
              ? 'border-amber-100 bg-amber-50'
              : 'border-neutral-100 bg-neutral-50';

          return (
            <article key={group.key} className={`rounded-2xl border p-4 ${groupTone}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-black text-neutral-950">{group.title}</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-neutral-600">{group.detail}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                    <span>{group.count} movimiento(s)</span>
                    <span>{group.totalAmount.toLocaleString()} {group.currency}</span>
                    <span>{FINANCE_TYPES.find(item => item.id === group.type)?.label || group.type}</span>
                  </div>
                </div>

                {group.kind === 'duplicate' ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onDiscardGroup(group)}
                      className="rounded-xl bg-red-700 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-red-800"
                    >
                      Descartar grupo
                    </button>
                    {group.transactionIds.length > 0 && group.sample.duplicateOfId && (
                      <button
                        type="button"
                        onClick={() => onLinkGroup(group)}
                        className="rounded-xl bg-neutral-950 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-neutral-800"
                      >
                        Vincular grupo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onConfirmGroup(group, true)}
                      disabled={pendingTransactionNeedsAccount(group.sample)}
                      className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:text-neutral-300"
                    >
                      Guardar igual
                    </button>
                  </div>
                ) : null}
              </div>

              {group.kind !== 'duplicate' && (
                <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
                  <label className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Categoria</span>
                    <select
                      value={draft.category}
                      onChange={event => updateDraft(group.key, { category: event.target.value, subCategory: '' })}
                      className="w-full rounded-xl border border-white bg-white px-3 py-2 text-xs font-black text-neutral-900 outline-none"
                    >
                      <option value="">Elegir categoria</option>
                      {categories.map(category => (
                        <option key={category.id || category.name} value={category.name}>{category.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Subcategoria</span>
                    <select
                      value={draft.subCategory}
                      onChange={event => updateDraft(group.key, { subCategory: event.target.value })}
                      disabled={!draft.category || subCategories.length === 0}
                      className="w-full rounded-xl border border-white bg-white px-3 py-2 text-xs font-black text-neutral-900 outline-none disabled:text-neutral-300"
                    >
                      <option value="">Sin subcategoria</option>
                      {subCategories.map((subcategory: any) => {
                        const name = typeof subcategory === 'string' ? subcategory : subcategory.name;
                        return <option key={name} value={name}>{name}</option>;
                      })}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Cuenta origen</span>
                    <select
                      value={draft.accountId}
                      onChange={event => updateDraft(group.key, { accountId: event.target.value })}
                      className="w-full rounded-xl border border-white bg-white px-3 py-2 text-xs font-black text-neutral-900 outline-none"
                    >
                      <option value="">Elegir cuenta</option>
                      {accounts.map(account => (
                        <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                      ))}
                    </select>
                  </label>

                  {requiresDestination ? (
                    <label className="space-y-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Cuenta destino</span>
                      <select
                        value={draft.toAccountId}
                        onChange={event => updateDraft(group.key, { toAccountId: event.target.value })}
                        className="w-full rounded-xl border border-white bg-white px-3 py-2 text-xs font-black text-neutral-900 outline-none"
                      >
                        <option value="">Elegir destino</option>
                        {accounts.map(account => (
                          <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2">
                      <input
                        type="checkbox"
                        checked={draft.isFixed}
                        onChange={event => updateDraft(group.key, { isFixed: event.target.checked })}
                        className="h-4 w-4 rounded border-neutral-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Fijo</span>
                    </label>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onApplyCategory(group, { category: draft.category, subCategory: draft.subCategory, isFixed: draft.isFixed })}
                      disabled={!canApplyCategory}
                      className="rounded-xl bg-amber-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
                    >
                      Categorizar
                    </button>
                    <button
                      type="button"
                      onClick={() => onApplyAccounts(group, draft.accountId, draft.toAccountId)}
                      disabled={!canApplyAccounts}
                      className="rounded-xl bg-neutral-950 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
                    >
                      Aplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => onConfirmGroup(group)}
                      disabled={!group.canBulkConfirm}
                      className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300"
                    >
                      Guardar grupo
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PendingMeta({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-1 truncate text-xs font-black text-neutral-800">{value || '-'}</p>
    </div>
  );
}

function FinanceDiagnosticPanel({ items }: { items: FinanceDiagnosticItem[] }) {
  const priorityItem = items.find(item => item.actionable && (item.tone === 'danger' || item.tone === 'warn'));
  const okCount = items.filter(item => item.tone === 'ok').length;

  return (
    <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Diagnostico</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">Estado financiero</h3>
        </div>
        <div className="rounded-2xl bg-neutral-950 px-4 py-3 text-white">
          <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Prioridad</p>
          <p className="mt-1 text-sm font-black">
            {priorityItem ? priorityItem.title : 'Sin bloqueos grandes'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map(item => (
          <div key={item.id} className={`rounded-3xl border p-4 ${getFinanceDiagnosticToneClasses(item.tone)}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{item.title}</p>
                <p className="mt-2 text-3xl font-black tracking-tight">{item.value}</p>
              </div>
              <span className="rounded-full bg-white/80 p-2 text-neutral-900 shadow-sm">
                {item.tone === 'ok' ? <Check size={16} /> : item.tone === 'danger' ? <AlertCircle size={16} /> : <Sparkles size={16} />}
              </span>
            </div>
            <p className="mt-3 text-xs font-bold leading-5 opacity-75">{item.detail}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs font-bold text-neutral-500">
        {okCount} de {items.length} senales estan sanas. Lo demas queda como cola de revision, no como trabajo manual innecesario.
      </p>
    </section>
  );
}

function MonthlyFinanceSnapshot({
  insights,
  clarityStats,
  reviewCount,
  accountUsage,
}: {
  insights: ReturnType<typeof buildFinancialInsights>;
  clarityStats: ReturnType<typeof getFinanceCategoryClarityStats>;
  reviewCount: number;
  accountUsage: MonthlyAccountUsage | null;
}) {
  const dashboard = insights.periodDashboard;
  const profile = insights.monthlyProfile;
  const primaryCurrency = dashboard.byCurrency[0] || null;
  const topCategory = dashboard.topCategories[0] || null;
  const topCategoryDelta = dashboard.categoryDeltas[0] || null;
  const topPriority = insights.actionPriorities[0] || null;
  const expenseChange = insights.projection.expenseChangeRealVsPreviousMonth;
  const incomeChange = insights.projection.incomeChangeRealVsPreviousMonth;
  const fixedLike = profile.fixedDeclared + profile.recurringDetected;
  const fixedShare = profile.totalExpenses > 0 ? Math.round((fixedLike / profile.totalExpenses) * 100) : 0;
  const hasData = Boolean(primaryCurrency || profile.totalExpenses || dashboard.topCategories.length);

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
      <div className="rounded-[2rem] border border-neutral-200 bg-neutral-950 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">Este mes</p>
            <h3 className="mt-1 text-2xl font-black tracking-tight">
              {dashboard.month ? formatFinanceMonth(dashboard.month) : 'Todavia sin lectura mensual'}
            </h3>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-950">
            {primaryCurrency?.currency || profile.currency || 'ARS'}
          </span>
        </div>

        {hasData ? (
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <MonthlySnapshotStat
              label="Flujo"
              value={primaryCurrency ? primaryCurrency.net : 0}
              currency={primaryCurrency?.currency || profile.currency}
              tone={(primaryCurrency?.net || 0) >= 0 ? 'positive' : 'negative'}
            />
            <MonthlySnapshotStat
              label="Ingresos"
              value={primaryCurrency ? primaryCurrency.income : 0}
              currency={primaryCurrency?.currency || profile.currency}
              tone="neutral"
            />
            <MonthlySnapshotStat
              label="Gastos"
              value={primaryCurrency ? primaryCurrency.expenses : profile.totalExpenses}
              currency={primaryCurrency?.currency || profile.currency}
              tone="negative"
            />
            <MonthlySnapshotStat
              label="Fijo/recurrente"
              value={fixedShare}
              suffix="%"
              tone={fixedShare >= 65 ? 'warning' : 'neutral'}
            />
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.06] p-5">
            <p className="text-sm font-bold leading-6 text-white/60">
              Cuando cargues movimientos, aca va a aparecer la lectura rapida del mes: flujo, gastos, ingresos y estructura fija.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MonthlySnapshotMiniCard
            label="Mayor rubro"
            value={topCategory ? topCategory.category : 'Sin categoria dominante'}
            detail={topCategory ? `${topCategory.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${topCategory.currency} · ${Math.round(topCategory.share * 100)}%` : 'Falta mas data del mes.'}
          />
          <MonthlySnapshotMiniCard
            label="Cuenta usada"
            value={accountUsage ? accountUsage.accountName : 'Sin cuenta dominante'}
            detail={accountUsage ? formatAccountUsageDetail(accountUsage) : 'Cuando haya gastos con cuenta, VEO muestra por donde salio mas plata.'}
          />
          <MonthlySnapshotMiniCard
            label="Mayor cambio"
            value={topCategoryDelta ? topCategoryDelta.category : 'Sin comparacion'}
            detail={topCategoryDelta ? formatCategoryDeltaDetail(topCategoryDelta) : 'Con dos meses comparables, VEO muestra que rubro cambio mas.'}
          />
          <MonthlySnapshotMiniCard
            label="Proxima accion"
            value={topPriority ? topPriority.title : 'Seguir cargando'}
            detail={topPriority ? topPriority.detail : 'La prioridad aparece cuando VEO detecta una tension concreta.'}
          />
          <MonthlySnapshotMiniCard
            label="Gasto real"
            value={formatRealChangeValue(expenseChange)}
            detail={expenseChange?.read || 'Con mas historial e IPC, VEO compara gasto nominal contra gasto real.'}
          />
          <MonthlySnapshotMiniCard
            label="Ingreso real"
            value={formatRealChangeValue(incomeChange)}
            detail={incomeChange?.read || 'Sirve para ver si tus ingresos suben de verdad o solo nominalmente.'}
          />
          <MonthlySnapshotMiniCard
            label="Calidad"
            value={`${Math.round((1 - (clarityStats.share || 0)) * 100)}% claro`}
            detail={clarityStats.count ? `${clarityStats.count} gasto(s) siguen flojos o inferidos.` : 'Categorias limpias por ahora.'}
          />
          <MonthlySnapshotMiniCard
            label="Pendientes"
            value={String(reviewCount)}
            detail={reviewCount ? 'Hay movimientos para revisar cuando tengas un rato.' : 'Sin movimientos esperando revision.'}
          />
        </div>
      </div>
    </section>
  );
}

function formatRealChangeValue(change?: ReturnType<typeof buildFinancialInsights>['projection']['expenseChangeRealVsPreviousMonth']) {
  if (!change || change.interpretation === 'insufficient_data' || change.realChangeRate == null) return 'Sin data';
  if (change.interpretation === 'stable') return 'Casi igual';
  const percent = Math.round(change.realChangeRate * 100);
  return `${percent > 0 ? '+' : ''}${percent}% real`;
}

function formatCategoryDeltaDetail(delta: ReturnType<typeof buildFinancialInsights>['periodDashboard']['categoryDeltas'][number]) {
  const direction = delta.direction === 'up' ? 'subio' : delta.direction === 'down' ? 'bajo' : 'quedo igual';
  const amount = Math.abs(delta.delta).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const rate = delta.deltaRate == null ? '' : ` (${delta.deltaRate > 0 ? '+' : ''}${Math.round(delta.deltaRate * 100)}%)`;
  return `${direction} ${amount} ${delta.currency}${rate} contra el mes anterior.`;
}

function formatAccountUsageDetail(accountUsage: MonthlyAccountUsage) {
  const amount = accountUsage.amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const share = Math.round(accountUsage.share * 100);
  const type = getAccountTypeLabel(accountUsage.accountType).toLowerCase();
  return `${amount} ${accountUsage.currency} · ${share}% del gasto del mes · ${type}.`;
}

function MonthlySnapshotStat({
  label,
  value,
  currency,
  suffix = '',
  tone,
}: {
  label: string;
  value: number;
  currency?: string;
  suffix?: string;
  tone: 'positive' | 'negative' | 'warning' | 'neutral';
}) {
  const toneClass = {
    positive: 'text-emerald-300',
    negative: 'text-rose-300',
    warning: 'text-amber-300',
    neutral: 'text-white',
  }[tone];

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-4">
      <p className="text-[9px] font-black uppercase tracking-widest text-white/35">{label}</p>
      <p className={`mt-2 text-2xl font-black tracking-tight ${toneClass}`}>
        {suffix ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : `${value >= 0 && tone === 'positive' ? '+' : ''}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        {suffix || (currency ? <span className="ml-1 text-[10px] font-black text-white/35">{currency}</span> : null)}
      </p>
    </div>
  );
}

function MonthlySnapshotMiniCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-3xl border border-neutral-100 bg-neutral-50 p-4">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-2 truncate text-lg font-black text-neutral-950">{value}</p>
      <p className="mt-2 line-clamp-3 text-xs font-bold leading-5 text-neutral-500">{detail}</p>
    </div>
  );
}

function getFinanceDiagnosticToneClasses(tone: FinanceDiagnosticTone) {
  if (tone === 'danger') return 'border-red-200 bg-red-50 text-red-900';
  if (tone === 'warn') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (tone === 'ok') return 'border-emerald-100 bg-emerald-50 text-emerald-900';
  return 'border-neutral-200 bg-neutral-50 text-neutral-900';
}

function TransferTraceCard({ transaction }: { transaction: PendingTransaction }) {
  const hasTrace = transaction.counterpartyName || transaction.counterpartyAlias || transaction.counterpartyAccount || transaction.transferDetail;
  if (!hasTrace) {
    return (
      <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Rastro de transferencia</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-neutral-500">
          El PDF no trajo destinatario, alias o CBU/CVU en una forma clara. Conservamos el concepto original para rastrearlo.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Rastro de transferencia</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PendingMeta label="Destinatario" value={transaction.counterpartyName} />
        <PendingMeta label="Alias" value={transaction.counterpartyAlias} />
        <PendingMeta label="CBU/CVU" value={transaction.counterpartyAccount} />
        <PendingMeta label="Detalle" value={transaction.transferDetail} />
      </div>
    </div>
  );
}

function FinanceCatchupSessionPanel({
  userId,
  pendingCount,
  daysSinceLastUpdate,
  hasNoMovements,
  onOpenCatchupWizard,
}: {
  userId: string;
  pendingCount: number;
  daysSinceLastUpdate: number | null;
  hasNoMovements: boolean;
  onOpenCatchupWizard: () => void;
}) {
  const storageKey = `veo.financeCatchupSessions.${userId}`;
  const [sessions, setSessions] = useState<any[]>(() => readCatchupSessions(storageKey));
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);

  const averageMinutesPerItem = useMemo(() => {
    const usable = sessions.filter(session => session.pendingCount > 0 && session.actualMinutes > 0);
    if (usable.length === 0) return null;
    const average = usable.reduce((sum, session) => sum + (session.actualMinutes / session.pendingCount), 0) / usable.length;
    return Math.max(1, Math.min(15, average));
  }, [sessions]);

  const suggestedMinutes = estimateFinanceCatchupMinutes({
    pendingReviewCount: pendingCount,
    daysSinceLastUpdate,
    averageMinutesPerItem,
  });

  const shouldShow = hasNoMovements || pendingCount > 0 || (daysSinceLastUpdate !== null && daysSinceLastUpdate >= 10);

  const ensureSessionStarted = () => {
    setSessionStartedAt(prev => prev || Date.now());
  };

  const finishSession = () => {
    if (!sessionStartedAt) return;
    const actualMinutes = Math.max(1, Math.round((Date.now() - sessionStartedAt) / 60000));
    const nextSession = {
      id: `finance-catchup-${Date.now()}`,
      type: 'finance_update',
      estimatedMinutes: suggestedMinutes,
      actualMinutes,
      pendingCount,
      daysSinceLastUpdate,
      createdAt: new Date().toISOString(),
    };
    const nextSessions = [nextSession, ...sessions].slice(0, 12);
    setSessions(nextSessions);
    localStorage.setItem(storageKey, JSON.stringify(nextSessions));
    setSessionStartedAt(null);
  };

  if (!shouldShow) return null;

  return (
    <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Puesta al dia</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">{suggestedMinutes} min sugeridos</h3>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <ReviewMiniStat label="Pendientes" value={pendingCount} />
            <ReviewMiniStat label="Dias" value={daysSinceLastUpdate ?? 0} />
            <ReviewMiniStat label="Ritmo" value={averageMinutesPerItem ? Math.round(averageMinutesPerItem) : 3} />
          </div>
        </div>

        <div className="rounded-[1.5rem] bg-neutral-950 p-4 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Acciones</p>
          <p className="mt-2 text-sm font-semibold leading-5 text-white/55">
            {sessionStartedAt ? 'VEO esta midiendo esta puesta al dia en segundo plano.' : 'Empeza por revisar pendientes o cargar un supuesto.'}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={ensureSessionStarted}
              className="rounded-2xl bg-white px-3 py-3 text-xs font-black uppercase tracking-widest text-neutral-950 transition hover:bg-neutral-100"
            >
              Revisar
            </button>
            <button
              type="button"
              onClick={finishSession}
              disabled={!sessionStartedAt}
              className="rounded-2xl border border-white/10 px-3 py-3 text-xs font-black uppercase tracking-widest text-white/60 transition hover:bg-white/10 disabled:opacity-30"
            >
              Listo
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              ensureSessionStarted();
              onOpenCatchupWizard();
            }}
            className="mt-2 w-full rounded-2xl border border-white/10 px-3 py-3 text-xs font-black uppercase tracking-widest text-white/60 transition hover:bg-white/10"
          >
            Cargar supuesto
          </button>
        </div>
      </div>
    </section>
  );
}

function AccountReconciliationPanel({
  items,
  onEditAccount,
}: {
  items: { account: any; reconciliation: ReturnType<typeof getAccountReconciliationInfo> }[];
  onEditAccount: (account: any) => void;
}) {
  if (!items.length) return null;

  const topItems = items.slice(0, 4);

  return (
    <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Saldos</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">Cuentas a conciliar</h3>
        </div>
        <p className="max-w-xl text-xs font-bold leading-5 text-neutral-500">
          Antes de leer caja o patrimonio, conviene que estos saldos reflejen la realidad.
        </p>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {topItems.map(({ account, reconciliation }) => (
          <button
            key={account.id}
            type="button"
            onClick={() => onEditAccount(account)}
            className="rounded-3xl border border-neutral-100 bg-neutral-50 p-4 text-left transition hover:border-neutral-300 hover:bg-white"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-neutral-950">{account.name}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  {getAccountTypeLabel(account.type)} · {account.currency || 'ARS'}
                </p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
                reconciliation.tone === 'danger'
                  ? 'bg-red-50 text-red-700'
                  : reconciliation.tone === 'warn'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-neutral-100 text-neutral-500'
              }`}>
                {reconciliation.label}
              </span>
            </div>
            <p className="mt-4 text-2xl font-black text-neutral-950">
              {formatAccountBalance(Number(account.balance || 0), account.type)}
              <span className="ml-1 text-xs font-bold text-neutral-400">{account.currency}</span>
            </p>
            <p className="mt-2 text-xs font-semibold leading-5 text-neutral-500">{reconciliation.helper}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function BalanceIntegrityPanel({
  issues,
  accounts,
  onApplyBalance,
  onEdit,
}: {
  issues: BalanceIntegrityIssue[];
  accounts: any[];
  onApplyBalance: (finance: any) => void;
  onEdit: (finance: any) => void;
}) {
  if (!issues.length) return null;

  const topIssues = issues.slice(0, 5);

  return (
    <section className="rounded-[2rem] border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-700">Auditoria</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">Movimientos a revisar</h3>
        </div>
        <p className="max-w-xl text-xs font-bold leading-5 text-amber-800">
          VEO encontro movimientos que pueden afectar la confianza del saldo. Conviene resolverlos antes de leer caja o patrimonio.
        </p>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {topIssues.map(issue => {
          const finance = issue.finance;
          const sourceAccount = accounts.find(account => account.id === (finance.sourceAccountId || finance.accountId));
          const destinationAccount = accounts.find(account => account.id === finance.toAccountId);
          const date = parseFinanceDateValue(finance.date);

          return (
            <div key={issue.id} className="rounded-3xl border border-amber-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-neutral-950">{issue.title}</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-neutral-500">{issue.helper}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-amber-800">
                  Revisar
                </span>
              </div>

              <div className="mt-4 rounded-2xl bg-neutral-50 p-3">
                <p className="text-lg font-black text-neutral-950">
                  {Number(finance.amount || 0).toLocaleString()} <span className="text-xs font-bold text-neutral-400">{finance.currency || 'ARS'}</span>
                </p>
                <p className="mt-1 text-sm font-bold text-neutral-700">{finance.description || 'Sin descripcion'}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <PendingMeta label="Fecha" value={date ? date.toLocaleDateString('es-AR') : 'Sin fecha'} />
                  <PendingMeta label="Tipo" value={finance.type || finance.kind || 'expense'} />
                  <PendingMeta label="Origen" value={sourceAccount?.name || 'Sin cuenta'} />
                  <PendingMeta label="Destino" value={destinationAccount?.name} />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => onEdit(finance)}
                  className="rounded-2xl border border-neutral-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-neutral-600 transition hover:border-neutral-400"
                >
                  Editar
                </button>
                {issue.canApplyBalance && (
                  <button
                    type="button"
                    onClick={() => onApplyBalance(finance)}
                    className="rounded-2xl bg-neutral-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800"
                  >
                    Aplicar saldo
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {issues.length > topIssues.length && (
        <p className="mt-3 text-xs font-bold text-amber-800">
          Hay {issues.length - topIssues.length} movimiento(s) mas con revision pendiente.
        </p>
      )}
    </section>
  );
}

function FinancialInsightsPanel({
  insights,
  onMarkRecurringAsFixed,
}: {
  insights: ReturnType<typeof buildFinancialInsights>;
  onMarkRecurringAsFixed: (insight: ReturnType<typeof buildFinancialInsights>['recurringDetected'][number]) => void;
}) {
  const topRecurring = insights.recurringDetected.slice(0, 4);
  const topFixed = insights.fixedDeclared.slice(0, 3);
  const topUnusual = insights.unusualExpenses.slice(0, 3);
  const topPriorities = insights.actionPriorities.slice(0, 4);
  const profile = insights.monthlyProfile;
  const dashboard = insights.periodDashboard;
  const fixedLike = profile.fixedDeclared + profile.recurringDetected;
  const fixedShare = profile.totalExpenses > 0 ? fixedLike / profile.totalExpenses : 0;
  const variableShare = profile.totalExpenses > 0 ? profile.variable / profile.totalExpenses : 0;

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
      <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Lectura del mes</p>
            <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">
              {dashboard.month ? formatFinanceMonth(dashboard.month) : 'Sin periodo suficiente'}
            </h3>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500">
            {dashboard.currency}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {dashboard.byCurrency.length > 0 ? dashboard.byCurrency.map(item => (
            <PeriodCurrencyCard key={item.currency} item={item} />
          )) : (
            <div className="rounded-2xl bg-neutral-50 p-4 md:col-span-3">
              <p className="text-sm font-bold leading-6 text-neutral-500">Todavia falta cargar movimientos para leer el periodo.</p>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="rounded-[1.5rem] border border-neutral-100 bg-neutral-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">Luz</p>
            <p className="mt-2 text-sm font-bold leading-6 text-neutral-800">{insights.luzRead}</p>
          </div>
          <div className="rounded-[1.5rem] border border-neutral-100 bg-white p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">Estructura</p>
            <p className="mt-2 text-3xl font-black text-neutral-950">{Math.round(fixedShare * 100)}%</p>
            <p className="mt-1 text-xs font-bold text-neutral-500">fijo o recurrente</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-neutral-950" style={{ width: `${Math.min(100, Math.round(fixedShare * 100))}%` }} />
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <ExpenseProfileStat label="Fijo declarado" value={profile.fixedDeclared} currency={profile.currency} />
          <ExpenseProfileStat label="Recurrente detectado" value={profile.recurringDetected} currency={profile.currency} />
          <ExpenseProfileStat label={`Variable (${Math.round(variableShare * 100)}%)`} value={profile.variable} currency={profile.currency} />
          <ExpenseProfileStat label="Extraordinario" value={profile.unusual} currency={profile.currency} />
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-neutral-100 bg-neutral-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">Que corregir primero</p>
            <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase tracking-widest text-neutral-400 border border-neutral-100">
              Priorizado
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {topPriorities.map(priority => (
              <FinancePriorityCard key={priority.id} priority={priority} />
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <InsightList
            title="Categorias que mas pesaron"
            empty="Sin gastos del periodo"
            items={dashboard.topCategories.map(item => ({
              title: item.category,
              detail: `${item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${item.currency} - ${Math.round(item.share * 100)}% del gasto`,
            }))}
          />
          <div className="rounded-[1.5rem] border border-neutral-100 p-4">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">Nominal vs real</p>
            <div className="space-y-2">
              {[dashboard.realExpenseRead, dashboard.realIncomeRead].filter(Boolean).map(read => (
                <p key={read} className="rounded-2xl bg-neutral-50 p-3 text-sm font-bold leading-6 text-neutral-700">{read}</p>
              ))}
              {!dashboard.realExpenseRead && !dashboard.realIncomeRead && (
                <p className="rounded-2xl bg-neutral-50 p-3 text-sm font-bold leading-6 text-neutral-400">
                  Cuando haya historial e IPC disponible, VEO va a separar subas nominales de subas reales.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <InsightList
            title="Para quien"
            empty="Sin beneficiarios claros"
            items={dashboard.byBeneficiary.map(item => ({
              title: item.label,
              detail: `${item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${item.currency} - ${Math.round(item.share * 100)}% del gasto`,
            }))}
          />
          <InsightList
            title="Scope familiar"
            empty="Sin scope claro"
            items={dashboard.byScope.map(item => ({
              title: formatFinanceScope(item.scope),
              detail: `${item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${item.currency} - ${Math.round(item.share * 100)}% del gasto`,
            }))}
          />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <InsightList
            title="Fijos declarados"
            empty="Sin fijos marcados"
            items={topFixed.map(item => ({
              title: item.label,
              detail: `${item.monthsSeen} mes(es) - ${item.averageAmount.toLocaleString()} ${item.currency}`,
            }))}
          />
          <InsightList
            title="Recurrentes detectados"
            empty="Sin recurrentes nuevos"
            items={topRecurring.map(item => ({
              title: item.label,
              detail: `${item.monthsSeen} mes(es) - ${item.averageAmount.toLocaleString()} ${item.currency}`,
              actionLabel: 'Marcar fijo',
              onAction: () => onMarkRecurringAsFixed(item),
            }))}
          />
          <InsightList
            title="Inusuales"
            empty="Sin alertas claras"
            items={topUnusual.map(item => ({
              title: item.label,
              detail: `${item.amount.toLocaleString()} ${item.currency} - ${item.category}`,
            }))}
          />
        </div>
      </div>

      <div className="rounded-[2rem] border border-neutral-200 bg-neutral-950 p-5 text-white shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Proyeccion</p>
        <h3 className="mt-1 text-2xl font-black tracking-tight">Si seguis igual</h3>
        <div className="mt-5 grid gap-3">
          <ProjectionRow label={`Promedio mensual (${insights.projection.currency})`} value={insights.projection.monthlyNetAverage} />
          <ProjectionRow label={`6 meses (${insights.projection.currency})`} value={insights.projection.projectedNet6Months} />
          <ProjectionRow label={`12 meses (${insights.projection.currency})`} value={insights.projection.projectedNet12Months} />
          {insights.projection.inflationAdjustedExpense6Months && (
            <ProjectionRow label={`Gasto 6 meses con IPC (${insights.projection.currency})`} value={-insights.projection.inflationAdjustedExpense6Months} />
          )}
        </div>
        <p className="mt-5 text-xs font-semibold leading-5 text-white/45">
          Usa el promedio reciente y, cuando esta disponible, el IPC oficial nacional para tensionar la proyeccion.
        </p>
      </div>
    </section>
  );
}

function PeriodCurrencyCard({ item }: { item: { currency: string; income: number; expenses: number; net: number } }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{item.currency}</p>
        <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${item.net >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {item.net >= 0 ? 'positivo' : 'negativo'}
        </span>
      </div>
      <p className={`mt-2 text-2xl font-black ${item.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
        {item.net >= 0 ? '+' : ''}{item.net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-black">
        <span className="text-neutral-400">In {item.income.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        <span className="text-neutral-400">Out {item.expenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
      </div>
    </div>
  );
}

function FinancePriorityCard({ priority }: { priority: ReturnType<typeof buildFinancialInsights>['actionPriorities'][number] }) {
  const priorityClass = {
    high: 'border-rose-100 bg-rose-50 text-rose-700',
    medium: 'border-amber-100 bg-amber-50 text-amber-700',
    low: 'border-neutral-100 bg-white text-neutral-500',
  }[priority.priority];

  return (
    <div className={`rounded-2xl border p-3 ${priorityClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-neutral-950">{priority.title}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-neutral-600">{priority.detail}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[9px] font-black uppercase tracking-widest">
          {priority.priority}
        </span>
      </div>
    </div>
  );
}

function InsightList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { title: string; detail: string; actionLabel?: string; onAction?: () => void }[];
}) {
  return (
    <div className="rounded-[1.5rem] border border-neutral-100 p-4">
      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">{title}</p>
      <div className="space-y-2">
        {items.length > 0 ? items.map(item => (
          <div key={`${item.title}-${item.detail}`} className="rounded-2xl bg-neutral-50 p-3">
            <p className="truncate text-sm font-black text-neutral-900">{item.title}</p>
            <p className="mt-1 text-xs font-semibold text-neutral-500">{item.detail}</p>
            {item.actionLabel && item.onAction && (
              <button
                type="button"
                onClick={item.onAction}
                className="mt-3 rounded-full bg-neutral-950 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-neutral-800"
              >
                {item.actionLabel}
              </button>
            )}
          </div>
        )) : (
          <p className="rounded-2xl bg-neutral-50 p-3 text-sm font-bold text-neutral-400">{empty}</p>
        )}
      </div>
    </div>
  );
}

function ExpenseProfileStat({ label, value, currency }: { label: string; value: number; currency?: string }) {
  return (
    <div className="rounded-[1.25rem] border border-neutral-100 bg-white p-4">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-2 text-xl font-black text-neutral-950">
        {value.toLocaleString(undefined, { maximumFractionDigits: 0 })}{currency ? ` ${currency}` : ''}
      </p>
    </div>
  );
}

function formatFinanceMonth(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Date(year, month - 1, 1).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  });
}

function formatFinanceScope(scope: string) {
  const labels: Record<string, string> = {
    personal: 'Personal',
    pareja: 'Pareja',
    hogar: 'Hogar',
    familia: 'Familia',
  };
  return labels[scope] || scope || 'Familia';
}

function ProjectionRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-white/35">{label}</p>
      <p className={`mt-1 text-3xl font-black tracking-tight ${value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {value >= 0 ? '+' : ''}{value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </p>
    </div>
  );
}

function CategoryLearningGroupsPanel({
  groups,
  categories,
  accounts,
  clarityStats,
  onApply,
}: {
  groups: any[];
  categories: any[];
  accounts: any[];
  clarityStats: ReturnType<typeof getFinanceCategoryClarityStats>;
  onApply: (group: any, draft: {
    category: string;
    subCategory: string;
    subSubCategory: string;
    isFixed: boolean;
    accountId: string;
    toAccountId: string;
    paymentType: string;
    beneficiaryType: string;
    beneficiaryLabel: string;
    scope: string;
    visibility: string;
  }) => void;
}) {
  if (groups.length === 0 && clarityStats.count === 0) return null;
  const hasClarityDebt = clarityStats.count > 0;

  return (
    <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Aprendizaje</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">Corregir grupos similares</h3>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-neutral-500">
            VEO revisa movimientos en Otros, Sin categoria o inferidos para detectar donde el analisis pierde precision.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500">
            {groups.length} grupo(s)
          </span>
          {hasClarityDebt && (
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-700 border border-amber-100">
              {clarityStats.count} poco claros
            </span>
          )}
        </div>
      </div>

      {hasClarityDebt && (
        <div className="mb-4 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="rounded-2xl bg-amber-50 p-4 border border-amber-100">
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Calidad</p>
            <p className="mt-1 text-3xl font-black text-neutral-950">{Math.round(clarityStats.share * 100)}%</p>
            <p className="mt-1 text-xs font-bold text-amber-800">del gasto tiene categoria debil</p>
          </div>
          <div className="rounded-2xl bg-neutral-50 p-4 border border-neutral-100">
            <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Monto afectado</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {clarityStats.totalAmountByCurrency.length > 0 ? clarityStats.totalAmountByCurrency.map(item => (
                <span key={item.currency} className="rounded-full bg-white px-3 py-2 text-xs font-black text-neutral-700 border border-neutral-100">
                  {item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} {item.currency}
                </span>
              )) : (
                <span className="text-xs font-bold text-neutral-400">Sin monto relevante</span>
              )}
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-neutral-500">
              Corregir estos grupos mejora reportes, recurrentes, proyecciones y memoria futura de Luz.
            </p>
          </div>
        </div>
      )}

      {groups.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {groups.map(group => (
            <CategoryLearningGroupCard
              key={group.key}
              group={group}
              categories={categories}
              accounts={accounts}
              onApply={onApply}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-4 text-sm font-bold leading-6 text-neutral-500">
          Hay movimientos poco claros, pero todavia no forman patrones repetidos. Cuando aparezcan similitudes, VEO los va a agrupar para corregirlos de una vez.
        </div>
      )}
    </section>
  );
}

function CategoryLearningGroupCard({
  group,
  categories,
  accounts,
  onApply,
}: {
  group: any;
  categories: any[];
  accounts: any[];
  onApply: (group: any, draft: {
    category: string;
    subCategory: string;
    subSubCategory: string;
    isFixed: boolean;
    accountId: string;
    toAccountId: string;
    paymentType: string;
    beneficiaryType: string;
    beneficiaryLabel: string;
    scope: string;
    visibility: string;
  }) => void;
}) {
  const [draft, setDraft] = useState({
    category: '',
    subCategory: '',
    subSubCategory: '',
    isFixed: false,
    accountId: '',
    toAccountId: '',
    paymentType: '',
    beneficiaryType: '',
    beneficiaryLabel: '',
    scope: '',
    visibility: '',
  });
  const selectedCategory = categories.find(category => category.name === draft.category);
  const canApply = Boolean(
    draft.category ||
    draft.subCategory ||
    draft.subSubCategory ||
    draft.accountId ||
    draft.toAccountId ||
    draft.paymentType ||
    draft.beneficiaryLabel ||
    draft.scope ||
    draft.isFixed,
  );

  return (
    <article className="rounded-[1.5rem] border border-neutral-100 bg-neutral-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="truncate text-base font-black text-neutral-950">{group.label}</p>
          <p className="mt-1 text-xs font-bold text-neutral-500">
            {group.count} movimientos - promedio {group.averageAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} {group.currency}
          </p>
          <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
            Actual: {group.currentCategory || 'Sin categoria'}
          </p>
          {group.reason && (
            <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-amber-600">
              {group.reason}
            </p>
          )}
          <p className="mt-1 text-[10px] font-bold text-neutral-400">
            {[
              group.accountId ? `Cuenta: ${accounts.find(account => account.id === group.accountId)?.name || 'asignada'}` : '',
              group.paymentType ? `Medio: ${group.paymentType}` : '',
              group.beneficiaryLabel ? `Para: ${group.beneficiaryLabel}` : '',
            ].filter(Boolean).join(' · ') || 'Sin contexto operativo claro'}
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500">
          similares
        </span>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <select
          value={draft.category}
          onChange={(event) => setDraft({ ...draft, category: event.target.value, subCategory: '', subSubCategory: '' })}
          className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 text-xs font-black text-neutral-800 outline-none"
        >
          <option value="">Categoria</option>
          {categories.map(category => (
            <option key={category.id} value={category.name}>{category.name}</option>
          ))}
        </select>

        <select
          value={draft.subCategory}
          onChange={(event) => setDraft({ ...draft, subCategory: event.target.value, subSubCategory: '' })}
          disabled={!selectedCategory}
          className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 text-xs font-black text-neutral-800 outline-none disabled:text-neutral-300"
        >
          <option value="">Subcategoria</option>
          {(selectedCategory?.subCategories || []).map((sub: any) => {
            const name = typeof sub === 'string' ? sub : sub.name;
            return <option key={name} value={name}>{name}</option>;
          })}
        </select>

        <select
          value={draft.accountId}
          onChange={(event) => setDraft({ ...draft, accountId: event.target.value })}
          className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 text-xs font-black text-neutral-800 outline-none"
        >
          <option value="">Cuenta usada</option>
          {accounts.map(account => (
            <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
          ))}
        </select>

        <select
          value={draft.paymentType}
          onChange={(event) => setDraft({ ...draft, paymentType: event.target.value })}
          className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 text-xs font-black text-neutral-800 outline-none"
        >
          <option value="">Medio de pago</option>
          {PAYMENT_TYPES.map(paymentType => (
            <option key={paymentType} value={paymentType}>{paymentType}</option>
          ))}
        </select>

        <select
          value={draft.beneficiaryLabel}
          onChange={(event) => {
            const option = FINANCE_BENEFICIARIES.find(item => item.label === event.target.value);
            setDraft({
              ...draft,
              beneficiaryLabel: option?.label || '',
              beneficiaryType: option?.type || '',
              scope: option?.scope || draft.scope,
              visibility: option ? 'household_shared' : draft.visibility,
            });
          }}
          className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 text-xs font-black text-neutral-800 outline-none"
        >
          <option value="">Para</option>
          {FINANCE_BENEFICIARIES.map(item => (
            <option key={`${item.type}-${item.label}`} value={item.label}>{item.label}</option>
          ))}
        </select>

        <select
          value={draft.scope}
          onChange={(event) => setDraft({ ...draft, scope: event.target.value, visibility: event.target.value ? 'household_shared' : draft.visibility })}
          className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 text-xs font-black text-neutral-800 outline-none"
        >
          <option value="">Scope</option>
          <option value="personal">Personal</option>
          <option value="pareja">Pareja</option>
          <option value="hogar">Hogar</option>
          <option value="familia">Familia</option>
        </select>

        <select
          value={draft.toAccountId}
          onChange={(event) => setDraft({ ...draft, toAccountId: event.target.value })}
          className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 text-xs font-black text-neutral-800 outline-none"
        >
          <option value="">Cuenta destino</option>
          {accounts.map(account => (
            <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
          ))}
        </select>

      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-black text-neutral-500">
          <input
            type="checkbox"
            checked={draft.isFixed}
            onChange={(event) => setDraft({ ...draft, isFixed: event.target.checked })}
            className="h-4 w-4 rounded border-neutral-300 text-neutral-900"
          />
          Gasto fijo
        </label>
        <button
          type="button"
          disabled={!canApply}
          onClick={() => onApply(group, draft)}
          className="rounded-2xl bg-neutral-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          Aplicar al grupo
        </button>
      </div>
    </article>
  );
}

function readCatchupSessions(storageKey: string) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}




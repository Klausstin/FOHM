import type { FinanceImportResult, ImportedFinanceTransaction } from './finance.import.ts';

export interface WalletHistoryMerchantInsight {
  merchantKey: string;
  merchantName: string;
  count: number;
  totalByCurrency: Record<string, number>;
  averageByCurrency: Record<string, number>;
  months: string[];
  sourceCategories: string[];
  suggestedCategory: string;
  suggestedSubCategory: string;
  confidence: number;
  sampleDescriptions: string[];
}

export interface WalletHistoryAmountCluster {
  amount: number;
  currency: string;
  count: number;
  merchants: string[];
  categories: string[];
  sampleDescriptions: string[];
}

export interface WalletHistoryLearningReport {
  generatedAt: string;
  source: 'wallet_history';
  totalTransactions: number;
  dateRange: {
    from: string;
    to: string;
  };
  byType: Record<string, number>;
  byCurrency: Record<string, number>;
  originalAccounts: Array<{ name: string; count: number; totalByCurrency: Record<string, number> }>;
  originalCategories: Array<{ name: string; count: number; totalByCurrency: Record<string, number> }>;
  suggestedCategories: Array<{ category: string; subCategory: string; count: number; totalByCurrency: Record<string, number> }>;
  merchantInsights: WalletHistoryMerchantInsight[];
  recurringCandidates: WalletHistoryMerchantInsight[];
  exactAmountClusters: WalletHistoryAmountCluster[];
  mappingSeeds: Array<{
    merchantKey: string;
    merchantName: string;
    originalDescription: string;
    mappedDescription: string;
    category: string;
    subCategory: string;
    sourceCategories: string[];
    useCount: number;
    confidence: number;
  }>;
}

export function buildWalletHistoryLearningReport(importResult: FinanceImportResult): WalletHistoryLearningReport {
  const transactions = importResult.transactions.filter(isWalletHistoryTransaction);
  const sortedByDate = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const merchantInsights = buildMerchantInsights(transactions);

  return {
    generatedAt: new Date().toISOString(),
    source: 'wallet_history',
    totalTransactions: transactions.length,
    dateRange: {
      from: sortedByDate[0]?.date || '',
      to: sortedByDate[sortedByDate.length - 1]?.date || '',
    },
    byType: countBy(transactions, transaction => transaction.type),
    byCurrency: countBy(transactions, transaction => transaction.currency || 'ARS'),
    originalAccounts: summarizeLabel(transactions, transaction => transaction.sourceAccountLabel || 'Sin cuenta Wallet'),
    originalCategories: summarizeLabel(transactions, transaction => transaction.sourceCategoryLabel || 'Sin categoria Wallet'),
    suggestedCategories: summarizeSuggestedCategories(transactions),
    merchantInsights,
    recurringCandidates: merchantInsights
      .filter(insight => insight.count >= 3 && insight.months.length >= 3)
      .slice(0, 80),
    exactAmountClusters: buildExactAmountClusters(transactions),
    mappingSeeds: merchantInsights
      .filter(insight => insight.count >= 2 && insight.confidence >= 0.72 && insight.suggestedCategory !== 'Otros')
      .slice(0, 200)
      .map(insight => ({
        merchantKey: insight.merchantKey,
        merchantName: insight.merchantName,
        originalDescription: insight.sampleDescriptions[0] || insight.merchantName,
        mappedDescription: insight.merchantName,
        category: insight.suggestedCategory,
        subCategory: insight.suggestedSubCategory,
        sourceCategories: insight.sourceCategories,
        useCount: insight.count,
        confidence: insight.confidence,
      })),
  };
}

export function formatWalletHistoryLearningReportMarkdown(report: WalletHistoryLearningReport) {
  const lines = [
    '# Wallet history learning report',
    '',
    `Generated: ${report.generatedAt}`,
    `Transactions: ${report.totalTransactions}`,
    `Date range: ${formatDate(report.dateRange.from)} to ${formatDate(report.dateRange.to)}`,
    '',
    '## How VEO should use this',
    '',
    '- Treat this as historical learning, not current cash truth.',
    '- Do not apply these movements to account balances.',
    '- Use merchants, categories, repeated amounts and recurring candidates to improve future classification.',
    '- Ask before linking a future/imported movement to one of these historical patterns.',
    '',
    '## Top original Wallet categories',
    '',
    ...report.originalCategories.slice(0, 20).map(item => `- ${item.name}: ${item.count}`),
    '',
    '## Top suggested VEO categories',
    '',
    ...report.suggestedCategories.slice(0, 20).map(item => `- ${item.category} / ${item.subCategory}: ${item.count}`),
    '',
    '## Recurring candidates',
    '',
    ...report.recurringCandidates.slice(0, 30).map(item =>
      `- ${item.merchantName}: ${item.count} movements across ${item.months.length} months -> ${item.suggestedCategory} / ${item.suggestedSubCategory}`,
    ),
    '',
    '## Exact amount clusters',
    '',
    ...report.exactAmountClusters.slice(0, 30).map(item =>
      `- ${item.amount} ${item.currency}: ${item.count} movements, merchants: ${item.merchants.slice(0, 5).join(', ') || 'n/a'}`,
    ),
    '',
    '## Mapping seeds',
    '',
    ...report.mappingSeeds.slice(0, 50).map(seed =>
      `- ${seed.merchantName}: ${seed.category} / ${seed.subCategory} (${seed.useCount})`,
    ),
    '',
  ];

  return lines.join('\n');
}

function isWalletHistoryTransaction(transaction: ImportedFinanceTransaction) {
  return transaction.importSource === 'wallet_history' || transaction.importMode === 'historical_learning';
}

function buildMerchantInsights(transactions: ImportedFinanceTransaction[]): WalletHistoryMerchantInsight[] {
  const groups = new Map<string, ImportedFinanceTransaction[]>();

  transactions.forEach(transaction => {
    const key = transaction.merchantKey || normalizeKey(transaction.merchantName || transaction.description);
    if (!key) return;
    const existing = groups.get(key) || [];
    existing.push(transaction);
    groups.set(key, existing);
  });

  return [...groups.entries()]
    .map(([merchantKey, group]) => {
      const totalByCurrency = sumByCurrency(group);
      const categoryCounts = countBy(group, transaction => `${transaction.category || 'Otros'}\u0000${transaction.subCategory || 'Otros'}`);
      const [category, subCategory] = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])[0][0]
        .split('\u0000');

      return {
        merchantKey,
        merchantName: mostCommon(group.map(transaction => transaction.merchantName || transaction.description)) || merchantKey,
        count: group.length,
        totalByCurrency,
        averageByCurrency: Object.fromEntries(
          Object.entries(totalByCurrency).map(([currency, total]) => [
            currency,
            roundMoney(total / group.filter(transaction => (transaction.currency || 'ARS') === currency).length),
          ]),
        ),
        months: uniqueSorted(group.map(transaction => monthKey(transaction.date)).filter(Boolean)),
        sourceCategories: uniqueSorted(group.map(transaction => transaction.sourceCategoryLabel || '').filter(Boolean)).slice(0, 8),
        suggestedCategory: category || 'Otros',
        suggestedSubCategory: subCategory || 'Otros',
        confidence: roundMoney(Math.max(...group.map(transaction => transaction.confidence || 0))),
        sampleDescriptions: uniqueSorted(group.map(transaction => transaction.description).filter(Boolean)).slice(0, 5),
      };
    })
    .sort((a, b) => b.count - a.count);
}

function buildExactAmountClusters(transactions: ImportedFinanceTransaction[]): WalletHistoryAmountCluster[] {
  const groups = new Map<string, ImportedFinanceTransaction[]>();

  transactions
    .filter(transaction => transaction.type === 'expense')
    .forEach(transaction => {
      const currency = transaction.currency || 'ARS';
      const key = `${currency}:${roundMoney(transaction.amount).toFixed(2)}`;
      const existing = groups.get(key) || [];
      existing.push(transaction);
      groups.set(key, existing);
    });

  return [...groups.entries()]
    .map(([, group]) => ({
      amount: roundMoney(group[0].amount),
      currency: group[0].currency || 'ARS',
      count: group.length,
      merchants: uniqueSorted(group.map(transaction => transaction.merchantName || '').filter(Boolean)).slice(0, 10),
      categories: uniqueSorted(group.map(transaction => transaction.sourceCategoryLabel || transaction.category || '').filter(Boolean)).slice(0, 10),
      sampleDescriptions: uniqueSorted(group.map(transaction => transaction.description).filter(Boolean)).slice(0, 5),
    }))
    .filter(cluster => cluster.count >= 3)
    .sort((a, b) => b.count - a.count);
}

function summarizeLabel(transactions: ImportedFinanceTransaction[], getLabel: (transaction: ImportedFinanceTransaction) => string) {
  const groups = new Map<string, ImportedFinanceTransaction[]>();
  transactions.forEach(transaction => {
    const label = getLabel(transaction);
    const existing = groups.get(label) || [];
    existing.push(transaction);
    groups.set(label, existing);
  });

  return [...groups.entries()]
    .map(([name, group]) => ({
      name,
      count: group.length,
      totalByCurrency: sumByCurrency(group),
    }))
    .sort((a, b) => b.count - a.count);
}

function summarizeSuggestedCategories(transactions: ImportedFinanceTransaction[]) {
  const groups = new Map<string, ImportedFinanceTransaction[]>();
  transactions.forEach(transaction => {
    const key = `${transaction.category || 'Otros'}\u0000${transaction.subCategory || 'Otros'}`;
    const existing = groups.get(key) || [];
    existing.push(transaction);
    groups.set(key, existing);
  });

  return [...groups.entries()]
    .map(([key, group]) => {
      const [category, subCategory] = key.split('\u0000');
      return {
        category,
        subCategory,
        count: group.length,
        totalByCurrency: sumByCurrency(group),
      };
    })
    .sort((a, b) => b.count - a.count);
}

function sumByCurrency(transactions: ImportedFinanceTransaction[]) {
  return transactions.reduce<Record<string, number>>((totals, transaction) => {
    const currency = transaction.currency || 'ARS';
    totals[currency] = roundMoney((totals[currency] || 0) + transaction.amount);
    return totals;
  }, {});
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = getKey(item) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function mostCommon(values: string[]) {
  return Object.entries(countBy(values, value => value))
    .sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function monthKey(date: string) {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(date: string) {
  if (!date) return 'n/a';
  return date.slice(0, 10);
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

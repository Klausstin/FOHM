export function isCreditCardAccount(account?: { type?: string } | null) {
  return account?.type === 'credit_card';
}

export type AccountImportMatchConfidence = 'high' | 'medium' | 'low';

export interface AccountImportMatch {
  account?: any;
  confidence: AccountImportMatchConfidence;
  reason: string;
  score: number;
}

export function findBestAccountForImportedTransaction(transaction: any, accounts: any[]): AccountImportMatch {
  const candidates = (accounts || [])
    .map(account => scoreImportedAccountMatch(transaction, account))
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best || best.score < 4) {
    return {
      confidence: 'low',
      reason: 'No encontre una cuenta suficientemente parecida al resumen importado.',
      score: best?.score || 0,
    };
  }

  const second = candidates[1];
  if (second && best.score - second.score <= 1) {
    return {
      confidence: 'low',
      reason: `Hay cuentas demasiado parecidas: ${best.account?.name || 'cuenta'} y ${second.account?.name || 'otra cuenta'}.`,
      score: best.score,
    };
  }

  return {
    account: best.account,
    confidence: best.score >= 8 ? 'high' : 'medium',
    reason: buildAccountMatchReason(transaction, best.account),
    score: best.score,
  };
}

function scoreImportedAccountMatch(transaction: any, account: any): AccountImportMatch {
  const source = String(transaction.importSource || '').toLowerCase();
  const accountText = normalizeAccountText([
    account.name,
    account.type,
    account.currency,
    account.institution,
    account.statementLabel,
    account.accountNumberLast4,
    account.alias,
    account.notes,
  ].filter(Boolean).join(' '));
  const statementText = normalizeAccountText([
    transaction.statementAccountLabel,
    transaction.fileName,
    transaction.description,
    transaction.originalDescription,
  ].filter(Boolean).join(' '));
  let score = 0;

  if (source.includes('bbva')) {
    if (accountText.includes('bbva')) score += 3;
    if (statementText.includes('bbva') && accountText.includes('bbva')) score += 1;
  }

  if (source.includes('visa')) {
    if (account.type === 'credit_card') score += 3;
    else score -= 8;
    if (accountText.includes('visa')) score += 5;
    if (accountText.includes('mastercard') || accountText.includes('master') || accountText.includes('mc')) score -= 4;
    if (account.currency === 'ARS') score += 1;
  }

  if (source.includes('caja_ahorro')) {
    if (account.type === 'credit_card') score -= 10;
    if (account.type === 'bank') score += 3;
    if (account.currency === 'ARS') score += 2;
    if (accountText.includes('caja')) score += 4;
    if (accountText.includes('ahorro')) score += 3;
    if (accountText.includes('sueldo')) score += 2;
  }

  if (transaction.currency && account.currency === transaction.currency) score += 1;
  if (statementText && accountText && accountText.includes(statementText)) score += 2;

  return {
    account,
    confidence: score >= 8 ? 'high' : score >= 4 ? 'medium' : 'low',
    reason: buildAccountMatchReason(transaction, account),
    score,
  };
}

function buildAccountMatchReason(transaction: any, account: any) {
  const source = String(transaction.importSource || '').replace(/_/g, ' ');
  const label = account?.statementLabel || account?.institution || account?.name || 'cuenta';
  return source ? `Coincide con ${label} para ${source}.` : `Coincide con ${label}.`;
}

function normalizeAccountText(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/credito/g, 'credit')
    .replace(/master card/g, 'mastercard')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getAccountBalanceDelta(input: {
  accountType?: string;
  transactionType: string;
  amount: number;
  direction: 'source' | 'destination';
}) {
  const signedAmount = Math.abs(Number(input.amount || 0));

  if (input.accountType === 'credit_card') {
    if (input.direction === 'source') {
      if (input.transactionType === 'expense') return -signedAmount;
      if (input.transactionType === 'income') return signedAmount;
      if (input.transactionType === 'transfer') return signedAmount;
    }

    if (input.direction === 'destination') {
      if (input.transactionType === 'transfer') return signedAmount;
      return signedAmount;
    }
  }

  if (input.direction === 'source') {
    if (input.transactionType === 'income') return signedAmount;
    if (input.transactionType === 'expense' || input.transactionType === 'transfer') return -signedAmount;
  }

  if (input.direction === 'destination') {
    return signedAmount;
  }

  return 0;
}

export function formatAccountBalance(balance: number, accountType?: string) {
  if (accountType === 'credit_card') {
    return balance < 0 ? `Deuda ${Math.abs(balance).toLocaleString()}` : `Disponible ${balance.toLocaleString()}`;
  }

  return balance.toLocaleString();
}

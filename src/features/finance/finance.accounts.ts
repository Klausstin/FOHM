export function isCreditCardAccount(account?: { type?: string } | null) {
  return account?.type === 'credit_card';
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

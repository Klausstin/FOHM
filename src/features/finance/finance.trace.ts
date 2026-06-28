// Parseo del "rastro" (trace) de un movimiento: la nota estructurada que deja
// la importación con concepto original, contraparte, cuotas, comprobante, etc.
// Extraído de FinanceTracker.tsx (Fase A del refactor).
import type { ParsedFinanceTrace } from './finance.importTypes';

export function parseFinanceTraceNote(note?: string): ParsedFinanceTrace {
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
      else if (label === 'cuotas') trace.installmentLabel = value;
      else if (label === 'tarjeta') trace.cardLast4 = value;
      else if (label === 'comprobante') trace.voucherNumber = value;
      else if (label === 'detalle tarjeta debito' || label === 'detalle tarjeta débito') trace.debitCardDetailLine = value;
      else if (label === 'linea resumen' || label === 'línea resumen') trace.sourceLine = value;
      else if (label.startsWith('conciliado con')) trace.reconciliations.push(line);
      else trace.otherLines.push(line);
    });

  return trace;
}

export function hasFinanceTrace(trace: ParsedFinanceTrace, finance: any) {
  return Boolean(
    trace.originalConcept ||
    trace.transferDetail ||
    trace.counterpartyName ||
    trace.counterpartyAlias ||
    trace.counterpartyAccount ||
    trace.importedFile ||
    trace.installmentLabel ||
    trace.cardLast4 ||
    trace.voucherNumber ||
    trace.debitCardDetailLine ||
    trace.sourceLine ||
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

export function inferStatementMerchant(finance: any, trace: ParsedFinanceTrace) {
  const storedMerchant = finance.merchantName || finance.merchant;
  if (storedMerchant) return storedMerchant;

  const sourceText = [
    trace.sourceLine,
    trace.originalConcept,
    finance.originalDescription,
    finance.description,
  ].filter(Boolean).join(' ');

  const directMerchant = /\b(RAPIPAGO[A-Z0-9._-]*|PAGOFACIL[A-Z0-9._-]*|MERCADOPAGO[A-Z0-9._-]*|MP\s*[A-Z0-9._-]+)\b/i.exec(sourceText);
  if (directMerchant?.[1]) return directMerchant[1].replace(/\s+/g, ' ').trim();

  const ignored = new Set([
    'PAGO',
    'CON',
    'VISA',
    'DEBITO',
    'DEBITO',
    'DIRECTO',
    'OPERACION',
    'EFECTIVO',
    'TARJE',
    'CUENTA',
    'CA',
    'ARS',
    'BBVA',
  ]);
  const candidates = sourceText.match(/\b[A-ZÁÉÍÓÚÑ]{3,}[A-Z0-9._-]*\b/g) || [];
  return candidates.find(candidate => !ignored.has(candidate.toUpperCase()));
}

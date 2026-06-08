import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFinanceCsvText } from '../src/features/finance/finance.import.ts';
import {
  buildWalletHistoryLearningReport,
  formatWalletHistoryLearningReportMarkdown,
} from '../src/features/finance/finance.walletHistory.ts';

const defaultInputPath = path.join(process.cwd(), '.veo-local-imports', 'wallet_records.csv');
const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultInputPath;
const outputDir = path.join(process.cwd(), '.veo-local-imports');
const jsonOutputPath = path.join(outputDir, 'wallet_history_learning_report.json');
const markdownOutputPath = path.join(outputDir, 'wallet_history_learning_report.md');
const candidatesOutputPath = path.join(outputDir, 'wallet_active_memory_candidates.json');

const csvText = await fs.readFile(inputPath, 'utf8');
const importResult = parseFinanceCsvText(csvText, path.basename(inputPath));

if (importResult.source !== 'wallet_history') {
  throw new Error(`El archivo no parece ser un export de Wallet. Fuente detectada: ${importResult.source}`);
}

const report = buildWalletHistoryLearningReport(importResult);

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2), 'utf8');
await fs.writeFile(markdownOutputPath, formatWalletHistoryLearningReportMarkdown(report), 'utf8');
await fs.writeFile(
  candidatesOutputPath,
  JSON.stringify(report.activeMemoryCandidates.filter(candidate => candidate.recommendation !== 'ignore'), null, 2),
  'utf8',
);

console.log(`Wallet history parsed: ${report.totalTransactions} movimientos`);
console.log(`Rango: ${report.dateRange.from.slice(0, 10)} -> ${report.dateRange.to.slice(0, 10)}`);
console.log(`Comercios/patrones: ${report.merchantInsights.length}`);
console.log(`Candidatos recurrentes: ${report.recurringCandidates.length}`);
console.log(`Clusters por monto exacto: ${report.exactAmountClusters.length}`);
console.log(`Candidatos para memoria activa: ${report.activeMemoryCandidates.filter(candidate => candidate.recommendation === 'activate').length}`);
console.log(`Candidatos para revisar: ${report.activeMemoryCandidates.filter(candidate => candidate.recommendation === 'review').length}`);
console.log(`Reporte JSON: ${jsonOutputPath}`);
console.log(`Reporte Markdown: ${markdownOutputPath}`);
console.log(`Candidatos: ${candidatesOutputPath}`);

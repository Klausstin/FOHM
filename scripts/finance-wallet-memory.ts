import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { buildFinanceLearningKey } from '../src/features/finance/finance.taxonomy.ts';
import type { WalletHistoryActiveMemoryCandidate } from '../src/features/finance/finance.walletHistory.ts';

interface WalletMemoryArgs {
  apply: boolean;
  email?: string;
  uid?: string;
  householdId?: string;
  limit: number;
}

interface WalletMemoryMappingPreview {
  originalDescription: string;
  mappedDescription: string;
  category: string;
  subCategory: string;
  kind: 'expense';
  merchantName: string;
  merchantKey: string;
  learningKey: string;
  useCount: number;
  source: 'wallet_history';
  confidence: number;
  sourceCategories: string[];
  sampleDescriptions: string[];
}

const args = parseArgs(process.argv.slice(2));
const outputDir = path.join(process.cwd(), '.veo-local-imports');
const candidatesPath = path.join(outputDir, 'wallet_active_memory_candidates.json');
const previewJsonPath = path.join(outputDir, 'wallet_memory_mappings_preview.json');
const previewMarkdownPath = path.join(outputDir, 'wallet_memory_mappings_preview.md');

const candidates = JSON.parse(await fs.readFile(candidatesPath, 'utf8')) as WalletHistoryActiveMemoryCandidate[];
const activeCandidates = candidates
  .filter(candidate => candidate.recommendation === 'activate')
  .slice(0, args.limit);

const mappingPreviews = activeCandidates.map(toMappingPreview);

await fs.writeFile(previewJsonPath, JSON.stringify(mappingPreviews, null, 2), 'utf8');
await fs.writeFile(previewMarkdownPath, formatMappingPreviewMarkdown(mappingPreviews), 'utf8');

console.log(`Candidatos activos leidos: ${activeCandidates.length}`);
console.log(`Preview JSON: ${previewJsonPath}`);
console.log(`Preview Markdown: ${previewMarkdownPath}`);

if (!args.apply) {
  console.log('Modo preview. No escribi en Firestore. Para aplicar, usar --apply con --email o --uid/--household.');
  process.exit(0);
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId: firebaseConfig.projectId });
}

const db = getFirestore(firebaseConfig.firestoreDatabaseId);
const userContext = await resolveUserContext(args);
const existingMappings = await db.collection('mappings')
  .where('householdId', '==', userContext.householdId)
  .get();

const existingByMerchant = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
const existingByLearningKey = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();

existingMappings.docs.forEach(doc => {
  const data = doc.data();
  if (data.merchantKey) existingByMerchant.set(data.merchantKey, doc);
  if (data.learningKey) existingByLearningKey.set(data.learningKey, doc);
});

let created = 0;
let updated = 0;

for (const preview of mappingPreviews) {
  const existing = existingByMerchant.get(preview.merchantKey) || existingByLearningKey.get(preview.learningKey);
  const payload = {
    uid: userContext.uid,
    householdId: userContext.householdId,
    originalDescription: preview.originalDescription,
    mappedDescription: preview.mappedDescription,
    category: preview.category,
    subCategory: preview.subCategory,
    kind: preview.kind,
    isFixed: preview.useCount >= 3,
    merchantName: preview.merchantName,
    merchantKey: preview.merchantKey,
    learningKey: preview.learningKey,
    useCount: preview.useCount,
    lastUsedAt: new Date(),
  };

  if (existing) {
    await existing.ref.update(payload);
    updated += 1;
  } else {
    await db.collection('mappings').add({
      ...payload,
      createdAt: new Date(),
    });
    created += 1;
  }
}

console.log(`Memoria Wallet aplicada. Creados: ${created}. Actualizados: ${updated}.`);

async function resolveUserContext(input: WalletMemoryArgs) {
  if (input.uid && input.householdId) {
    return { uid: input.uid, householdId: input.householdId };
  }

  if (!input.email) {
    throw new Error('Para aplicar memoria necesito --email o --uid junto con --household.');
  }

  const users = await db.collection('users')
    .where('email', '==', input.email)
    .limit(1)
    .get();

  if (users.empty) {
    throw new Error(`No encontre un usuario con email ${input.email}.`);
  }

  const userDoc = users.docs[0];
  const data = userDoc.data();
  if (!data.householdId) {
    throw new Error(`El usuario ${input.email} no tiene householdId configurado.`);
  }

  return {
    uid: data.uid || userDoc.id,
    householdId: data.householdId,
  };
}

function toMappingPreview(candidate: WalletHistoryActiveMemoryCandidate): WalletMemoryMappingPreview {
  const originalDescription = candidate.sampleDescriptions[0] || candidate.merchantName;
  return {
    originalDescription,
    mappedDescription: candidate.merchantName,
    category: candidate.category,
    subCategory: candidate.subCategory,
    kind: 'expense',
    merchantName: candidate.merchantName,
    merchantKey: candidate.merchantKey,
    learningKey: buildFinanceLearningKey(originalDescription || candidate.merchantName),
    useCount: candidate.useCount,
    source: 'wallet_history',
    confidence: candidate.confidence,
    sourceCategories: candidate.sourceCategories,
    sampleDescriptions: candidate.sampleDescriptions,
  };
}

function formatMappingPreviewMarkdown(mappings: WalletMemoryMappingPreview[]) {
  return [
    '# Wallet active memory preview',
    '',
    `Mappings: ${mappings.length}`,
    '',
    'These mappings are generated from historical Wallet data. They should help VEO classify future movements, but they do not create transactions or change balances.',
    '',
    ...mappings.map(mapping =>
      `- ${mapping.merchantName}: ${mapping.category} / ${mapping.subCategory} (${mapping.useCount})`,
    ),
    '',
  ].join('\n');
}

function parseArgs(values: string[]): WalletMemoryArgs {
  const args: WalletMemoryArgs = {
    apply: false,
    limit: 42,
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--apply') args.apply = true;
    if (value === '--email') args.email = values[index + 1];
    if (value === '--uid') args.uid = values[index + 1];
    if (value === '--household') args.householdId = values[index + 1];
    if (value === '--limit') args.limit = Number(values[index + 1] || args.limit);
  }

  if (!Number.isFinite(args.limit) || args.limit <= 0) args.limit = 42;
  return args;
}

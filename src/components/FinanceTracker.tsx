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
  subscribeToHouseholdFinancialAccounts,
  subscribeToHouseholdFinancialTransactions,
  updateFinancialAccount,
  updateFinancialTransaction,
} from '../features/finance/finance.service.ts';
import { buildCatchupEstimatedTransaction, estimateFinanceCatchupMinutes, getDaysSinceLastFinanceUpdate, shouldSuggestFinanceCatchup } from '../features/finance/finance.helpers.ts';
import { buildFinancialInsights } from '../features/finance/finance.insights.ts';
import { parseFinanceStatementText } from '../features/finance/finance.import.ts';
import { formatAccountBalance } from '../features/finance/finance.accounts.ts';
import { fetchArgentinaInflationSnapshot, getCachedArgentinaInflationSnapshot, getLatestMonthlyInflationRate } from '../features/finance/argentinaInflation.ts';
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

function findLikelyDuplicateReason(candidate: Partial<PendingTransaction>, existingTransactions: any[]) {
  if (candidate.statementFingerprint) {
    const sameStatement = existingTransactions.find(transaction => transaction.statementFingerprint === candidate.statementFingerprint);
    if (sameStatement) return 'Este resumen parece ya importado.';
  }

  if (candidate.transactionFingerprint) {
    const sameFingerprint = existingTransactions.find(transaction => transaction.transactionFingerprint === candidate.transactionFingerprint);
    if (sameFingerprint) return 'Ya existe un movimiento identico.';
  }

  const candidateDate = toDayKey(candidate.date);
  const candidateAmount = Number(candidate.amount || 0);
  const candidateText = normalizeDuplicateText(candidate.description || '');
  if (!candidateDate || !candidateAmount || !candidateText) return '';

  const possibleDuplicate = existingTransactions.find(transaction => {
    const sameDay = toDayKey(transaction.date) === candidateDate;
    const sameAmount = Math.abs(Number(transaction.amount || 0) - candidateAmount) < 0.01;
    const sameText = normalizeDuplicateText(transaction.description || '') === candidateText;
    return sameDay && sameAmount && sameText;
  });

  return possibleDuplicate ? 'Coincide en fecha, importe y concepto con un movimiento existente.' : '';
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
  const accountId = transaction.accountId || findSuggestedSourceAccount(transaction, accounts);
  const toAccountId = transaction.toAccountId || findSuggestedDestinationAccount(transaction, accounts);
  const needsAccountReview = transaction.type === 'transfer' ? !accountId || !toAccountId : !accountId;

  return {
    ...transaction,
    accountId,
    toAccountId,
    needsReview: Boolean(transaction.needsReview || needsAccountReview),
  };
}

function findSuggestedSourceAccount(transaction: any, accounts: any[]) {
  if (transaction.importSource === 'bbva_visa') return findVisaCreditCardAccount(accounts)?.id || '';
  if (transaction.importSource === 'bbva_caja_ahorro_ars') return findCajaAhorroAccount(accounts)?.id || '';
  return '';
}

function findSuggestedDestinationAccount(transaction: any, accounts: any[]) {
  const text = normalizeDuplicateText(`${transaction.description || ''} ${transaction.subCategory || ''}`);
  if (transaction.type === 'transfer' && text.includes('visa')) {
    return findVisaCreditCardAccount(accounts)?.id || '';
  }
  return '';
}

function findVisaCreditCardAccount(accounts: any[]) {
  return accounts.find(account => {
    const text = normalizeDuplicateText(`${account.name || ''} ${account.type || ''}`);
    return account.type === 'credit_card' && text.includes('visa');
  }) || accounts.find(account => account.type === 'credit_card');
}

function findCajaAhorroAccount(accounts: any[]) {
  return accounts.find(account => {
    const text = normalizeDuplicateText(`${account.name || ''} ${account.type || ''} ${account.currency || ''}`);
    return account.currency === 'ARS' && (text.includes('caja') || text.includes('ahorro') || text.includes('bbva'));
  }) || accounts.find(account => account.currency === 'ARS' && account.type === 'bank');
}

function pendingTransactionNeedsAccount(pt: Partial<PendingTransaction>) {
  if (pt.type === 'transfer') return !pt.accountId || !pt.toAccountId;
  return !pt.accountId;
}

function canConfirmPendingTransaction(pt: PendingTransaction) {
  return !pt.duplicateReason && !pendingTransactionNeedsAccount(pt);
}

const FINANCE_TYPES = [
  { id: 'expense', label: 'Gasto', icon: <TrendingDown size={14} />, color: 'text-red-600', bg: 'bg-red-50', activeClass: 'bg-red-500 text-white border-red-500 shadow-md' },
  { id: 'income', label: 'Ingreso', icon: <TrendingUp size={14} />, color: 'text-green-600', bg: 'bg-green-50', activeClass: 'bg-green-500 text-white border-green-500 shadow-md' },
  { id: 'transfer', label: 'Transferencia', icon: <PieChart size={14} />, color: 'text-yellow-600', bg: 'bg-yellow-50', activeClass: 'bg-yellow-500 text-white border-yellow-500 shadow-md' },
];

const CURRENCIES = ['ARS', 'USD', 'EUR', 'BRL', 'CLP', 'UYU'];
const PAYMENT_TYPES = ['Efectivo', 'Tarjeta de Débito', 'Tarjeta de credito', 'Transferencia', 'Mercado Pago', 'Otro'];
const PAYMENT_STATUSES = ['Contabilizado', 'Pendiente', 'Anulado'];

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
  toAccountId?: string;
  date: string;
  isFixed: boolean;
  originalDescription: string;
  fileName: string;
  confidence: number;
  needsReview: boolean;
  merchantName?: string;
  merchantKey?: string;
  importSource?: string;
  transactionFingerprint?: string;
  statementFingerprint?: string;
  duplicateOfId?: string;
  duplicateReason?: string;
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
  const [newAccount, setNewAccount] = useState({ name: '', currency: 'ARS', balance: 0, color: '#3B82F6', type: 'bank' });
  const [householdMembers, setHouseholdMembers] = useState<any[]>([]);
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
  
  // Filtering states
  const [filterDateRange, setFilterDateRange] = useState('all'); // all, day, month, quarter, year, custom
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterAmountMin, setFilterAmountMin] = useState('');
  const [filterAmountMax, setFilterAmountMax] = useState('');
  const [filterGeneratedBy, setFilterGeneratedBy] = useState('all');
  const [filterAssignedTo, setFilterAssignedTo] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeListTab, setActiveListTab] = useState<'all' | 'reviews'>('all');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);

  const pendingImportSummary = useMemo(() => {
    const byFile = pendingTransactions.reduce<Record<string, number>>((acc, transaction) => {
      const fileName = transaction.fileName || 'PDF';
      acc[fileName] = (acc[fileName] || 0) + 1;
      return acc;
    }, {});

    const readyCount = pendingTransactions.filter(canConfirmPendingTransaction).length;
    const duplicateCount = pendingTransactions.filter(transaction => transaction.duplicateReason).length;
    const missingAccountCount = pendingTransactions.filter(pendingTransactionNeedsAccount).length;
    const cardPaymentCount = pendingTransactions.filter(transaction => transaction.type === 'transfer' && transaction.subCategory === 'Pago de tarjeta').length;
    const usdCount = pendingTransactions.filter(transaction => transaction.currency === 'USD').length;
    const fixedCount = pendingTransactions.filter(transaction => transaction.isFixed).length;

    return {
      byFile,
      readyCount,
      duplicateCount,
      missingAccountCount,
      cardPaymentCount,
      usdCount,
      fixedCount,
    };
  }, [pendingTransactions]);

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
      setUserCategories(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
      unsubCats();
      unsubMappings();
      unsubAccounts();
    };
  }, [user.uid]);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAccount) {
        await updateFinancialAccount(editingAccount.id, newAccount);
      } else {
        await createFinancialAccount({
          ...newAccount,
          uid: user.uid,
          householdId: user.householdId,
        });
      }
      setIsAddingAccount(false);
      setEditingAccount(null);
      setNewAccount({ name: '', currency: 'ARS', balance: 0, color: '#3B82F6', type: 'bank' });
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

  const startEditingAccount = (acc: any) => {
    setEditingAccount(acc);
    setNewAccount({
      name: acc.name,
      currency: acc.currency,
      balance: acc.balance,
      color: acc.color || '#3B82F6',
      type: acc.type
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
        generatedBy: generatedBy || user.uid,
        assignedTo: assignedTo || user.uid,
        payer,
        paymentType,
        paymentStatus
      };

      const transactionRef = await createFinancialTransaction(transactionInput);
      await applyTransactionToAccountBalances(transactionInput);
      if (transactionRef?.id) {
        await updateFinancialTransaction(transactionRef.id, { accountBalanceApplied: true } as any);
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
    return new Promise<PendingTransaction[]>((resolve, reject) => {
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
              const enrichedTransaction = enrichImportedTransactionWithAccounts(transaction, userAccounts);
              const duplicateReason = duplicateStatement
                ? 'Este resumen parece ya importado.'
                : findLikelyDuplicateReason(enrichedTransaction, finances);
              return {
                ...enrichedTransaction,
                id: Math.random().toString(36).substr(2, 9),
                originalDescription: enrichedTransaction.description,
                fileName: file.name,
                duplicateReason,
                needsReview: enrichedTransaction.needsReview || duplicateStatement || Boolean(duplicateReason),
              };
            });
            resolve(mapped);
            return;
          }

          const transactions = await categorizeFinanceFromText(fullText, userMappings);
          
          if (!Array.isArray(transactions)) {
            throw new Error("La IA no devolvió una lista de transacciones válida.");
          }

          const mapped = transactions.map((t: any) => {
            const enrichedTransaction = enrichImportedTransactionWithAccounts(t, userAccounts);
            const duplicateReason = findLikelyDuplicateReason(enrichedTransaction, finances);
            return {
              ...enrichedTransaction,
              id: Math.random().toString(36).substr(2, 9),
              originalDescription: enrichedTransaction.description,
              fileName: file.name,
              confidence: enrichedTransaction.confidence || 0,
              duplicateReason,
              needsReview: enrichedTransaction.needsReview || Boolean(duplicateReason),
            };
          });
          resolve(mapped);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setIsProcessingPdf(true);
    try {
      const allPending: PendingTransaction[] = [];
      for (const file of acceptedFiles) {
        const filePending = await processPdf(file);
        allPending.push(...filePending);
      }
      setPendingTransactions(prev => [...prev, ...allPending]);
    } catch (error) {
      console.error("Error processing PDFs:", error);
      alert("Failed to process some PDFs. Please try again.");
    } finally {
      setIsProcessingPdf(false);
    }
  }, [user.uid, userMappings, userAccounts, finances]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'application/pdf': ['.pdf'] },
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
        note: '',
        category: pt.category,
        subCategory: pt.subCategory || '',
        subSubCategory: pt.subSubCategory || '',
        type: pt.type,
        accountId: pt.accountId || '',
        toAccountId: pt.toAccountId || '',
        tags: ['pdf', ...(pt.type === 'transfer' && pt.subCategory === 'Pago de tarjeta' ? ['pago-tarjeta'] : [])],
        isFixed: pt.isFixed,
        date: new Date(pt.date),
        source: 'pdf',
        isConfirmed: true,
        generatedBy: user.uid,
        assignedTo: user.uid,
        confidence: pt.confidence >= 0.9 ? 'exact' : pt.confidence >= 0.7 ? 'estimated' : 'inferred',
        status: 'posted',
        needsReview: false,
        estimatedReason: null,
        reconciliationBatchId: null,
        paymentStatus: 'Contabilizado',
        merchantName: pt.merchantName || '',
        merchantKey: pt.merchantKey || '',
        importSource: pt.importSource || pt.fileName,
        transactionFingerprint: pt.transactionFingerprint || '',
        statementFingerprint: pt.statementFingerprint || '',
        duplicateReason: pt.duplicateReason || '',
        accountBalanceApplied: false,
      };

      const transactionRef = await createFinancialTransaction(transactionInput);
      if (transactionInput.accountId) {
        await applyTransactionToAccountBalances(transactionInput);
        await updateFinancialTransaction(transactionRef.id, { accountBalanceApplied: true } as any);
      }

      // Save mapping for learning
      const existingMapping = userMappings.find(m => m.originalDescription.toLowerCase() === pt.originalDescription.toLowerCase());
      const mappingPatch = {
        mappedDescription: pt.description,
        category: pt.category,
        subCategory: pt.subCategory || '',
        subSubCategory: pt.subSubCategory || '',
        isFixed: pt.isFixed,
        merchantName: pt.merchantName || '',
        merchantKey: pt.merchantKey || '',
        transactionFingerprint: pt.transactionFingerprint || '',
      };
      if (existingMapping) {
        await updateDoc(doc(db, 'mappings', existingMapping.id), mappingPatch);
      } else {
        await addDoc(collection(db, 'mappings'), {
          uid: user.uid,
          householdId: user.householdId,
          originalDescription: pt.originalDescription,
          ...mappingPatch,
        });
      }

      setPendingTransactions(prev => prev.filter(t => t.id !== pt.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'finances');
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

  const handleDelete = async (id: string) => {
    if (!confirm('Seguro que queres eliminar este movimiento?')) return;
    try {
      await updateDoc(doc(db, 'finances', id), { isConfirmed: false }); // Or actually delete
      // For this app, let's do actual delete since user asked for it
      // but wait, firestore.rules allow delete
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'finances', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'finances');
    }
  };

  const startEditing = (f: any) => {
    setEditingId(f.id);
    setEditForm({ ...f, date: format(f.date.toDate(), "yyyy-MM-dd'T'HH:mm") });
  };

  const saveEdit = async () => {
    if (!editingId || !editForm) return;
    try {
      const { amount, currency, description, note, category, subCategory, subSubCategory, type, accountId, toAccountId, tags, isFixed, date, generatedBy, assignedTo, payer, paymentType, paymentStatus, isConfirmed, originalDescription } = editForm;
      
      await updateDoc(doc(db, 'finances', editingId), {
        amount: parseFloat(amount),
        currency,
        description,
        note,
        category,
        subCategory,
        subSubCategory: subSubCategory || '',
        type,
        accountId,
        toAccountId: toAccountId || null,
        tags,
        isFixed,
        date: new Date(date),
        generatedBy,
        assignedTo,
        payer,
        paymentType,
        paymentStatus,
        isConfirmed: true, // Mark as confirmed when edited/saved
        needsReview: false
      });

      // If it was an AI transaction and the user corrected it, update mappings
      if (originalDescription && category !== editForm.category) {
        const existingMapping = userMappings.find(m => m.originalDescription.toLowerCase() === originalDescription.toLowerCase());
        if (existingMapping) {
          await updateDoc(doc(db, 'mappings', existingMapping.id), {
            category,
            subCategory: subCategory || '',
            subSubCategory: subSubCategory || ''
          });
        } else {
          await addDoc(collection(db, 'mappings'), {
            uid: user.uid,
            householdId: user.householdId,
            originalDescription,
            mappedDescription: description,
            category,
            subCategory: subCategory || '',
            subSubCategory: subSubCategory || '',
            isFixed
          });
        }
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

    // Search Query
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const matchesDesc = f.description?.toLowerCase().includes(searchLower);
      const matchesCat = f.category?.toLowerCase().includes(searchLower);
      const matchesSub = f.subCategory?.toLowerCase().includes(searchLower);
      const matchesSubSub = f.subSubCategory?.toLowerCase().includes(searchLower);
      if (!matchesDesc && !matchesCat && !matchesSub && !matchesSubSub) return false;
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
      await createFinancialTransaction(transaction);
      await applyTransactionToAccountBalances(transaction);
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

  const totalBalance = userAccounts.reduce((acc, a) => acc + (a.balance || 0), 0);

  const monthlyIncome = finances
    .filter(f => f.type === 'income' && format(f.date.toDate(), 'yyyy-MM') === format(new Date(), 'yyyy-MM'))
    .reduce((acc, f) => acc + f.amount, 0);

  const monthlyExpense = finances
    .filter(f => f.type === 'expense' && format(f.date.toDate(), 'yyyy-MM') === format(new Date(), 'yyyy-MM'))
    .reduce((acc, f) => acc + f.amount, 0);

  const reviewCount = finances.filter(f => f.isConfirmed === false || f.needsReview).length;
  const reviewFinances = finances.filter(f => f.isConfirmed === false || f.needsReview);
  const estimatedReviewFinances = reviewFinances.filter(f => f.source === 'catchup_estimate' || f.confidence === 'estimated' || f.confidence === 'inferred');
  const financialInsights = useMemo(() => buildFinancialInsights(finances, inflationMonthlyRate), [finances, inflationMonthlyRate]);
  const daysSinceLastUpdate = getDaysSinceLastFinanceUpdate(finances);

  const handleConfirmReviewedFinance = async (finance: any) => {
    try {
      if (finance.accountId && !finance.accountBalanceApplied) {
        await applyTransactionToAccountBalances({
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
        } as any);
      }
      await updateFinancialTransaction(finance.id, {
        status: 'posted',
        confidence: finance.confidence === 'inferred' ? 'estimated' : (finance.confidence || 'estimated'),
        needsReview: false,
        isConfirmed: true,
        paymentStatus: 'Contabilizado',
        accountBalanceApplied: finance.accountId ? true : Boolean(finance.accountBalanceApplied),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `finances/${finance.id}`);
    }
  };

  const handleResolveReviewedFinance = async (finance: any, accountId?: string, toAccountId?: string) => {
    try {
      const resolvedAccountId = accountId ?? finance.accountId ?? '';
      const resolvedToAccountId = toAccountId ?? finance.toAccountId ?? '';
      if (resolvedAccountId && !finance.accountBalanceApplied) {
        await applyTransactionToAccountBalances({
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
        accountBalanceApplied: resolvedAccountId ? true : Boolean(finance.accountBalanceApplied),
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
        onEdit={(finance) => {
          setEditingId(finance.id);
          setEditForm({ ...finance, date: format(finance.date.toDate(), "yyyy-MM-dd'T'HH:mm") });
          setActiveListTab('reviews');
        }}
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

      <FinancialInsightsPanel insights={financialInsights} />

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
        {(userAccounts || []).map(acc => (
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
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">{acc.type}</p>
              <p className="text-2xl font-black text-neutral-900">
                {formatAccountBalance(Number(acc.balance || 0), acc.type)} <span className="text-sm font-bold text-neutral-400">{acc.currency}</span>
              </p>
            </div>
          </motion.div>
        ))}
        <button 
          onClick={() => {
            setEditingAccount(null);
            setNewAccount({ name: '', currency: 'ARS', balance: 0, color: '#3B82F6', type: 'bank' });
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
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl"
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
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <ImportReviewStat label="Listos" value={pendingImportSummary.readyCount} tone="neutral" />
              <ImportReviewStat label="Duplicados" value={pendingImportSummary.duplicateCount} tone={pendingImportSummary.duplicateCount ? 'danger' : 'neutral'} />
              <ImportReviewStat label="Sin cuenta" value={pendingImportSummary.missingAccountCount} tone={pendingImportSummary.missingAccountCount ? 'warn' : 'neutral'} />
              <ImportReviewStat label="Pagos tarjeta" value={pendingImportSummary.cardPaymentCount} tone="info" />
              <ImportReviewStat label="USD" value={pendingImportSummary.usdCount} tone="info" />
              <ImportReviewStat label="Fijos" value={pendingImportSummary.fixedCount} tone="neutral" />
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
            </div>

            <div className="grid grid-cols-1 gap-4">
              {(pendingTransactions || []).map((pt) => (
                <div key={pt.id} className="bg-white p-6 rounded-2xl border border-amber-100 shadow-sm space-y-4">
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
                        onChange={(e) => updatePending(pt.id, { category: e.target.value, subCategory: '' })}
                        className="w-full bg-neutral-50 border-none rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Elegir categoria</option>
                        {(userCategories || []).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
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
                    {pt.subCategory && (() => {
                      const cat = userCategories.find(c => c.name === pt.category);
                      const sub = cat?.subCategories?.find((s: any) => (typeof s === 'string' ? s : s.name) === pt.subCategory);
                      if (sub && typeof sub !== 'string' && sub.subCategories?.length > 0) {
                        return (
                          <div className="w-48 space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Detalle</label>
                            <select
                              value={pt.subSubCategory}
                              onChange={(e) => updatePending(pt.id, { subSubCategory: e.target.value })}
                              className="w-full bg-neutral-50 border-none rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                            >
                              <option value="">Sin detalle</option>
                              {(sub.subCategories || []).map((ss: any) => {
                                const name = typeof ss === 'string' ? ss : ss.name;
                                return <option key={name} value={name}>{name}</option>;
                              })}
                            </select>
                          </div>
                        );
                      }
                      return null;
                    })()}
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
                          className="bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-amber-700 transition-all shadow-md flex items-center gap-2"
                        >
                          <Check size={16} /> Confirmar
                        </button>
                      </div>
                    </div>
                  </div>
                  {pt.duplicateReason && (
                    <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-bold leading-5 text-red-800">
                      Posible duplicado: {pt.duplicateReason}
                    </div>
                  )}
                  {pt.type === 'transfer' && pt.subCategory === 'Pago de tarjeta' && (
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs font-bold leading-5 text-blue-800">
                      Pago de tarjeta: VEO lo registra como transferencia entre cuentas, no como gasto nuevo.
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-amber-600 font-bold">
                    <FileText size={12} />
                    Desde: {pt.fileName} - Original: "{pt.originalDescription}"
                  </div>
                </div>
              ))}
            </div>
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
                <p className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-1">Saldo total</p>
                <h3 className="text-4xl font-black tracking-tighter">
                  ${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-800">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-green-500 mb-1">Ingresos del mes</p>
                  <p className="text-lg font-bold text-white">+${monthlyIncome.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-1">Gastos del mes</p>
                  <p className="text-lg font-bold text-white">-${monthlyExpense.toLocaleString()}</p>
                </div>
              </div>
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
                      {type === 'transfer' ? 'Desde cuenta' : 'Cuenta'}
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

                  {subCategory && (() => {
                    const cat = userCategories.find(c => c.name === category);
                    const sub = cat?.subCategories?.find((s: any) => (typeof s === 'string' ? s : s.name) === subCategory);
                    if (sub && typeof sub !== 'string' && sub.subCategories?.length > 0) {
                      return (
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Sub-subcategoria</label>
                          <select
                            value={subSubCategory}
                            onChange={(e) => setSubSubCategoria(e.target.value)}
                            className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                          >
                            <option value="">Ninguna</option>
                            {(sub.subCategories || []).map((ss: any) => {
                              const name = typeof ss === 'string' ? ss : ss.name;
                              return <option key={name} value={name}>{name}</option>;
                            })}
                          </select>
                        </div>
                      );
                    }
                    return null;
                  })()}

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
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Pagador</label>
                    <input
                      type="text"
                      value={payer}
                      onChange={(e) => setPayer(e.target.value)}
                      placeholder="Nombre del pagador"
                      className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                    />
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
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Generado por</label>
                      <select
                        value={generatedBy}
                        onChange={(e) => setGeneratedBy(e.target.value)}
                        className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                      >
                        {(householdMembers || []).map(m => <option key={m.id} value={m.uid}>{m.displayName || m.email}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Asignado a</label>
                      <select
                        value={assignedTo}
                        onChange={(e) => setAssignedTo(e.target.value)}
                        className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                      >
                        {(householdMembers || []).map(m => <option key={m.id} value={m.uid}>{m.displayName || m.email}</option>)}
                        <option value="Ambos">Ambos</option>
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
                {isProcessingPdf ? 'Procesando PDFs...' : 'Subir resumenes bancarios'}
              </p>
              <p className="text-xs text-neutral-400 font-medium">Arrastra o selecciona uno o varios PDFs</p>
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
              {(filterDateRange !== 'all' || filterCategory !== 'all' || filterGeneratedBy !== 'all' || filterAssignedTo !== 'all' || searchQuery || filterAmountMin || filterAmountMax) && (
                <button 
                  onClick={() => {
                    setFilterDateRange('all');
                    setFilterCategory('all');
                    setFilterGeneratedBy('all');
                    setFilterAssignedTo('all');
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
                  {(householdMembers || []).map(m => <option key={m.id} value={m.uid}>{m.displayName || m.email}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Responsable</label>
                <select 
                  value={filterAssignedTo}
                  onChange={(e) => setFilterAssignedTo(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-100 rounded-xl p-2 text-xs font-bold"
                >
                  <option value="all">Todos</option>
                  {(householdMembers || []).map(m => <option key={m.id} value={m.uid}>{m.displayName || m.email}</option>)}
                  <option value="Ambos">Ambos</option>
                </select>
              </div>

              <div className="space-y-1 lg:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-1">Buscar</label>
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar descripcion, categoria..."
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
                const generator = householdMembers.find(m => m.uid === f.generatedBy);
                const assignee = f.assignedTo === 'Ambos' ? 'Ambos' : householdMembers.find(m => m.uid === f.assignedTo);

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
                          {editForm.subCategory && (() => {
                            const cat = userCategories.find(c => c.name === editForm.category);
                            const sub = cat?.subCategories?.find((s: any) => (typeof s === 'string' ? s : s.name) === editForm.subCategory);
                            if (sub && typeof sub !== 'string' && sub.subCategories?.length > 0) {
                              return (
                                <select
                                  value={editForm.subSubCategory}
                                  onChange={(e) => setEditForm({ ...editForm, subSubCategory: e.target.value })}
                                  className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                                >
                                  <option value="">Sin sub-subcategoria</option>
                                  {(sub?.subCategories || []).map((ss: any) => {
                                    const name = typeof ss === 'string' ? ss : ss.name;
                                    return <option key={name} value={name}>{name}</option>;
                                  })}
                                </select>
                              );
                            }
                            return null;
                          })()}
                          <select 
                            value={editForm.accountId}
                            onChange={(e) => setEditForm({ ...editForm, accountId: e.target.value })}
                            className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                          >
                            <option value="">Sin cuenta</option>
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
                          <input 
                            type="text"
                            value={editForm.payer}
                            onChange={(e) => setEditForm({ ...editForm, payer: e.target.value })}
                            placeholder="Pagador"
                            className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                          />
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
                              {(householdMembers || []).map(m => <option key={m.id} value={m.uid}>{m.displayName || m.email}</option>)}
                            </select>
                            <select 
                              value={editForm.assignedTo}
                              onChange={(e) => setEditForm({ ...editForm, assignedTo: e.target.value })}
                              className="bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs font-bold"
                            >
                              {(householdMembers || []).map(m => <option key={m.id} value={m.uid}>{m.displayName || m.email}</option>)}
                              <option value="Ambos">Ambos</option>
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
                                {f.subSubCategory && (
                                  <span className="text-[10px] font-bold text-neutral-300 bg-neutral-50 px-2 py-0.5 rounded-full border border-neutral-100 italic">
                                    {f.subSubCategory}
                                  </span>
                                )}
                                {f.account && (
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                                    {f.account}
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
                            <span className="text-[9px] font-black uppercase tracking-tighter text-neutral-300">Por</span>
                            <span className="text-[10px] font-bold text-neutral-500">{generator?.displayName || 'Sin dato'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-black uppercase tracking-tighter text-neutral-300">Para</span>
                            <span className="text-[10px] font-bold text-neutral-500">
                              {f.assignedTo === 'Ambos' ? 'Ambos' : (assignee?.displayName || 'Sin dato')}
                            </span>
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

function FinancialInsightsPanel({ insights }: { insights: ReturnType<typeof buildFinancialInsights> }) {
  const topRecurring = insights.recurringDetected.slice(0, 4);
  const topFixed = insights.fixedDeclared.slice(0, 3);
  const topUnusual = insights.unusualExpenses.slice(0, 3);
  const profile = insights.monthlyProfile;

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Lectura de Luz</p>
            <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">Personalidad financiera</h3>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500">
            Base local
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {insights.summaryBullets.map((bullet, index) => (
            <div key={`${bullet}-${index}`} className="rounded-2xl bg-neutral-50 p-4">
              <p className="text-sm font-bold leading-6 text-neutral-700">{bullet}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-[1.5rem] border border-neutral-100 bg-neutral-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">Lectura corta</p>
          <p className="mt-2 text-sm font-bold leading-6 text-neutral-800">{insights.luzRead}</p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <ExpenseProfileStat label="Fijo declarado" value={profile.fixedDeclared} />
          <ExpenseProfileStat label="Recurrente detectado" value={profile.recurringDetected} />
          <ExpenseProfileStat label="Variable" value={profile.variable} />
          <ExpenseProfileStat label="Extraordinario" value={profile.unusual} />
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
          <ProjectionRow label="Promedio mensual" value={insights.projection.monthlyNetAverage} />
          <ProjectionRow label="6 meses" value={insights.projection.projectedNet6Months} />
          <ProjectionRow label="12 meses" value={insights.projection.projectedNet12Months} />
          {insights.projection.inflationAdjustedExpense6Months && (
            <ProjectionRow label="Gasto 6 meses con IPC" value={-insights.projection.inflationAdjustedExpense6Months} />
          )}
        </div>
        <p className="mt-5 text-xs font-semibold leading-5 text-white/45">
          Usa el promedio reciente y, cuando esta disponible, el IPC oficial nacional para tensionar la proyeccion.
        </p>
      </div>
    </section>
  );
}

function InsightList({ title, empty, items }: { title: string; empty: string; items: { title: string; detail: string }[] }) {
  return (
    <div className="rounded-[1.5rem] border border-neutral-100 p-4">
      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">{title}</p>
      <div className="space-y-2">
        {items.length > 0 ? items.map(item => (
          <div key={`${item.title}-${item.detail}`} className="rounded-2xl bg-neutral-50 p-3">
            <p className="truncate text-sm font-black text-neutral-900">{item.title}</p>
            <p className="mt-1 text-xs font-semibold text-neutral-500">{item.detail}</p>
          </div>
        )) : (
          <p className="rounded-2xl bg-neutral-50 p-3 text-sm font-bold text-neutral-400">{empty}</p>
        )}
      </div>
    </div>
  );
}

function ExpenseProfileStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.25rem] border border-neutral-100 bg-white p-4">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-2 text-xl font-black text-neutral-950">{value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
    </div>
  );
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




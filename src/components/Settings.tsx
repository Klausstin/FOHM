import React, { useState, useEffect } from 'react';
import { db, collection, addDoc, query, where, onSnapshot, handleFirestoreError, OperationType, deleteDoc, doc, updateDoc, getDocs } from '../firebase.ts';
import { Settings as SettingsIcon, Plus, Trash2, ChevronRight, ChevronDown, Folder, Tag, Save, Sparkles, RefreshCw, Share2, Lock, Unlock, Loader2, Wallet, Brain, Target, CheckCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PREDEFINED_CATEGORIES } from '../lib/categories.ts';
import { getHouseholdDescription, getHouseholdDisplayName, HOUSEHOLD_FEATURE_LABELS, JOURNAL_PRIVACY_NOTE } from '../domain/household.ts';

export default function Settings({ user }: { user: any }) {
  const [categories, setCategories] = useState<any[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [newSubCategory, setNewSubCategory] = useState<{ [key: string]: string }>({});
  const [newSubSubCategory, setNewSubSubCategory] = useState<{ [key: string]: string }>({});
  const [editing, setEditing] = useState<{
    type: 'category' | 'sub' | 'subsub';
    catId: string;
    subIndex?: number;
    subSubIndex?: number;
    value: string;
  } | null>(null);
  const [expanded, setExpanded] = useState<{ [key: string]: boolean }>({});
  const [members, setMembers] = useState<any[]>([]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [sharingConfig, setSharingConfig] = useState(user.sharingConfig || {
    goals: false,
    finances: true,
    habits: false
  });

  const updateSharing = async (feature: string, value: boolean) => {
    if (feature === 'mind') return;

    const newConfig = { ...sharingConfig, [feature]: value };
    setSharingConfig(newConfig);
    try {
      await updateDoc(doc(db, 'users', user.uid), { sharingConfig: newConfig });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'categories'), where('householdId', '==', user.householdId));
    const unsub = onSnapshot(q, (snap) => {
      setCategories(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'categories');
    });

    const qMembers = query(collection(db, 'users'), where('householdId', '==', user.householdId));
    const unsubMembers = onSnapshot(qMembers, (snap) => {
      setMembers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    return () => {
      unsub();
      unsubMembers();
    };
  }, [user.uid, user.householdId]);

  const syncCategories = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // Delete existing categories for this household
      const q = query(collection(db, 'categories'), where('householdId', '==', user.householdId));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await deleteDoc(doc(db, 'categories', d.id));
      }

      // Add predefined categories
      for (const cat of PREDEFINED_CATEGORIES) {
        await addDoc(collection(db, 'categories'), {
          uid: user.uid,
          householdId: user.householdId,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          subCategories: cat.subCategories
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'categories');
    } finally {
      setIsSyncing(false);
    }
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      await addDoc(collection(db, 'categories'), {
        uid: user.uid,
        householdId: user.householdId,
        name: newCategory,
        subCategories: []
      });
      setNewCategory('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'categories');
    }
  };

  const addSubCategory = async (categoryId: string) => {
    const subName = newSubCategory[categoryId];
    if (!subName?.trim()) return;
    
    const cat = categories.find(c => c.id === categoryId);
    try {
      await updateDoc(doc(db, 'categories', categoryId), {
        subCategories: [...(cat.subCategories || []), subName]
      });
      setNewSubCategory({ ...newSubCategory, [categoryId]: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'categories');
    }
  };

  const addSubSubCategory = async (categoryId: string, subIndex: number) => {
    const key = `${categoryId}-${subIndex}`;
    const subSubName = newSubSubCategory[key];
    if (!subSubName?.trim()) return;

    const cat = categories.find(c => c.id === categoryId);
    const newSubCategories = [...(cat.subCategories || [])];
    let sub = newSubCategories[subIndex];

    if (typeof sub === 'string') {
      sub = { name: sub, subCategories: [subSubName] };
    } else {
      sub = { ...sub, subCategories: [...(sub.subCategories || []), subSubName] };
    }
    newSubCategories[subIndex] = sub;

    try {
      await updateDoc(doc(db, 'categories', categoryId), {
        subCategories: newSubCategories
      });
      setNewSubSubCategory({ ...newSubSubCategory, [key]: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'categories');
    }
  };

  const deleteCategory = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar esta categoría?')) return;
    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'categories');
    }
  };

  const deleteSubCategory = async (categoryId: string, subIndex: number) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar esta sub-categoría?')) return;
    const cat = categories.find(c => c.id === categoryId);
    const newSubCategories = [...(cat.subCategories || [])];
    newSubCategories.splice(subIndex, 1);
    try {
      await updateDoc(doc(db, 'categories', categoryId), {
        subCategories: newSubCategories
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'categories');
    }
  };

  const deleteSubSubCategory = async (categoryId: string, subIndex: number, subSubIndex: number) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar esta sub-sub-categoría?')) return;
    const cat = categories.find(c => c.id === categoryId);
    const newSubCategories = [...(cat.subCategories || [])];
    const sub = { ...(newSubCategories[subIndex] as any) };
    const newSubSubCategories = [...(sub.subCategories || [])];
    newSubSubCategories.splice(subSubIndex, 1);
    sub.subCategories = newSubSubCategories;
    newSubCategories[subIndex] = sub;
    try {
      await updateDoc(doc(db, 'categories', categoryId), {
        subCategories: newSubCategories
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'categories');
    }
  };

  const saveEdit = async () => {
    if (!editing || !editing.value.trim()) return;
    const { type, catId, subIndex, subSubIndex, value } = editing;
    const cat = categories.find(c => c.id === catId);
    
    try {
      if (type === 'category') {
        await updateDoc(doc(db, 'categories', catId), { name: value });
      } else if (type === 'sub' && subIndex !== undefined) {
        const newSubCategories = [...(cat.subCategories || [])];
        if (typeof newSubCategories[subIndex] === 'string') {
          newSubCategories[subIndex] = value;
        } else {
          newSubCategories[subIndex] = { ...(newSubCategories[subIndex] as any), name: value };
        }
        await updateDoc(doc(db, 'categories', catId), { subCategories: newSubCategories });
      } else if (type === 'subsub' && subIndex !== undefined && subSubIndex !== undefined) {
        const newSubCategories = [...(cat.subCategories || [])];
        const sub = { ...(newSubCategories[subIndex] as any) };
        const newSubSubCategories = [...(sub.subCategories || [])];
        if (typeof newSubSubCategories[subSubIndex] === 'string') {
          newSubSubCategories[subSubIndex] = value;
        } else {
          newSubSubCategories[subSubIndex] = { ...(newSubSubCategories[subSubIndex] as any), name: value };
        }
        sub.subCategories = newSubSubCategories;
        newSubCategories[subIndex] = sub;
        await updateDoc(doc(db, 'categories', catId), { subCategories: newSubCategories });
      }
      setEditing(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'categories');
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Ajustes</h2>
          <p className="text-neutral-500 font-medium">Gestioná categorías, privacidad y base de grupo familiar.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Grupo familiar</p>
              <h3 className="mt-2 text-2xl font-black text-neutral-900">{getHouseholdDisplayName(user.householdId)}</h3>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-neutral-500">
                {getHouseholdDescription(user.householdId)}
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 text-sm">
              <p className="font-black text-neutral-900">ID actual</p>
              <p className="mt-1 break-all font-mono text-xs text-neutral-500">{user.householdId || 'Sin configurar'}</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-900">{JOURNAL_PRIVACY_NOTE}</p>
            <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
              En esta fase solo dejamos la base técnica. Las invitaciones reales de pareja/grupo se implementan después con reglas y confirmaciones claras.
            </p>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Folder size={20} className="text-neutral-400" />
              Categorías financieras
            </h3>
            <button
              onClick={syncCategories}
              disabled={isSyncing}
              className="flex items-center gap-2 text-xs font-bold text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              Sincronizar base
            </button>
          </div>

          <div className="flex gap-2 mb-8">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Nombre de la categoría"
              className="flex-1 bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
            />
            <button
              onClick={addCategory}
              className="bg-neutral-900 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-neutral-800 transition-all shadow-md flex items-center gap-2"
            >
              <Plus size={18} /> Agregar
            </button>
          </div>

          <div className="space-y-4">
            {categories.map(cat => (
              <div key={cat.id} className="border border-neutral-100 rounded-2xl overflow-hidden">
                <div 
                  className="flex items-center justify-between p-4 bg-neutral-50 cursor-pointer hover:bg-neutral-100 transition-colors"
                  onClick={() => setExpanded({ ...expanded, [cat.id]: !expanded[cat.id] })}
                >
                  <div className="flex items-center gap-3">
                    {expanded[cat.id] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    {editing?.type === 'category' && editing.catId === cat.id ? (
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={editing.value}
                          onChange={e => setEditing({ ...editing, value: e.target.value })}
                          onKeyDown={e => e.key === 'Enter' && saveEdit()}
                          className="bg-white border border-neutral-200 rounded px-2 py-1 text-sm font-bold"
                        />
                        <button onClick={saveEdit} className="text-emerald-500 hover:text-emerald-600">
                          <Save size={14} />
                        </button>
                        <button onClick={() => setEditing(null)} className="text-neutral-400 hover:text-neutral-500">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span 
                        className="font-bold text-neutral-900 hover:text-neutral-600 transition-colors"
                        onClick={(e) => { e.stopPropagation(); setEditing({ type: 'category', catId: cat.id, value: cat.name }); }}
                      >
                        {cat.name}
                      </span>
                    )}
                    <span className="text-xs font-bold text-neutral-400 bg-white px-2 py-1 rounded-lg border border-neutral-100">
                      {cat.subCategories?.length || 0}
                    </span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                    className="text-neutral-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <AnimatePresence>
                  {expanded[cat.id] && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden bg-white"
                    >
                      <div className="p-4 space-y-3 border-t border-neutral-100">
                        {cat.subCategories?.map((sub: any, i: number) => {
                          const subName = typeof sub === 'string' ? sub : sub.name;
                          const subSubCategories = typeof sub === 'string' ? [] : (sub.subCategories || []);
                          const subKey = `${cat.id}-${i}`;
                          
                          return (
                            <div key={i} className="space-y-2 pl-6 group/sub">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm text-neutral-600 font-medium">
                                  <Tag size={14} className="text-neutral-300" />
                                  {editing?.type === 'sub' && editing.catId === cat.id && editing.subIndex === i ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        autoFocus
                                        value={editing.value}
                                        onChange={e => setEditing({ ...editing, value: e.target.value })}
                                        onKeyDown={e => e.key === 'Enter' && saveEdit()}
                                        className="bg-neutral-50 border border-neutral-200 rounded px-2 py-0.5 text-xs"
                                      />
                                      <button onClick={saveEdit} className="text-emerald-500">
                                        <Save size={12} />
                                      </button>
                                      <button onClick={() => setEditing(null)} className="text-neutral-400">
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ) : (
                                    <span 
                                      className="hover:text-neutral-900 cursor-pointer transition-colors"
                                      onClick={() => setEditing({ type: 'sub', catId: cat.id, subIndex: i, value: subName })}
                                    >
                                      {subName}
                                    </span>
                                  )}
                                </div>
                                <button 
                                  onClick={() => deleteSubCategory(cat.id, i)}
                                  className="opacity-0 group-hover/sub:opacity-100 text-neutral-300 hover:text-red-500 transition-all"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>

                              <div className="space-y-1 pl-6">
                                {subSubCategories.map((ss: any, j: number) => {
                                  const ssName = typeof ss === 'string' ? ss : ss.name;
                                  return (
                                    <div key={j} className="flex items-center justify-between group/subsub">
                                      <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-medium">
                                        <div className="w-1 h-1 bg-neutral-200 rounded-full" />
                                        {editing?.type === 'subsub' && editing.catId === cat.id && editing.subIndex === i && editing.subSubIndex === j ? (
                                          <div className="flex items-center gap-2">
                                            <input
                                              autoFocus
                                              value={editing.value}
                                              onChange={e => setEditing({ ...editing, value: e.target.value })}
                                              onKeyDown={e => e.key === 'Enter' && saveEdit()}
                                              className="bg-neutral-50 border border-neutral-200 rounded px-2 py-0.5 text-[10px]"
                                            />
                                            <button onClick={saveEdit} className="text-emerald-500">
                                              <Save size={10} />
                                            </button>
                                            <button onClick={() => setEditing(null)} className="text-neutral-400">
                                              <X size={10} />
                                            </button>
                                          </div>
                                        ) : (
                                          <span 
                                            className="hover:text-neutral-600 cursor-pointer transition-colors"
                                            onClick={() => setEditing({ type: 'subsub', catId: cat.id, subIndex: i, subSubIndex: j, value: ssName })}
                                          >
                                            {ssName}
                                          </span>
                                        )}
                                      </div>
                                      <button 
                                        onClick={() => deleteSubSubCategory(cat.id, i, j)}
                                        className="opacity-0 group-hover/subsub:opacity-100 text-neutral-200 hover:text-red-400 transition-all"
                                      >
                                        <Trash2 size={10} />
                                      </button>
                                    </div>
                                  );
                                })}
                                <div className="flex gap-2 pt-1">
                                  <input
                                    type="text"
                                    value={newSubSubCategory[subKey] || ''}
                                    onChange={(e) => setNewSubSubCategory({ ...newSubSubCategory, [subKey]: e.target.value })}
                                    placeholder="New Sub-sub"
                                    className="flex-1 bg-neutral-50 border border-neutral-100 rounded p-1 text-[10px] focus:ring-1 focus:ring-neutral-900 focus:border-transparent transition-all"
                                  />
                                  <button
                                    onClick={() => addSubSubCategory(cat.id, i)}
                                    className="text-neutral-400 hover:text-neutral-600 text-[10px] font-bold"
                                  >
                                    Agregar
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex gap-2 pl-6 pt-2">
                          <input
                            type="text"
                            value={newSubCategory[cat.id] || ''}
                            onChange={(e) => setNewSubCategory({ ...newSubCategory, [cat.id]: e.target.value })}
                            placeholder="New Sub-category"
                            className="flex-1 bg-neutral-50 border border-neutral-100 rounded-lg p-2 text-xs focus:ring-1 focus:ring-neutral-900 focus:border-transparent transition-all"
                          />
                          <button
                            onClick={() => addSubCategory(cat.id)}
                            className="bg-neutral-100 text-neutral-600 px-3 py-2 rounded-lg font-bold text-xs hover:bg-neutral-200 transition-all"
                          >
                            Agregar
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Tag size={20} className="text-neutral-400" />
            Miembros del grupo
          </h3>
          <p className="text-sm text-neutral-500 mb-6">Estas personas comparten espacios de la app con vos.</p>
          
          <div className="space-y-4">
            {members.map(member => (
              <div key={member.id} className="flex items-center gap-4 p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                {member.photoURL ? (
                  <img src={member.photoURL} alt="" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-10 h-10 bg-neutral-200 rounded-full flex items-center justify-center font-bold text-neutral-500">
                    {member.displayName?.[0] || member.email?.[0]}
                  </div>
                )}
                <div>
                  <p className="font-bold text-neutral-900">{member.displayName || 'Usuario'}</p>
                  <p className="text-xs text-neutral-500 font-medium">{member.email}</p>
                </div>
                {member.uid === user.uid && (
                  <span className="ml-auto text-[10px] font-black uppercase tracking-widest text-neutral-400 bg-white px-2 py-1 rounded-lg border border-neutral-100">
                    Vos
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 p-6 bg-neutral-900 text-white rounded-[1.5rem] relative overflow-hidden">
            <div className="relative z-10">
              <h4 className="font-bold mb-2 flex items-center gap-2">
                <Share2 size={16} className="text-neutral-400" />
                Configuración de privacidad
              </h4>
              <p className="text-xs text-neutral-400 leading-relaxed mb-4">
                Elegí qué secciones querés compartir con los miembros de tu grupo.
              </p>
              
              <div className="space-y-3">
                {[
                  { id: 'goals', label: HOUSEHOLD_FEATURE_LABELS.goals, icon: <Target size={14} /> },
                  { id: 'mind', label: 'Diario Mental (siempre privado)', icon: <Brain size={14} />, disabled: true },
                  { id: 'finances', label: HOUSEHOLD_FEATURE_LABELS.finances, icon: <Wallet size={14} /> },
                  { id: 'habits', label: HOUSEHOLD_FEATURE_LABELS.habits, icon: <CheckCircle2 size={14} /> }
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="text-neutral-400">{item.icon}</div>
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    <button 
                      onClick={() => !item.disabled && updateSharing(item.id, !sharingConfig[item.id])}
                      disabled={item.disabled}
                      className={`p-1.5 rounded-lg transition-all ${
                        item.disabled ? 'bg-white/5 text-neutral-600 cursor-not-allowed' :
                        sharingConfig[item.id] ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-neutral-500'
                      }`}
                    >
                      {!item.disabled && sharingConfig[item.id] ? <Unlock size={14} /> : <Lock size={14} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

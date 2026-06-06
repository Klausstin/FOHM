import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { CheckCircle2, Clock3, Inbox, Plus, Trash2 } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../firebase';
import { createTask, deleteTask, subscribeToHouseholdTasks, updateTask } from '../features/tasks/task.service';
import type { TaskImportance, TaskRecord, TaskStatus, TaskUrgency, TaskVisibility } from '../features/tasks/task.types';

const INPUT_CLASS = 'w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-950 outline-none transition focus:border-neutral-400 focus:bg-white';

const STATUSES: Array<{ id: TaskStatus; label: string }> = [
  { id: 'inbox', label: 'Bandeja' },
  { id: 'next', label: 'Próximo' },
  { id: 'scheduled', label: 'Planificado' },
  { id: 'waiting', label: 'En espera' },
  { id: 'done', label: 'Hecho' },
  { id: 'discarded', label: 'Descartado' },
];

export default function Tasks({ user }: { user: any }) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [scope, setScope] = useState<'active' | 'today' | 'all'>('active');
  const [draft, setDraft] = useState({
    title: '',
    notes: '',
    importance: 'medium' as TaskImportance,
    urgency: 'medium' as TaskUrgency,
    dueDate: '',
    visibility: 'private' as TaskVisibility,
  });

  useEffect(() => {
    if (!user.householdId) return;
    return subscribeToHouseholdTasks(
      user.uid,
      user.householdId,
      setTasks,
      error => handleFirestoreError(error, OperationType.LIST, 'tasks'),
    );
  }, [user.householdId, user.uid]);

  const visibleTasks = useMemo(() => {
    const today = formatDateInput(new Date());
    return tasks.filter(task => {
      if (scope === 'today') return task.dueDate === today || task.status === 'next';
      if (scope === 'active') return !['done', 'discarded'].includes(task.status);
      return true;
    });
  }, [tasks, scope]);

  const activeTasks = tasks.filter(task => !['done', 'discarded'].includes(task.status));
  const inboxTasks = activeTasks.filter(task => task.status === 'inbox');
  const todayTasks = activeTasks.filter(task => task.dueDate === formatDateInput(new Date()) || task.status === 'next');
  const discardedOrDone = tasks.filter(task => ['done', 'discarded'].includes(task.status));

  const saveTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) return;
    try {
      await createTask({
        uid: user.uid,
        householdId: user.householdId,
        title: draft.title,
        notes: draft.notes,
        importance: draft.importance,
        urgency: draft.urgency,
        dueDate: draft.dueDate,
        visibility: draft.visibility,
        owner: draft.visibility === 'private' ? 'agustin' : 'shared',
      });
      setDraft(prev => ({ ...prev, title: '', notes: '', dueDate: '' }));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const quadrants = [
    {
      title: 'Hacer',
      subtitle: 'Importante y urgente',
      tasks: visibleTasks.filter(task => task.importance === 'high' && task.urgency === 'high'),
    },
    {
      title: 'Planificar',
      subtitle: 'Importante, no urgente',
      tasks: visibleTasks.filter(task => task.importance === 'high' && task.urgency !== 'high'),
    },
    {
      title: 'Resolver o delegar',
      subtitle: 'Urgente, poco importante',
      tasks: visibleTasks.filter(task => task.importance !== 'high' && task.urgency === 'high'),
    },
    {
      title: 'Postergar o descartar',
      subtitle: 'No urgente ni importante',
      tasks: visibleTasks.filter(task => task.importance !== 'high' && task.urgency !== 'high'),
    },
  ];

  return (
    <div className="space-y-5">
      <header className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-[1.75rem] bg-neutral-950 p-5 text-white shadow-sm md:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Decidí mejor</p>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-4xl font-black tracking-tight md:text-5xl">Tareas</h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/58">
                Lo que surge en el día. Capturar rápido, decidir mejor y no cargar la vida con ruido.
              </p>
            </div>
          </div>
        </div>

        <aside className="grid grid-cols-2 gap-3 rounded-[1.75rem] border border-neutral-200 bg-white p-4 shadow-sm">
          <MiniStat label="Activas" value={activeTasks.length} />
          <MiniStat label="Hoy" value={todayTasks.length} />
          <MiniStat label="Bandeja" value={inboxTasks.length} />
          <MiniStat label="Cerradas" value={discardedOrDone.length} />
        </aside>
      </header>

      <form onSubmit={saveTask} className="rounded-[1.75rem] border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_140px_140px_160px_150px_auto]">
          <Field label="Nueva tarea">
            <input
              value={draft.title}
              onChange={event => setDraft({ ...draft, title: event.target.value })}
              className={INPUT_CLASS}
              placeholder="Ej: llamar al contador, enviar presupuesto, comprar regalo"
            />
          </Field>
          <Field label="Importancia">
            <select value={draft.importance} onChange={event => setDraft({ ...draft, importance: event.target.value as TaskImportance })} className={INPUT_CLASS}>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </Field>
          <Field label="Urgencia">
            <select value={draft.urgency} onChange={event => setDraft({ ...draft, urgency: event.target.value as TaskUrgency })} className={INPUT_CLASS}>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </Field>
          <Field label="Fecha">
            <input type="date" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} className={INPUT_CLASS} />
          </Field>
          <Field label="Vista">
            <select value={draft.visibility} onChange={event => setDraft({ ...draft, visibility: event.target.value as TaskVisibility })} className={INPUT_CLASS}>
              <option value="private">Privada</option>
              <option value="shared_with_partner">Con Vicky</option>
              <option value="household_shared">Compartida</option>
            </select>
          </Field>
          <button
            type="submit"
            className="mt-auto inline-flex h-[46px] items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-5 text-sm font-black text-white transition hover:bg-neutral-800"
          >
            <Plus size={18} />
            Agregar
          </button>
        </div>
        <input
          value={draft.notes}
          onChange={event => setDraft({ ...draft, notes: event.target.value })}
          className={`${INPUT_CLASS} mt-3`}
          placeholder="Notas opcionales"
        />
      </form>

      <section className="flex flex-wrap gap-2">
        <ScopeButton active={scope === 'active'} onClick={() => setScope('active')}>Activas</ScopeButton>
        <ScopeButton active={scope === 'today'} onClick={() => setScope('today')}>Hoy</ScopeButton>
        <ScopeButton active={scope === 'all'} onClick={() => setScope('all')}>Todo</ScopeButton>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {quadrants.map(quadrant => (
          <QuadrantCard key={quadrant.title} title={quadrant.title} subtitle={quadrant.subtitle} tasks={quadrant.tasks} />
        ))}
      </section>
    </div>
  );
}

function QuadrantCard({ title, subtitle, tasks }: { title: string; subtitle: string; tasks: TaskRecord[] }) {
  return (
    <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-neutral-950">{title}</h3>
          <p className="text-xs font-bold text-neutral-400">{subtitle}</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-500">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.length > 0 ? tasks.map(task => <TaskRow key={task.id} task={task} />) : (
          <p className="rounded-2xl bg-neutral-50 p-4 text-sm font-semibold text-neutral-400">Sin tareas en este cuadrante.</p>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: TaskRecord }) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="rounded-2xl bg-neutral-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => updateTask(task.id, { status: 'done' })} className="mt-0.5 rounded-full bg-white p-2 text-neutral-400 transition hover:text-emerald-600" title="Marcar como hecha">
          <CheckCircle2 size={18} />
        </button>
        <button type="button" onClick={() => setIsEditing(prev => !prev)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-black text-neutral-950">{task.title}</p>
          <p className="mt-1 text-xs font-semibold text-neutral-400">{buildTaskMeta(task)}</p>
        </button>
        <button type="button" onClick={() => deleteTask(task.id)} className="rounded-full bg-white p-2 text-neutral-300 transition hover:text-rose-600" title="Borrar">
          <Trash2 size={16} />
        </button>
      </div>

      {isEditing && (
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <select value={task.status} onChange={event => updateTask(task.id, { status: event.target.value as TaskStatus })} className={INPUT_CLASS}>
            {STATUSES.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}
          </select>
          <select value={task.importance} onChange={event => updateTask(task.id, { importance: event.target.value as TaskImportance })} className={INPUT_CLASS}>
            <option value="high">Importante</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
          <select value={task.urgency} onChange={event => updateTask(task.id, { urgency: event.target.value as TaskUrgency })} className={INPUT_CLASS}>
            <option value="high">Urgente</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
          <input type="date" value={task.dueDate || ''} onChange={event => updateTask(task.id, { dueDate: event.target.value })} className={INPUT_CLASS} />
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-4">
      <p className="text-2xl font-black text-neutral-950">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-400">{label}</p>
    </div>
  );
}

function ScopeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest transition ${active ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-500 hover:text-neutral-950'}`}
    >
      {children}
    </button>
  );
}

function buildTaskMeta(task: TaskRecord) {
  const parts = [
    task.status === 'inbox' ? 'Bandeja' : STATUSES.find(status => status.id === task.status)?.label,
    task.importance === 'high' ? 'Importante' : task.importance === 'low' ? 'Baja importancia' : 'Importancia media',
    task.urgency === 'high' ? 'Urgente' : task.urgency === 'low' ? 'No urgente' : 'Urgencia media',
    task.dueDate || '',
  ];
  return parts.filter(Boolean).join(' · ');
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

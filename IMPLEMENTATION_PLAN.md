# IMPLEMENTATION_PLAN.md

## Fase 0 - Auditoria tecnica

### Resumen ejecutivo

La app actual es una buena primera base generada desde Google AI Studio. Ya tiene autenticacion con Firebase, persistencia en Firestore, UI React con secciones reales, carga de registros financieros, diario mental con texto/audio/imagen, objetivos, habitos, calendario y llamadas a Gemini.

No conviene rehacerla desde cero todavia. Conviene conservar la estetica general y varias piezas funcionales, pero antes de seguir sumando features hay que ordenar arquitectura, datos, permisos, idioma y limites de seguridad. El mayor riesgo actual no es visual: es que privacidad, household, journal, tokens e IA todavia no tienen una frontera suficientemente clara para una app personal/familiar.

## Arquitectura actual

### Stack detectado

- Frontend: React 19 + TypeScript + Vite.
- UI: Tailwind CSS v4, lucide-react, motion/react, Recharts.
- Backend local: Express en `server.ts`, montando Vite en modo desarrollo.
- Auth: Firebase Auth con Google.
- Base de datos: Firebase Firestore.
- Reglas: `firestore.rules` con validadores por coleccion.
- IA: `@google/genai` en `src/services/gemini.ts`.
- Calendario: Google OAuth + Google Calendar API mediante `server.ts`.
- PDF financiero: `pdfjs-dist` en el cliente.

### Flujo actual

- `src/App.tsx` controla autenticacion, perfil, navegacion por tabs y carga datos basicos para calendario.
- Cada seccion grande vive como componente monolitico:
  - `src/components/Dashboard.tsx`
  - `src/components/MindTracker.tsx`
  - `src/components/FinanceTracker.tsx`
  - `src/components/AnnualGoals.tsx`
  - `src/components/Habits.tsx`
  - `src/components/CalendarIntegration.tsx`
  - `src/components/Settings.tsx`
- `src/firebase.ts` inicializa Firebase y reexporta utilidades de Firestore/Auth.
- `src/services/gemini.ts` concentra prompts y llamadas de IA.
- `src/services/calendarService.ts` habla con endpoints locales de calendario.
- `server.ts` resuelve OAuth de Google Calendar y lectura de eventos.

### Colecciones Firestore actuales

- `users`
- `thoughts`
- `goals`
- `goalComments`
- `habits`
- `habitLogs`
- `finances`
- `accounts`
- `categories`
- `mappings`
- `google_tokens`

## Que esta funcionando o parcialmente funcionando

- Login con Google mediante Firebase Auth.
- Creacion automatica de perfil de usuario.
- Dashboard con saldos, cashflow, graficos y widgets configurables.
- Finanzas con cuentas, movimientos, transferencias, categorias, filtros, tags, PDF parsing e IA para categorizar.
- Diario mental con texto, categorias, imagen, audio/transcripcion y analisis por Gemini.
- Objetivos anuales con categorias, estado y comentarios.
- Habitos con desafio de 90 dias, check-ins diarios, racha e inventario.
- Integracion inicial con Google Calendar.
- Reglas de Firestore existentes, aunque todavia no modelan bien la privacidad deseada.

## Problemas detectados

### 1. Privacidad y permisos insuficientemente explicitos

El modelo actual usa mucho `householdId` y `sharingConfig`, pero no hay un campo `visibility` consistente por documento. Esto es delicado para journal, objetivos, habitos y finanzas. El journal personal nunca deberia depender de una preferencia global tipo `sharingConfig.mind`; deberia ser `private` por defecto a nivel entrada.

### 2. Household hardcodeado

`src/App.tsx` asigna por defecto `shared-household-vicky-agustin`. Esto sirve para un prototipo personal, pero no puede ser la base real de multiusuario. Necesitamos `Household` y `HouseholdMember` como entidades propias, invitaciones/estado y roles.

### 3. Mezcla de idioma y problemas de encoding

Hay textos en ingles y espanol mezclados: `Overview`, `Mind Diary`, `Finance Hub`, `Settings`, `Sign Out`, etc. Tambien hay mojibake en varios textos (`HÃ¡bitos`, `dÃ­a`, `Â¿`). Hay que normalizar el proyecto a UTF-8 y definir nomenclatura en espanol.

### 4. Componentes demasiado grandes

`FinanceTracker.tsx`, `Habits.tsx`, `MindTracker.tsx`, `Dashboard.tsx`, `Settings.tsx` y `AnnualGoals.tsx` mezclan estado, queries, mutaciones, calculos, formularios, modales y UI. Esto dificulta mantener, testear y evolucionar.

### 5. IA demasiado acoplada y sin contrato de contexto

`src/services/gemini.ts` arma prompts directamente desde datos crudos. Falta una capa de `AIContextBuilder`, reglas de privacidad, referencias a fuentes, manejo de insuficiencia de datos y respuestas estructuradas. Tambien hay prompts en ingles y modelos hardcodeados.

### 6. Gemini/API key en frontera incorrecta

El servicio de Gemini esta importado desde el frontend. En Vite, `process.env.GEMINI_API_KEY` no es una frontera segura para secretos del servidor. Las llamadas con API key deben pasar por backend/API server o Cloud Functions, no exponerse en bundle cliente.

### 7. Tokens de Google Calendar vuelven al cliente

El callback OAuth usa `postMessage` para enviar tokens al cliente y luego guardarlos en Firestore. Para un producto real, los refresh tokens deberian quedar del lado servidor con reglas estrictas, idealmente cifrados o gestionados por backend/Functions.

### 8. Scope de Google Calendar demasiado amplio para MVP read-only

El servidor pide `calendar.readonly` y `calendar.events`. Para la fase inicial read-only alcanza con `calendar.readonly`.

### 9. Datos financieros y saldos pueden desincronizarse

Al crear movimientos se actualiza el balance de cuenta directamente en el cliente. Eso puede generar inconsistencias con ediciones, borrados, duplicados, transferencias o escritura simultanea. Conviene calcular saldos desde movimientos o centralizar mutaciones atomicas.

### 10. Tipado debil

Muchas props y estados usan `any`. Faltan tipos compartidos para modelos centrales: `UserProfile`, `Household`, `JournalEntry`, `FinancialAccount`, `FinancialTransaction`, `Goal`, `Habit`, etc.

### 11. Reglas Firestore no reflejan el modelo futuro

Las reglas actuales son utiles como primer intento, pero tienen administradores por email hardcodeado, validadores que no incluyen `visibility`, y permisos por household demasiado amplios en finanzas/cuentas/categorias.

### 12. Fechas y ano hardcodeado

Hay referencias a objetivos 2026 y queries con `year == 2026`. Debe pasar a anio configurable/actual, con selector.

### 13. Persistencia de imagen/audio no escalable

El journal guarda imagen base64 en Firestore. Esto puede romper limites, rendimiento y costos. Archivos deberian ir a Firebase Storage o almacenamiento equivalente, dejando metadatos en Firestore.

### 14. Dependencias locales incompletas

En esta terminal existe Node, pero no aparecen `npm` ni `git` en PATH. Para ejecutar, instalar dependencias, commitear y subir al repo, hay que resolver ese entorno.

## Nomenclatura de UI propuesta

- `Overview / Dashboard` -> `Inicio`
- `Mind Diary` -> `Diario Mental`
- `Finance Hub` -> `Finanzas`
- `Objetivos 2026` -> `Objetivos`
- `Habitos` -> `Habitos`
- `Calendario` -> `Calendario`
- `Settings` -> `Ajustes`
- `Sign Out` -> `Cerrar sesion`
- `Household` -> `Grupo familiar` internamente, `Casa` o `Grupo` en UI segun contexto.

Categorias base sugeridas:

- Yo
- Pareja
- Trabajo
- Finanzas
- Salud
- Social
- Familia
- Educacion
- Aventura
- Ocio

## Propuesta de refactor

### Principios

- No rehacer la app desde cero.
- Mantener estetica minimalista premium.
- Separar datos, dominio, IA y UI.
- Introducir permisos desde el modelo, no como parche visual.
- No exponer secretos en frontend.
- Evitar datos hardcodeados presentados como reales.
- Hacer migracion gradual: una seccion por vez.

### Estructura de carpetas propuesta

```text
src/
  app/
    App.tsx
    routes.ts
    navigation.ts
  components/
    ui/
      Button.tsx
      Card.tsx
      EmptyState.tsx
      Modal.tsx
      PageHeader.tsx
      SegmentedControl.tsx
    layout/
      AppShell.tsx
      SidebarNav.tsx
      MobileNav.tsx
  features/
    auth/
      AuthScreen.tsx
      auth.service.ts
    dashboard/
      DashboardPage.tsx
      dashboard.selectors.ts
      widgets/
    journal/
      JournalPage.tsx
      JournalEntryForm.tsx
      JournalEntryList.tsx
      journal.service.ts
      journal.types.ts
    finances/
      FinancePage.tsx
      AccountList.tsx
      TransactionForm.tsx
      TransactionList.tsx
      finance.service.ts
      finance.selectors.ts
      finance.types.ts
    goals/
      GoalsPage.tsx
      GoalForm.tsx
      goals.service.ts
      goals.types.ts
    habits/
      HabitsPage.tsx
      HabitForm.tsx
      HabitCheckinGrid.tsx
      habits.service.ts
      habits.types.ts
    calendar/
      CalendarPage.tsx
      calendar.service.ts
      calendar.types.ts
    settings/
      SettingsPage.tsx
  domain/
    models.ts
    permissions.ts
    categories.ts
    currencies.ts
  services/
    firebase/
      client.ts
      firestore.ts
    ai/
      ai.client.ts
      ai.context.ts
      ai.types.ts
    google/
      calendar.client.ts
  utils/
    dates.ts
    money.ts
    validation.ts
```

Server/API:

```text
server/
  index.ts
  auth/
    googleOAuth.ts
  calendar/
    calendar.routes.ts
  ai/
    ai.routes.ts
    insightBuilder.ts
  security/
    session.ts
```

## Modelos de datos propuestos

### UserProfile

```ts
type UserProfile = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  timezone: string;
  primaryCurrency: 'ARS' | 'USD';
  createdAt: Timestamp;
};
```

### Household

```ts
type Household = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Timestamp;
};
```

### HouseholdMember

```ts
type HouseholdMember = {
  householdId: string;
  userId: string;
  role: 'owner' | 'member';
  status: 'invited' | 'active' | 'removed';
  createdAt: Timestamp;
};
```

### Visibility

```ts
type Visibility =
  | 'private'
  | 'shared_with_partner'
  | 'household_shared'
  | 'app_public';
```

Regla base: `JournalEntry.visibility` empieza siempre como `private`.

### JournalEntry

```ts
type JournalEntry = {
  id: string;
  userId: string;
  householdId?: string;
  title?: string;
  content: string;
  entryType: 'text' | 'audio' | 'photo' | 'mixed';
  transcript?: string;
  mood?: number;
  energy?: number;
  categories: string[];
  visibility: Visibility;
  attachments: Attachment[];
  createdAt: Timestamp;
  updatedAt?: Timestamp;
};
```

### FinancialAccount

```ts
type FinancialAccount = {
  id: string;
  ownerId: string;
  householdId?: string;
  name: string;
  type: 'bank' | 'wallet' | 'investment' | 'credit_card' | 'cash';
  currency: 'ARS' | 'USD';
  openingBalance: number;
  currentBalance?: number;
  visibility: Visibility;
  createdAt: Timestamp;
};
```

### FinancialTransaction

```ts
type FinancialTransaction = {
  id: string;
  accountId: string;
  userId: string;
  householdId?: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  currency: 'ARS' | 'USD';
  category: string;
  tags: string[];
  note?: string;
  paymentMethod?: string;
  status: 'pending' | 'posted' | 'ignored';
  date: Timestamp;
  visibility: Visibility;
  createdAt: Timestamp;
};
```

### InvestmentSnapshot

```ts
type InvestmentSnapshot = {
  id: string;
  accountId: string;
  investedCapital: number;
  currentValue: number;
  currency: 'ARS' | 'USD';
  date: Timestamp;
};
```

### Goal

```ts
type Goal = {
  id: string;
  ownerId: string;
  householdId?: string;
  title: string;
  description?: string;
  motivation?: string;
  category: string;
  year: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'paused' | 'abandoned';
  progress: number;
  metricName?: string;
  metricTarget?: number;
  metricCurrent?: number;
  linkedHabitIds: string[];
  visibility: Visibility;
  createdAt: Timestamp;
};
```

### Habit

```ts
type Habit = {
  id: string;
  ownerId: string;
  householdId?: string;
  title: string;
  description?: string;
  category: string;
  frequency: 'daily' | 'weekly' | 'custom';
  status: 'new' | 'maintenance' | 'paused' | 'abandoned';
  quarter: 1 | 2 | 3 | 4;
  year: number;
  linkedGoalIds: string[];
  visibility: Visibility;
  createdAt: Timestamp;
};
```

### HabitCheckin

```ts
type HabitCheckin = {
  id: string;
  habitId: string;
  userId: string;
  date: string;
  completed: boolean;
  note?: string;
  createdAt: Timestamp;
};
```

### CalendarEvent

```ts
type CalendarEvent = {
  id: string;
  userId: string;
  googleEventId: string;
  title: string;
  start: Timestamp;
  end: Timestamp;
  category?: string;
  source: 'google';
  visibility: Visibility;
};
```

### AIInsight

```ts
type AIInsight = {
  id: string;
  userId: string;
  householdId?: string;
  type: 'finance' | 'journal' | 'habit' | 'goal' | 'calendar' | 'alignment';
  title: string;
  summary: string;
  recommendations: string[];
  sourceRefs: SourceRef[];
  confidence: 'low' | 'medium' | 'high';
  missingData?: string[];
  createdAt: Timestamp;
};
```

## Orden de implementacion

### Fase 1 - Base solida

1. Normalizar encoding UTF-8 y UI en espanol.
2. Renombrar tabs y textos principales.
3. Crear `domain/models.ts`, `domain/permissions.ts`, `domain/categories.ts`.
4. Reemplazar `shared-household-vicky-agustin` por flujo real de perfil + household.
5. Agregar `visibility` a nuevos documentos.
6. Ajustar reglas Firestore para permisos por documento.
7. Separar layout/nav en componentes reutilizables.
8. Mover llamadas Gemini a backend/API.
9. Reducir scopes Calendar a read-only.

### Fase 2 - Journal + Objetivos + Habitos

1. Refactorizar `MindTracker` a feature `journal`.
2. Journal privado por defecto con filtros.
3. Preparar attachments via Storage.
4. Refactorizar objetivos con metricas, progreso, fecha objetivo y vinculos.
5. Refactorizar habitos con `new`, `maintenance`, `paused`, `abandoned`.
6. Crear primera vista de alineacion: objetivos vs habitos vs journal.

### Fase 3 - Finanzas

1. Separar cuentas y movimientos.
2. Definir saldos derivados o mutaciones transaccionales.
3. Soportar ARS/USD como primera clase.
4. Separar personal/compartido con visibility.
5. Agregar inversiones con snapshots.
6. Preparar importacion CSV/PDF con staging/review.

### Fase 4 - Calendario

1. Consolidar OAuth seguro.
2. Leer eventos read-only.
3. Clasificar eventos por categoria.
4. Mostrar distribucion del tiempo.
5. Cruzar calendario con objetivos/habitos.

### Fase 5 - IA / Coach de alineacion

1. Crear `AIContextBuilder`.
2. Aplicar filtro de privacidad antes de llamar IA.
3. Guardar insights en `AIInsight`.
4. Exigir respuestas con fuentes, missing data y recomendaciones concretas.
5. Crear vista de "Foco recomendado de la semana".

## Archivos que tocaria primero

1. `src/App.tsx`
   - Idioma, navegacion, household hardcodeado, year hardcodeado, layout base.

2. `src/lib/mindCategories.ts` y `src/lib/categories.ts`
   - Corregir encoding y consolidar categorias de vida.

3. `src/firebase.ts`
   - Reducir reexports, preparar capa `services/firebase`.

4. `src/services/gemini.ts`
   - Mover a backend o crear wrapper API server-side.

5. `server.ts`
   - Separar rutas, ajustar OAuth, session secret obligatorio, scopes read-only.

6. `firestore.rules`
   - Introducir `visibility`, `households`, `householdMembers`, permisos por documento.

7. `src/components/MindTracker.tsx`
   - Primer refactor funcional por privacidad: journal privado por defecto.

8. `src/components/Dashboard.tsx`
   - Cambiar enfoque: de resumen financiero a inicio integral.

## Riesgos

- Perder datos si se cambia modelo sin migracion. Solucion: versionar modelos y crear migraciones suaves.
- Exponer journal privado por reglas demasiado amplias. Solucion: `visibility` por documento y reglas estrictas.
- Exponer tokens/API keys. Solucion: IA y OAuth sensible en backend.
- Inconsistencia financiera por balances editados desde cliente. Solucion: saldos derivados o transacciones atomicas.
- Reglas Firestore complejas y dificiles de testear. Solucion: empezar simple, documentado y con casos claros.
- Scope demasiado grande. Solucion: mantener fases y no implementar todo junto.
- App generada con codigo grande y acoplado. Solucion: refactor incremental, seccion por seccion.
- Dependencias/entorno local incompleto. Solucion: instalar o exponer `npm` y `git` antes de ejecutar build y versionado.

## Decision recomendada

Avanzar con Fase 1 sin reescritura total. El primer cambio real deberia ser una limpieza de base:

1. Normalizar idioma/encoding.
2. Crear modelos TypeScript centrales.
3. Agregar `visibility` y permisos como concepto de dominio.
4. Eliminar household hardcodeado.
5. Separar IA/OAuth sensible del frontend.

Con eso la app queda preparada para crecer como sistema personal/familiar de alineacion integral, no como una app financiera generica.

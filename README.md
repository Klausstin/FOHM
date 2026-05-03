# FOHM / Mind & Money

FOHM es una app personal/familiar para ordenar mente, hábitos, objetivos, calendario y finanzas. La primera versión nació en Google AI Studio como "Mind & Money" y se está refactorizando por fases, sin rehacerla desde cero.

La visión del producto es que todo lo que el usuario registre pueda convertirse en contexto estructurado para una IA de alineación personal: objetivos anuales, diario, hábitos, calendario, finanzas, energía, tiempo y prioridades.

## Estado actual

La app ya corre localmente y tiene estas secciones:

- Inicio
- Diario Mental
- Finanzas
- Objetivos
- Hábitos
- Calendario
- Ajustes

Fase 1 dejó una base técnica más sólida:

- UI principal en español.
- Layout y navegación separados.
- Componentes UI reutilizables iniciales.
- Modelos de dominio base.
- Sistema inicial de visibilidad/permisos.
- Diario Mental privado por defecto.
- Base conceptual para household, pareja y grupo familiar.
- Documentación de fases y riesgos.

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Firebase Auth
- Firestore
- Express local para Vite y OAuth de Google Calendar
- Google Calendar API
- Gemini API
- Recharts
- lucide-react
- motion/react

## Requisitos

- Node.js LTS
- npm
- Git
- Proyecto Firebase configurado
- Google Auth habilitado en Firebase
- `localhost` agregado como dominio autorizado en Firebase Auth

## Correr localmente

Instalar dependencias:

```powershell
npm install
```

Levantar la app:

```powershell
npm run dev
```

Abrir:

```text
http://localhost:3000
```

Verificar build:

```powershell
npm run build
```

Verificar TypeScript:

```powershell
npm run lint
```

## Variables de entorno

Crear `.env` o `.env.local` según el entorno:

```env
GEMINI_API_KEY=
APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SESSION_SECRET=
```

Notas:

- Sin `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, la integración de Google Calendar no funciona.
- Sin `GEMINI_API_KEY`, las features de IA no deberían considerarse listas.
- No subir archivos `.env` reales al repo.

## Warnings conocidos

Durante `npm run build` pueden aparecer warnings de chunks grandes y bundling de Firebase. Hoy no bloquean el build.

También puede aparecer:

```text
WARNING: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set.
```

Eso es esperado si todavía no se configuró Google Calendar OAuth.

## Privacidad

Regla crítica del producto:

```text
El Diario Mental es privado por defecto y no se comparte automáticamente.
```

La app empieza a usar estas visibilidades:

- `private`
- `shared_with_partner`
- `household_shared`
- `app_public`

La implementación completa de permisos por documento sigue en progreso. Ver `PHASE_TODOS.md`.

## Estructura relevante

```text
src/
  components/
    layout/
      AppShell.tsx
      SidebarNav.tsx
    ui/
      Button.tsx
      Card.tsx
      CategoryPill.tsx
      EmptyState.tsx
      PageHeader.tsx
      SectionTabs.tsx
      StatCard.tsx
  domain/
    household.ts
    models.ts
    permissions.ts
  lib/
    categories.ts
    mindCategories.ts
  services/
    calendarService.ts
    gemini.ts
```

## Documentación del proyecto

- `IMPLEMENTATION_PLAN.md`: auditoría técnica y plan por fases.
- `PHASE_TODOS.md`: pendientes operativos por fase.

## Próximas fases

Fase 2:

- CRUD real y más limpio del Diario Mental.
- Objetivos anuales con métricas, progreso y vínculos.
- Hábitos por trimestre con estados claros.
- Vista básica de alineación entre objetivos y hábitos.

Fase 3:

- Finanzas más robustas.
- Cuentas, movimientos, transferencias e inversiones.
- Saldos consistentes.
- Separación personal/compartido.

Fase 4:

- Google Calendar read-only consolidado.
- Clasificación de eventos.
- Distribución del tiempo.
- Cruce con objetivos.

Fase 5:

- IA con contexto estructurado.
- Insights con fuentes y datos faltantes.
- Recomendaciones concretas, no diagnósticas.

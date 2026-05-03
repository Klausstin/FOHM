# Fase 1 - Resumen de base técnica

## Objetivo

Dejar la app más sólida técnicamente sin cambiar todo el producto ni rehacerla desde cero.

## Cambios realizados

- Se configuró el proyecto local y se subió el código inicial a GitHub.
- Se mantuvo la app existente generada en Google AI Studio como base.
- Se creó `IMPLEMENTATION_PLAN.md` con auditoría técnica, riesgos y fases.
- Se inició una UI principal en español.
- Se separó el layout principal:
  - `src/components/layout/AppShell.tsx`
  - `src/components/layout/SidebarNav.tsx`
- Se crearon componentes UI reutilizables:
  - `Button`
  - `Card`
  - `CategoryPill`
  - `EmptyState`
  - `PageHeader`
  - `SectionTabs`
  - `StatCard`
- Se crearon modelos base en `src/domain/models.ts`.
- Se creó un sistema inicial de visibilidad en `src/domain/permissions.ts`.
- Se creó una base de household/grupo en `src/domain/household.ts`.
- El Diario Mental quedó privado por defecto para entradas nuevas.
- El Diario Mental dejó de consultar entradas de todo el household.
- Se dejó `PHASE_TODOS.md` con pendientes por fase.
- Se migró la pantalla de Calendario a componentes reutilizables iniciales.

## Archivos principales tocados

- `README.md`
- `IMPLEMENTATION_PLAN.md`
- `PHASE_TODOS.md`
- `src/App.tsx`
- `src/components/Auth.tsx`
- `src/components/CalendarIntegration.tsx`
- `src/components/Dashboard.tsx`
- `src/components/MindTracker.tsx`
- `src/components/Settings.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/SidebarNav.tsx`
- `src/components/ui/*`
- `src/domain/*`
- `src/lib/categories.ts`
- `src/lib/mindCategories.ts`
- `firestore.rules`

## Verificación

Se usó:

```powershell
npm run build
```

El build pasa. Los warnings actuales de tamaño de bundle y Firebase no bloquean.

## Riesgos pendientes

- Gemini todavía está demasiado cerca del frontend.
- Tokens de Google Calendar todavía requieren una frontera de servidor más segura.
- Las pantallas grandes siguen siendo componentes monolíticos.
- Falta aplicar `visibility` de forma consistente en finanzas, objetivos y hábitos.
- Falta migrar adjuntos del Diario Mental a Storage.
- Falta flujo real de invitaciones para pareja/grupo.

## Próximo paso recomendado

Arrancar Fase 2 por Diario Mental:

1. Separar `MindTracker` en componentes y servicio.
2. Crear modelo `JournalEntry` real en la implementación.
3. Mejorar CRUD y filtros.
4. Preparar adjuntos sin guardar base64 en Firestore.
5. Dejar IA como análisis estructurado posterior, no como dependencia del guardado básico.

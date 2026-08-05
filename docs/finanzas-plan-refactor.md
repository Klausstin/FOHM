# Refactor del Módulo de Finanzas (VEO) — Estado y cómo seguir

> Documento de referencia para Agustín y cualquier asistente (Claude o Codex).
> **Última actualización: 2026-07-01.**

## 📌 Estado actual (resumen para retomar rápido)

- **Fase A: ✅ COMPLETA** — toda la lógica pura salió a módulos en `src/features/finance/`.
- **Fase B: ✅ COMPLETA** — todos los paneles visuales salieron a `src/features/finance/components/`.
- **Fase C: ⬜ PENDIENTE** — partir el componente principal por secciones (lo más delicado; ver abajo).
- `src/components/FinanceTracker.tsx` pasó de **9.186 → 4.664 líneas** (~49% afuera).
- Todo verificado y en `main`. Método usado: una rama por tanda + PR, verificando en cada paso.

## Cómo quedó organizado el módulo

- **Lógica** (`src/features/finance/*.ts`): tipos (`finance.importTypes`, `finance.types`),
  duplicados, formato, exportar/backup, rastro, cuotas, diagnósticos, resúmenes de cuenta,
  categorías, formulario de cuenta, importación pendiente, display de movimientos,
  constantes, secciones, etc.
- **Componentes** (`src/features/finance/components/*.tsx`): InstallmentForecastPanel,
  FinancialInsightsPanel, MonthlyFinanceSnapshot, FinanceLearningMemoryPanel,
  CategoryLearningGroupsPanel, BalanceIntegrityPanel, FinanceMovementDetailDisplay,
  AccountReconciliation, FinanceCatchupSessionPanel, PendingImportGroupsPanel,
  FinanceInternalNav, PendingMeta, AuditField, TransferTraceCard.
- `FinanceTracker.tsx` sigue siendo el **componente principal**: tiene el estado, la carga
  de datos (Firestore), los handlers y arma cada sección importando esos componentes.

## Redes de seguridad (correr después de CADA cambio)
- `npm run lint` (o `npx tsc --noEmit`) — errores de tipos.
- `npm run finance:smoke` — prueba de la lógica de saldos.
- `npm run build` — build de producción (antes de mergear).
- Abrir la app (`npm run dev` → localhost:3000) y mirar la sección tocada.
- Si algo falla → revertir. Nunca avanzar a ciegas.

## Método de trabajo (la "posta" con dos asistentes)
- Al EMPEZAR: `git pull`. Al TERMINAR una tanda: `git add` + `commit` + `push` (+ PR y merge).
- Una rama por tanda (`refactor/...` o `fix/...`), commits chicos.
- Ver `AGENTS.md` / `CLAUDE.md` en la raíz.

---

## Fase C — Partir el componente principal (lo que falta del refactor)

`FinanceTracker.tsx` (~4.664 líneas) todavía concentra todo el estado y las 8 secciones
(Resumen, Cuentas, Movimientos, Importar, Revisar, Categorías, Reportes, Backup).

Plan sugerido, **una sección a la vez** (no de un saque):
1. Concentrar el estado y la carga de datos compartida en un hook `useFinanceData(user)`.
2. Convertir cada sección en su propio componente (`SummarySection`, `AccountsSection`, …),
   una por una, verificando entre cada una.
3. `FinanceTracker.tsx` queda como un esqueleto delgado que arma el menú y muestra la
   sección activa.

Es la fase más laboriosa porque las secciones comparten mucho estado. Por eso: pasos
chicos y verificables. **No es obligatoria para que la app funcione** — es prolijidad.

---

## Otros hallazgos del análisis original (pendientes, fuera del refactor)

Por prioridad:

1. **🟠 Atomicidad de saldos (confirmado).** Actualizar un saldo hace leer→modificar→escribir
   sin protección (`finance.service.ts`), y cargar un movimiento son 3 pasos sueltos que
   pueden cortarse a la mitad. Riesgo real de "el saldo no cierra" con uso concurrente
   (dos personas/dispositivos) o cortes de red. Solución: transacciones / `increment` de Firestore.
2. **🟢 Centavos con decimales (higiene).** El dinero se guarda como float; el error es
   microscópico (no se pierde plata), pero conviene migrar a centavos enteros al tocar esa zona.
3. **🟡 Avisar errores al usuario.** Hoy muchos fallos se "tragan" en silencio.
4. **🟡 Números mágicos** repartidos (umbrales de duplicados, "gasto inusual > $10.000", etc.)
   → centralizar en configuración.
5. **🟡 Categorías y comercios fijos** en el código → permitir crear los propios desde la app.
6. **🟢 Caché de inflación sin fecha** → no se sabe si el dato está fresco.
7. **🟢 Tipos `any`** en lógica financiera → tipar para recuperar control de calidad.

# Plan de refactor — Módulo de Finanzas (VEO)

> Documento de referencia para Agustín, Claude y Codex.
> Estado: **plan aprobado, sin código tocado todavía.**
> Última actualización del análisis: 2026-06-21.

## Contexto

El módulo de finanzas funciona y tiene buenas ideas (categorización inteligente,
detección de duplicados, ajuste por inflación con datos reales del INDEC, scripts
de backup seguros). El problema principal **no es la lógica, es la prolijidad
estructural**: casi toda la pantalla vive en un solo archivo gigante,
`src/components/FinanceTracker.tsx`, de **9.186 líneas** (9 veces más grande que
el siguiente componente del proyecto).

### Por qué importa partirlo
- Es lento y arriesgado de modificar: un cambio chico puede romper algo lejano.
- Es donde Claude y Codex se pisan más fácil al trabajar en paralelo.
- Hace que la app cargue más pesada de lo necesario.

## Hallazgo clave: el archivo ya viene en 3 capas

| Capa | Qué es | Líneas aprox. | Riesgo de mover |
|---|---|---|---|
| 1. Funciones de cálculo (puras) | ~50 funciones sin nada visual (duplicados, backup, resúmenes de cuentas, diagnósticos) | 13–2.111 | 🟢 Bajo |
| 2. Sub-paneles ya separados | ~25 componentes que ya están sueltos dentro del archivo | 6.585–9.186 | 🟡 Medio |
| 3. Componente principal | ~4.500 líneas, ~101 hooks, las 8 secciones mezcladas entre sí | 2.112–6.585 | 🔴 Delicado |

La pantalla ya está pensada en **8 secciones** (Resumen, Cuentas, Movimientos,
Importar, Revisar, Categorías, Reportes, Backup). Esas son las líneas de corte
naturales para la capa 3.

## Redes de seguridad (correr después de CADA paso)
- `npm run lint` — revisa que no haya errores de tipos.
- `npm run finance:smoke` — prueba de la lógica de saldos.
- Abrir la app y mirar la sección tocada.
- Si algo falla → revertir el paso. Nunca avanzar a ciegas.

## Fases

### Fase 0 — Red de seguridad (antes de tocar nada)
- Confirmar que `lint` y `finance:smoke` pasan en limpio (foto base).
- Trabajar en una rama aparte, con commits chiquitos y frecuentes.

### Fase A — Mover funciones de cálculo 🟢 (bajo riesgo)
Sacar las ~50 funciones puras a archivos de lógica en `features/finance/`,
agrupadas por tema. Ejemplos:
- `finance.duplicates.ts` — detección de duplicados
- `finance.backup.ts` — exportar / backup / CSV
- `finance.accountSummary.ts` — resúmenes y actividad de cuentas
- `finance.diagnostics.ts` — chequeos de integridad de saldos
- `finance.installments.ts` — proyección de cuotas

Impacto: le saca ~2.000 líneas al archivo. Casi mecánico.

### Fase B — Sacar los sub-paneles ya separados 🟡 (riesgo medio)
Crear `features/finance/components/` y mudar ahí los ~25 paneles que ya están
sueltos (panel de aprendizaje, centro de revisión, importación, reportes, etc.).
Impacto: ~2.600 líneas afuera.

### Fase C — Partir el componente principal 🔴 (lo delicado, al final)
Una sección a la vez, NO de un saque:
1. Concentrar el estado y la carga de datos compartida en un hook `useFinanceData`.
2. Convertir cada una de las 8 secciones en su propio componente
   (`SummarySection`, `AccountsSection`, …), una por una, probando entre cada una.
3. `FinanceTracker.tsx` queda como un esqueleto delgado (~300 líneas) que arma
   el menú y muestra la sección activa.

Nota honesta: es la fase más laboriosa porque las 8 secciones hoy comparten
mucho estado. Por eso se hace de a una sección, en pasos chicos y verificables.

## Resultado esperado
- **De:** 1 archivo de 9.186 líneas.
- **A:** ~18 archivos de 100–500 líneas, fáciles de leer y modificar.

## Coordinación con Codex
Mientras dure este refactor, **Codex no debería tocar finanzas** (el archivo
estará "en obra"). Al terminar y subir a GitHub, Codex baja la versión nueva y
ambos pueden trabajar sobre los archivos chicos sin pisarse.

---

## Otros hallazgos del análisis (fuera del refactor de la pantalla)

Pendientes detectados, por prioridad, para encarar después del refactor:

1. **🟠 Atomicidad de saldos (confirmado).** Actualizar un saldo hace
   leer→modificar→escribir sin protección (`finance.service.ts:189-208`), y la
   carga de un movimiento son 3 pasos sueltos que pueden cortarse a la mitad.
   Riesgo real de "el saldo no cierra" con uso concurrente (dos personas / dos
   dispositivos) o cortes de red. Solución: usar transacciones / `increment` de
   Firestore.
2. **🟢 Centavos con decimales (higiene).** El dinero se guarda como float;
   verificado que el error es microscópico (no se pierde plata), pero conviene
   migrar a centavos enteros cuando se toque esa zona.
3. **🟡 Avisar errores al usuario.** Hoy muchos fallos se "tragan" en silencio.
4. **🟡 Números mágicos** repartidos (umbrales de duplicados, "gasto inusual >
   $10.000", etc.) → centralizar en un único lugar de configuración.
5. **🟡 Categorías y comercios fijos** en el código → permitir crear los propios
   desde la app.
6. **🟢 Caché de inflación sin fecha** → no se sabe si el dato está fresco.
7. **🟢 Tipos `any`** en lógica financiera → tipar para recuperar el control de
   calidad de TypeScript.

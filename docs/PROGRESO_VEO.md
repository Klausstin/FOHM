# Progreso VEO

Ultima actualizacion: 2026-06-11

Este archivo resume el estado macro del proyecto para no perder contexto entre bloques de trabajo.
Los porcentajes son estimaciones de avance funcional, no promesas exactas.

## Regla de seguimiento

Cada respuesta sobre VEO debe iniciar con:

```text
---
Modulo: [nombre] - [x%]
Bloque: [nombre] - [x%]
Tarea actual: [nombre] - [x%]
Estado: [Planificando / Implementando / Validando / Listo / Bloqueado]
Ahora: [que se esta haciendo]
Siguiente: [proximo paso]
---
```

## Modulos

| Modulo | Estado | Avance estimado | Nota |
| --- | --- | ---: | --- |
| Finanzas | Implementando | 90% | Prioridad actual y MVP central del producto. No pasar a otros modulos grandes hasta dejar Finanzas usable al 100% para Agustin y Vicky. |
| Luz | Implementando | 45% | Ya funciona como captura universal inicial, pero falta IA real y mejor interpretacion. |
| Panel General | Implementando | 35% | Necesita dashboard mas utilitario y menos explicativo. |
| Diario Mental | Implementando | 45% | Ya tiene estructura de biblioteca, falta busqueda semantica e IA real. |
| Wishlist / La Lista | Implementando | 35% | Base creada, falta ranking inteligente y conexion fuerte con finanzas. |
| Objetivos | Base | 25% | CRUD y vinculos iniciales, falta criterio profundo y alineacion real. |
| Habitos | Base | 25% | Base creada, falta robustez y conexion con Luz/objetivos. |
| Calendario | Pendiente | 10% | Integracion real con Google Calendar queda para despues de Finanzas. |
| Tareas | Planificando | 5% | Concepto definido, todavia no implementar hasta cerrar Finanzas. |
| Ajustes | Base | 30% | Perfil, household y permisos iniciales. |
| Investigacion tecnica | Listo | 20% | Primer mapa de librerias, APIs y proyectos open source creado en `docs/OPEN_SOURCE_RESEARCH.md`. |

## Bloque actual: Finanzas

| Bloque | Estado | Avance estimado | Proximo paso |
| --- | --- | ---: | --- |
| Modelo de cuentas y tarjetas | Implementando | 86% | Seguir puliendo saldos, deuda y conciliacion. |
| Registro manual y desde Luz | Implementando | 82% | Validar casos reales despues de mejorar beneficiarios, memoria y saldos. |
| Importador BBVA / Visa / CSV | Implementando | 86% | Seguir validando PDFs reales, CSV beta y procesamiento interno de historial Wallet sin impacto automatico en saldos. |
| Reconciliacion de resumenes | Implementando | 78% | Usar saldos de cierre, detectar movimientos sin saldo aplicado, evitar duplicados y resolver pendientes en lote. |
| Categorias financieras | Implementando | 85% | Aprendizaje por correcciones, categorias minimas, subcategorias limpias, memoria Wallet activable, memoria visible, aprendizajes desactivables y grupos similares mas confiables. |
| Beneficiarios y economia familiar | Implementando | 55% | Separar cuenta usada de para quien fue el gasto. |
| Inflacion y lectura real | Planificando | 25% | Conectar fuente automatica confiable y reportes reales/nominales. |
| Reportes y dashboard financiero | Implementando | 63% | Mejorar lectura practica diaria y mensual con resumen de periodo, proyeccion de cierre, cuotas futuras, cuenta usada, variacion real, cambios por rubro y diagnostico compacto colapsable. |
| Integraciones financieras automaticas | Post-MVP | No computa MVP | Mercado Pago API, BBVA API o agregadores quedan para despues de cerrar Finanzas 100% usable. |

## Tarea actual

| Tarea | Estado | Avance estimado | Archivos |
| --- | --- | ---: | --- |
| Mostrar detalle de grupos similares importados | Validando | 90% | `src/components/FinanceTracker.tsx`, `src/features/finance/finance.import.ts` |
| Mostrar evidencia completa del resumen importado | Validando | 90% | `src/components/FinanceTracker.tsx`, `src/features/finance/finance.import.ts` |
| Mostrar cuotas detectadas como compromisos futuros | Validando | 88% | `src/components/FinanceTracker.tsx` |
| Evitar grupos falsos por etiquetas bancarias genericas | Validando | 90% | `src/components/FinanceTracker.tsx` |
| Agregar panel de conciliacion por cuenta | Validando | 85% | `src/components/FinanceTracker.tsx` |
| Mostrar actividad por cuenta desde la ultima conciliacion | Validando | 80% | `src/components/FinanceTracker.tsx` |
| Investigar open source y APIs para acelerar VEO | Listo | 95% | `docs/OPEN_SOURCE_RESEARCH.md` |
| Exportar contexto maestro para ChatGPT | Listo | 100% | `VEO_CONTEXT_FOR_CHATGPT.md` |
| Detectar movimientos contabilizados sin impacto en saldo | Validando | 90% | `src/components/FinanceTracker.tsx` |
| Importar CSV como borradores revisables | Validando | 85% | `package.json`, `package-lock.json`, `src/features/finance/finance.import.ts`, `src/components/FinanceTracker.tsx` |
| Importar historial Wallet como aprendizaje | Validando | 98% | `src/features/finance/finance.import.ts`, `src/features/finance/finance.walletHistory.ts`, `scripts/finance-wallet-history.ts` |
| Separar candidatos Wallet para memoria activa | Validando | 92% | `src/features/finance/finance.walletHistory.ts`, `scripts/finance-wallet-history.ts` |
| Preparar activacion segura de memoria Wallet | Validando | 95% | `scripts/finance-wallet-memory.ts`, `src/components/FinanceTracker.tsx`, `src/features/finance/finance.learning.ts` |
| Evitar falsos beneficiarios por nombres de comercios | Validando | 95% | `src/features/luz/luzRouter.ts` |
| Agregar diagnostico financiero compacto | Validando | 85% | `src/components/FinanceTracker.tsx` |
| Agregar resumen mensual practico | Validando | 85% | `src/components/FinanceTracker.tsx` |
| Mostrar variacion real contra mes anterior | Validando | 80% | `src/components/FinanceTracker.tsx` |
| Mostrar mayor cambio mensual por categoria | Validando | 80% | `src/features/finance/finance.insights.ts`, `src/components/FinanceTracker.tsx` |
| Mostrar cuenta mas usada del mes | Validando | 80% | `src/components/FinanceTracker.tsx` |
| Estimar cierre de mes por ritmo actual | Validando | 80% | `src/features/finance/finance.insights.ts`, `src/components/FinanceTracker.tsx` |
| Compactar diagnostico financiero | Validando | 85% | `src/components/FinanceTracker.tsx` |
| Agregar acciones masivas de revision financiera | Validando | 85% | `src/components/FinanceTracker.tsx` |
| Mostrar memoria financiera activa | Validando | 85% | `src/components/FinanceTracker.tsx` |
| Desactivar aprendizajes financieros incorrectos | Validando | 85% | `src/components/FinanceTracker.tsx`, `src/features/finance/finance.learning.ts`, `firestore.rules` |
| Definir estrategia de automatizacion financiera post-MVP | Listo | 100% | `docs/FINANCE_AUTOMATION_STRATEGY.md` |
| Separar APIs del alcance MVP Finanzas | Listo | 100% | `docs/FINANCE_AUTOMATION_STRATEGY.md`, `docs/PROGRESO_VEO.md` |

## Proximos pasos

1. Cerrar el bloque de actividad/auditoria por cuenta.
2. Probar flujo real: crear gasto, editar monto/cuenta, borrar gasto y verificar saldo.
3. Validar el nuevo panel de movimientos a revisar y aplicar saldo faltante si aparece.
4. Probar CSV reales de banco/billetera/broker y ajustar mapeo de columnas.
5. Probar gastos reales desde Luz para validar memoria Wallet, beneficiarios y categorias.
6. Probar el resumen mensual y el diagnostico con datos reales, ajustando lo que no ayude en el uso diario.
7. No avanzar a otros modulos grandes hasta que Finanzas quede como MVP usable al 100% para uso real con Vicky.
8. Despues del MVP, evaluar Mercado Pago API como primera integracion automatica.

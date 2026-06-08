# Progreso VEO

Ultima actualizacion: 2026-06-07

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
| Finanzas | Implementando | 68% | Prioridad actual. No pasar a otros modulos grandes hasta dejarlo cerca de 90%. |
| Luz | Implementando | 45% | Ya funciona como captura universal inicial, pero falta IA real y mejor interpretacion. |
| Panel General | Implementando | 35% | Necesita dashboard mas utilitario y menos explicativo. |
| Diario Mental | Implementando | 45% | Ya tiene estructura de biblioteca, falta busqueda semantica e IA real. |
| Wishlist / La Lista | Implementando | 35% | Base creada, falta ranking inteligente y conexion fuerte con finanzas. |
| Objetivos | Base | 25% | CRUD y vinculos iniciales, falta criterio profundo y alineacion real. |
| Habitos | Base | 25% | Base creada, falta robustez y conexion con Luz/objetivos. |
| Calendario | Pendiente | 10% | Integracion real con Google Calendar queda para despues de Finanzas. |
| Tareas | Planificando | 5% | Concepto definido, todavia no implementar hasta cerrar Finanzas. |
| Ajustes | Base | 30% | Perfil, household y permisos iniciales. |

## Bloque actual: Finanzas

| Bloque | Estado | Avance estimado | Proximo paso |
| --- | --- | ---: | --- |
| Modelo de cuentas y tarjetas | Implementando | 80% | Seguir puliendo saldos, deuda y conciliacion. |
| Registro manual y desde Luz | Implementando | 75% | Mejorar edicion, borrado y consistencia de saldos. |
| Importador BBVA / Visa | Implementando | 70% | Seguir validando PDFs reales y casos USD/EUR. |
| Reconciliacion de resumenes | Implementando | 65% | Usar saldos de cierre y evitar duplicados con movimientos manuales. |
| Categorias financieras | Implementando | 70% | Aprendizaje por correcciones, categorias minimas y subcategorias limpias. |
| Beneficiarios y economia familiar | Implementando | 55% | Separar cuenta usada de para quien fue el gasto. |
| Inflacion y lectura real | Planificando | 25% | Conectar fuente automatica confiable y reportes reales/nominales. |
| Reportes y dashboard financiero | Planificando | 30% | Mejorar lectura practica diaria y mensual. |

## Tarea actual

| Tarea | Estado | Avance estimado | Archivos |
| --- | --- | ---: | --- |
| Preservar saldos al editar o borrar movimientos | Validando | 85% | `src/components/FinanceTracker.tsx`, `src/features/finance/finance.service.ts` |

## Proximos pasos

1. Cerrar el bloque de integridad de saldos al editar/borrar movimientos.
2. Probar flujo real: crear gasto, editar monto/cuenta, borrar gasto y verificar saldo.
3. Seguir con conciliacion y duplicados entre cargas manuales/Luz y resumenes importados.
4. Mejorar dashboard financiero con lectura de caja, deuda, inversiones y patrimonio.
5. Despues de Finanzas al 90%, volver a Tareas, Calendario, Luz IA real y UI/UX general.

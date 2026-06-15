# Progreso VEO

Ultima actualizacion: 2026-06-12

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
| Finanzas | Implementando | 92% | Prioridad actual y MVP central del producto. No pasar a otros modulos grandes hasta dejar Finanzas usable al 100% para Agustin y Vicky. |
| Luz | Implementando | 45% | Ya funciona como captura universal inicial, pero falta IA real y mejor interpretacion. |
| Panel General | Implementando | 35% | Necesita dashboard mas utilitario y menos explicativo. |
| Diario Mental | Implementando | 45% | Ya tiene estructura de biblioteca, falta busqueda semantica e IA real. |
| Wishlist / La Lista | Implementando | 35% | Base creada, falta ranking inteligente y conexion fuerte con finanzas. |
| Objetivos | Base | 25% | CRUD y vinculos iniciales, falta criterio profundo y alineacion real. |
| Habitos | Base | 25% | Base creada, falta robustez y conexion con Luz/objetivos. |
| Calendario | Pendiente | 10% | Integracion real con Google Calendar queda para despues de Finanzas. |
| Tareas | Planificando | 5% | Concepto definido, todavia no implementar hasta cerrar Finanzas. |
| Ajustes | Base | 30% | Perfil, household y permisos iniciales. |
| Documentacion troncal | Implementando | 65% | README actualizado como mapa central de vision, foco Finanzas, decisiones MVP y comandos. |
| Investigacion tecnica | Listo | 20% | Primer mapa de librerias, APIs y proyectos open source creado en `docs/OPEN_SOURCE_RESEARCH.md`. |

## Bloque actual: Finanzas

| Bloque | Estado | Avance estimado | Proximo paso |
| --- | --- | ---: | --- |
| Modelo de cuentas y tarjetas | Implementando | 95% | Saldos, deuda de tarjeta, pagos de tarjeta con cuenta destino, inferencia Visa/MC desde resumen, edicion confiable de cuentas, reversas seguras y smoke test local cubren el flujo critico; falta validacion real con datos de Agustin/Vicky. |
| Registro manual y desde Luz | Implementando | 86% | Guardado de ediciones mas robusto; falta prueba real completa despues de desplegar reglas. |
| Importador BBVA / Visa / CSV | Implementando | 86% | Seguir validando PDFs reales, CSV beta y procesamiento interno de historial Wallet sin impacto automatico en saldos. |
| Reconciliacion de resumenes | Implementando | 86% | Usar saldos de cierre, evitar falsas alertas de ajustes de saldo, detectar movimientos sin saldo aplicado, aplicar saldos pendientes, evitar duplicados y resolver pendientes en lote. |
| Categorias financieras | Implementando | 88% | Aprendizaje por correcciones, categorias minimas, subcategorias limpias, memoria Wallet activable, memoria auditable, aprendizajes editables/desactivables y grupos similares mas confiables. |
| Beneficiarios y economia familiar | Implementando | 62% | Separar cuenta usada de para quien fue el gasto, mejorar filtros por beneficiario real y usar lenguaje de producto claro. |
| Inflacion y lectura real | Planificando | 25% | Conectar fuente automatica confiable y reportes reales/nominales. |
| Reportes y dashboard financiero | Implementando | 72% | Mejorar lectura practica diaria y mensual con ritmo diario, resumen de periodo, proyeccion de cierre, cuotas futuras, cuenta usada, variacion real, cambios por rubro y menos paneles redundantes; Finanzas ya empieza a separarse en secciones internas desktop-first. |
| Backup y seguridad de datos | Implementando | 94% | Export JSON, CSV legible, validador local, protocolo de prueba real y playbook de recuperacion listos; falta ejecutar prueba real antes de carga masiva. |
| Reset seguro de datos financieros de prueba | Implementando | 80% | Script con dry-run, backup previo, confirmacion explicita y preservacion de cuentas/categorias listo para validar. |
| Integraciones financieras automaticas | Post-MVP | No computa MVP | Mercado Pago API, BBVA API o agregadores quedan para despues de cerrar Finanzas 100% usable. |

## Tarea actual

| Tarea | Estado | Avance estimado | Archivos |
| --- | --- | ---: | --- |
| Mostrar detalle de grupos similares importados | Validando | 90% | `src/components/FinanceTracker.tsx`, `src/features/finance/finance.import.ts` |
| Mostrar evidencia completa del resumen importado | Validando | 90% | `src/components/FinanceTracker.tsx`, `src/features/finance/finance.import.ts` |
| Mostrar cuotas detectadas como compromisos futuros | Validando | 88% | `src/components/FinanceTracker.tsx` |
| Evitar grupos falsos por etiquetas bancarias genericas | Validando | 90% | `src/components/FinanceTracker.tsx` |
| Agregar panel de conciliacion por cuenta | Validando | 85% | `src/components/FinanceTracker.tsx` |
| Mostrar actividad por cuenta desde la ultima conciliacion | Validando | 90% | `src/components/FinanceTracker.tsx` |
| Investigar open source y APIs para acelerar VEO | Listo | 95% | `docs/OPEN_SOURCE_RESEARCH.md` |
| Exportar contexto maestro para ChatGPT | Validando | 100% | `VEO_CONTEXT_FOR_CHATGPT.md` |
| Detectar movimientos contabilizados sin impacto en saldo | Validando | 90% | `src/components/FinanceTracker.tsx` |
| Aplicar saldo pendiente desde auditoria | Validando | 95% | `firestore.rules` |
| Simplificar revision financiera diaria | Validando | 80% | `src/components/FinanceTracker.tsx` |
| Editar cuenta destino en pagos de tarjeta | Validando | 90% | `src/components/FinanceTracker.tsx` |
| Inferir tarjeta destino en pagos de resumen | Validando | 90% | `src/features/finance/finance.import.ts`, `src/components/FinanceTracker.tsx` |
| Guardar edicion de cuentas con feedback claro | Validando | 99% | `src/components/FinanceTracker.tsx`, `src/features/finance/finance.service.ts`, `firestore.rules` |
| Guardar ediciones de movimientos importados | Validando | 95% | `src/components/FinanceTracker.tsx`, `src/features/finance/finance.service.ts`, `firestore.rules` |
| Permitir metadatos bancarios importados en Firestore | Validando | 95% | `firestore.rules` |
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
| Auditar y editar memoria financiera | Validando | 90% | `src/components/FinanceTracker.tsx`, `firestore.rules` |
| Definir estrategia de automatizacion financiera post-MVP | Listo | 100% | `docs/FINANCE_AUTOMATION_STRATEGY.md` |
| Separar APIs del alcance MVP Finanzas | Listo | 100% | `docs/FINANCE_AUTOMATION_STRATEGY.md`, `docs/PROGRESO_VEO.md` |
| Mejorar lenguaje y filtros de economia familiar | Validando | 85% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Evitar falsas alertas en ajustes de saldo | Validando | 90% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Hacer mas segura la reversa de saldo al editar o borrar | Validando | 90% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Filtrar movimientos desde una cuenta a auditar | Validando | 90% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Mostrar ritmo diario de gasto mensual | Validando | 90% | `src/features/finance/finance.insights.ts`, `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Agregar export manual de backup financiero | Validando | 90% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Mostrar confirmacion de backup descargado | Validando | 90% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Exportar movimientos financieros en CSV | Validando | 90% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Agregar prueba local de integridad de saldos | Validando | 90% | `src/features/finance/finance.balance.ts`, `scripts/finance-balance-smoke.ts`, `package.json`, `docs/PROGRESO_VEO.md` |
| Actualizar README como documento troncal | Validando | 90% | `README.md`, `docs/VEO_PRODUCT_VISION.md`, `docs/PROGRESO_VEO.md` |
| Regenerar contexto maestro para ChatGPT | Validando | 100% | `VEO_CONTEXT_FOR_CHATGPT.md`, `docs/PROGRESO_VEO.md` |
| Agregar validador local de backup financiero | Validando | 90% | `scripts/finance-backup-validate.ts`, `package.json`, `README.md`, `docs/PROGRESO_VEO.md` |
| Crear protocolo de prueba real de Finanzas | Validando | 90% | `docs/FINANCE_REAL_USE_TEST_PROTOCOL.md`, `README.md`, `docs/PROGRESO_VEO.md` |
| Crear playbook de recuperacion de backup financiero | Validando | 90% | `docs/FINANCE_BACKUP_RECOVERY_PLAYBOOK.md`, `README.md`, `docs/PROGRESO_VEO.md` |
| Crear reset seguro de datos financieros de prueba | Validando | 92% | `scripts/finance-reset-test-data.ts`, `package.json`, `README.md`, `docs/PROGRESO_VEO.md` |
| Aclarar credenciales admin para reset financiero | Validando | 90% | `scripts/finance-reset-test-data.ts`, `README.md`, `docs/PROGRESO_VEO.md` |
| Mostrar detalle completo en auditoria financiera | Validando | 85% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Cruzar detalle de Visa Debito en BBVA Caja ARS | Validando | 90% | `src/features/finance/finance.import.ts`, `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Editar movimientos desde auditoria financiera | Validando | 85% | `src/components/FinanceTracker.tsx`, `src/features/finance/finance.merchants.ts`, `docs/PROGRESO_VEO.md` |
| Limpiar tarjeta de auditoria y feedback de aplicar saldo | Validando | 85% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Agregar feedback visible al guardar movimientos editados | Validando | 90% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Organizar Finanzas con navegacion interna desktop-first | Validando | 85% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Simplificar formulario manual sin campo comercio | Validando | 90% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Simplificar transferencias internas con cambio de moneda | Validando | 85% | `src/components/FinanceTracker.tsx`, `src/features/finance/finance.service.ts`, `docs/PROGRESO_VEO.md` |
| Redisenar Agregar registro en Finanzas | Validando | 85% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Compactar lista de movimientos financieros | Validando | 85% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |
| Redisenar edicion de movimientos financieros | Validando | 85% | `src/components/FinanceTracker.tsx`, `docs/PROGRESO_VEO.md` |

## Proximos pasos

1. Ejecutar `docs/FINANCE_REAL_USE_TEST_PROTOCOL.md` en la app antes de carga masiva.
2. Si se quiere empezar limpio, configurar credenciales admin locales y correr dry-run de `npm run finance:reset-test-data`; aplicar solo con confirmacion explicita.
3. Descargar backup financiero y CSV antes de cargar datos reales masivos, y validar el JSON con `npm run finance:backup:validate`.
4. Validar que "Ver movimientos" desde una cuenta ayude a auditar saldos reales.
5. Validar el nuevo panel de movimientos a revisar y aplicar saldo faltante si aparece.
6. Probar CSV reales de banco/billetera/broker y ajustar mapeo de columnas.
7. Probar gastos reales desde Luz para validar memoria Wallet, beneficiarios y categorias.
8. Probar auditoria de movimientos importados validando que comercio, linea del resumen, huella, archivo y cuotas eviten abrir el PDF original.
9. Probar el resumen mensual y el diagnostico con datos reales, ajustando lo que no ayude en el uso diario.
10. No avanzar a otros modulos grandes hasta que Finanzas quede como MVP usable al 100% para uso real con Vicky.
10. Despues del MVP, evaluar Mercado Pago API como primera integracion automatica.

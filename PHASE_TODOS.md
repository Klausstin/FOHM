# PHASE_TODOS.md

## Fase 1 - Base tecnica

- Migrar gradualmente las pantallas grandes a `components/ui` y `components/layout`.
- Usar `PageHeader`, `Card`, `Button`, `EmptyState`, `SectionTabs`, `StatCard` y `CategoryPill` en cada feature.
- Completar unificacion de idioma en Finanzas, Habitos, Objetivos, Calendario y Ajustes.
- Crear flujo real de `Household` y miembros en lugar de depender solo de `householdId`.
- Ajustar reglas Firestore para `visibility` en objetivos, habitos, cuentas y movimientos.
- Mover IA y tokens sensibles fuera del frontend.

## Fase 2 - Journal, objetivos y habitos

- CRUD completo de journal con privacidad por entrada.
- Adjuntos en Storage para imagen/audio.
- Objetivos con metricas, fecha objetivo, motivacion y progreso.
- Habitos con estado `new`, `maintenance`, `paused`, `abandoned`.
- Vinculos entre objetivos, habitos y entradas del journal.

## Fase 3 - Finanzas

- Separar cuentas, movimientos, transferencias e inversiones con modelos consistentes.
- Calcular saldos de forma derivada o atomica.
- Separar finanzas personales y compartidas con `visibility`.
- Preparar importacion CSV/PDF con revision antes de guardar.

## Fase 4 - Calendario

- Consolidar OAuth read-only.
- Clasificar eventos por categoria.
- Mostrar distribucion del tiempo.
- Cruzar calendario con objetivos y habitos.

## Fase 5 - IA

- Crear `AIContextBuilder` con datos estructurados.
- Filtrar contexto por privacidad antes de llamar al modelo.
- Guardar insights con fuentes, confianza y datos faltantes.
- Generar recomendaciones concretas y no diagnosticas.

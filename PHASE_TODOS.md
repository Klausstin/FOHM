# PHASE_TODOS.md

## Producto - VEO / Luz

- Mantener la vision de VEO como sistema operativo personal, no como app financiera generica.
- Renombrar la UI visible a VEO cuando sea oportuno.
- Introducir Luz como identidad de IA cuando exista una capa de contexto mas solida.
- Evitar productividad por productividad.
- Evitar diagnosticos medicos o psicologicos.
- No inventar datos; pedir mejor carga cuando falte contexto.

## Fase 1 - Base Tecnica

- Seguir migrando pantallas grandes a `components/ui` y `components/layout`.
- Completar unificacion de idioma en pantallas restantes.
- Crear flujo real de invitaciones para household/pareja.
- Persistir `households` y `householdMembers` como colecciones propias cuando se implementen invitaciones.
- Ajustar reglas Firestore para `visibility` en objetivos, habitos, cuentas y movimientos.
- Mover IA y tokens sensibles fuera del frontend.

## Fase 2 - Journal, Objetivos Y Habitos

- Adjuntos reales en Storage para imagen/audio del diario.
- Audio con almacenamiento y transcripcion persistente.
- Objetivos con metrica principal, fecha objetivo, motivacion y progreso.
- Habitos con estados `new`, `maintenance`, `paused`, `abandoned`.
- Vista de alineacion mas completa entre objetivos, habitos y journal.

## Fase 3 - Finanzas

- Separar cuentas, movimientos, transferencias e inversiones con modelos consistentes.
- Calcular saldos de forma derivada o atomica con criterio unico.
- Separar finanzas personales y compartidas con `visibility`.
- Mejorar importacion CSV/PDF con revision antes de guardar.
- Mejorar Modo Puesta al Dia con preguntas por etapas.
- Permitir reconciliar saldos actuales por cuenta.
- Mostrar cuanto del mes esta estimado vs exacto.
- Permitir confirmar, editar o ignorar movimientos `needs_review`.

## Fase 4 - Calendario

- Consolidar OAuth read-only.
- Clasificar eventos por categoria.
- Mostrar distribucion del tiempo.
- Cruzar calendario con objetivos y habitos.

## Fase 5 - IA / Luz

- Crear `AIContextBuilder` con datos estructurados.
- Filtrar contexto por privacidad antes de llamar al modelo.
- Guardar insights con fuentes, confianza y datos faltantes.
- Generar recomendaciones concretas y no diagnosticas.
- Permitir preguntas de alineacion cruzando objetivos, habitos, diario, finanzas y calendario.

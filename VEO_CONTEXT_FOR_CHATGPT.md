# VEO_CONTEXT_FOR_CHATGPT.md

Ultima actualizacion: 2026-06-08

Este archivo resume el contexto actualizado de VEO para conversaciones con ChatGPT u otro asistente. Esta pensado para orientar estrategia, producto, arquitectura y siguientes decisiones sin pegar toda la historia ni codigo completo.

## Como usar este documento

Pegar este archivo al inicio de una conversacion nueva con ChatGPT cuando se quiera hablar sobre VEO.

No compartir:
- `.env`
- claves de Firebase, Google, OpenAI/Gemini u otros servicios
- tokens OAuth
- PDFs bancarios reales
- datos financieros sensibles sin anonimizar

## Resumen ejecutivo

VEO significa "Vida en Orden".

VEO es un sistema personal de claridad para entenderte mejor, decidir mejor y vivir mas alineado.

La IA interna se llama Luz. Luz no debe ser un chatbot generico: debe ser la inteligencia transversal que ayuda a ver patrones, contradicciones, desalineaciones y proximos pasos concretos.

La app no debe empujar productividad por productividad. Tiene que ayudar a tomar mejores decisiones sin desordenar la vida real: salud, pareja, familia, descanso, estabilidad emocional, finanzas, disfrute y objetivos de largo plazo.

Prioridad actual del desarrollo: Finanzas. No conviene pasar fuerte a otros modulos hasta que Finanzas este cerca de 90%.

## Claim y criterio de producto

Claim principal:

> Entendete mejor. Decidi mejor. Vivi mas alineado.

Capas conceptuales:

1. Entendete mejor
   - Journal, patrones, errores, aciertos, gustos, emociones, ideas recurrentes, bloqueos, deseos autenticos, energia y aprendizajes personales.

2. Decidi mejor
   - Objetivos, decisiones, finanzas, calendario, prioridades, trade-offs, planificacion, proximos pasos, uso del tiempo y uso de la plata.

3. Vivi mas alineado
   - Vida real, habitos, pareja, salud, tiempo, descanso, familia, rutina, energia, disfrute y sostenibilidad.

Regla de UX:

Si VEO puede interpretar algo por el usuario, mejor. El usuario confirma o corrige, pero no deberia completar mil campos ni aprobar mil transacciones una por una.

## Stack actual

- Frontend: React 19 + TypeScript + Vite.
- UI: Tailwind CSS, lucide-react, motion/react, Recharts.
- Backend local: Express en `server.ts`, montando Vite en desarrollo.
- Auth: Firebase Auth con Google.
- Base de datos: Firebase Firestore.
- Reglas: `firestore.rules`.
- IA existente: servicio Gemini inicial en `src/services/gemini.ts`.
- Calendario: Google OAuth + Google Calendar API mediante `server.ts`.
- PDF financiero: `pdfjs-dist` en cliente.
- CLI/flujo Git: GitHub CLI (`gh`) para crear y mergear PRs por terminal.

## Arquitectura actual

La app empezo como una base generada desde Google AI Studio. No se rehizo desde cero. Se viene refactorizando por bloques.

Piezas principales:

- `src/App.tsx`: autenticacion, perfil, navegacion, carga de datos globales para habitos/objetivos/calendario.
- `src/components/layout/AppShell.tsx`: layout general.
- `src/components/layout/SidebarNav.tsx`: navegacion lateral.
- Componentes principales por pantalla:
  - `Dashboard.tsx`
  - `LuzWorkspace.tsx`
  - `MindTracker.tsx`
  - `Tasks.tsx`
  - `FinanceTracker.tsx`
  - `Wishlist.tsx`
  - `AnnualGoals.tsx`
  - `Habits.tsx`
  - `CalendarIntegration.tsx`
  - `Settings.tsx`
- `src/domain/`: tipos y permisos base.
- `src/features/`: servicios y tipos por modulo.
- `src/services/`: integraciones externas iniciales.

Problema estructural todavia vigente:

Algunos componentes siguen siendo grandes, especialmente Finanzas. El refactor esta avanzando desde adentro hacia afuera: primero robustez funcional, despues UI/UX mas profunda.

## Rutas y pantallas actuales

Documento `docs/ROUTES_AND_SCREENS.md`: no encontrado al momento de este export. Esta seccion esta inferida desde `src/App.tsx` y `SidebarNav.tsx`.

Pantallas actuales:

- `luz`: Luz
  - Entrada universal/conversacional.
  - Debe poder interpretar texto libre y proponer acciones: gasto, journal, wishlist, habit, goal, calendar, task.

- `home`: Panel General
  - Dashboard diario.
  - Debe priorizar informacion practica, no textos explicativos repetidos.

- `mind`: Diario Mental
  - Biblioteca de entradas.
  - El lugar para revisar, buscar, filtrar y analizar entradas, no necesariamente el principal punto de carga.

- `tasks`: Tareas
  - Base creada.
  - Debe convertirse en administracion de tareas por importancia, urgencia, postergable/desechable.
  - No priorizar hasta cerrar Finanzas.

- `finance`: Finanzas
  - Prioridad actual.
  - Cuentas, tarjetas, importacion PDF, movimientos, categorias, conciliacion, duplicados, saldos.

- `wishlist`: La Lista
  - Lista de deseos/compras/objetivos materiales.
  - Debe ayudar a evitar compras compulsivas y alinear decisiones con objetivos.

- `goals`: Objetivos
  - Objetivos anuales y categorias.
  - Falta profundizar autenticidad, metricas y conexion real con habitos/finanzas/journal.

- `habits`: Habitos
  - Base creada.
  - Falta robustez y conexion fuerte con objetivos/Luz.

- `calendar`: Calendario
  - Integracion inicial.
  - Google Calendar real queda para despues de Finanzas.

- `settings`: Ajustes
  - Perfil, household y configuraciones iniciales.

## Estado macro actual

Fuente: `docs/PROGRESO_VEO.md`.

Avance estimado por modulo:

- Finanzas: 72%. Prioridad actual.
- Luz: 45%. Captura universal inicial; falta IA real y mejor interpretacion.
- Panel General: 35%. Necesita dashboard mas utilitario.
- Diario Mental: 45%. Biblioteca base; falta busqueda semantica e IA real.
- Wishlist / La Lista: 35%. Base creada; falta ranking inteligente y conexion con finanzas.
- Objetivos: 25%. CRUD/vinculos iniciales; falta alineacion profunda.
- Habitos: 25%. Base creada; falta robustez.
- Calendario: 10%. Pendiente de integracion real.
- Tareas: 5%. Concepto definido, no priorizar aun.
- Ajustes: 30%. Perfil, household y permisos iniciales.
- Investigacion tecnica: 20%. Primer mapa de librerias/APIs creado.

Bloque actual: Finanzas.

Avance estimado dentro de Finanzas:

- Modelo de cuentas y tarjetas: 84%.
- Registro manual y desde Luz: 78%.
- Importador BBVA / Visa: 70%.
- Reconciliacion de resumenes: 70%.
- Categorias financieras: 70%.
- Beneficiarios y economia familiar: 55%.
- Inflacion y lectura real: 25%.
- Reportes y dashboard financiero: 30%.

Tarea actual registrada:

- Mostrar actividad por cuenta desde la ultima conciliacion.
- Investigar open source y APIs para acelerar VEO.

## Finanzas: direccion de producto

Finanzas no debe ser una app generica de presupuesto. Debe ayudar a entender:

- Donde esta la plata.
- Cuanto se gasta.
- Cuanto se invierte.
- Si las inversiones dan frutos.
- Que gastos son fijos/habituales.
- Que gastos son excepcionales.
- Si los gastos estan alineados con objetivos, wishlist y vida deseada.
- Como impactan inflacion, tipo de cambio y moneda dura.
- Como se proyectan los proximos 6/12 meses.

Reglas clave:

- Cuentas, tarjetas, billeteras, efectivo, brokers e inversiones son cuentas/medios, no categorias.
- Pagar una tarjeta no es gasto si los consumos ya fueron cargados: es movimiento neutro.
- Comprar dolares/euros/cripto o invertir no es gasto: es movimiento patrimonial/neutro/inversion.
- Reintegros no son ingresos operativos reales.
- Prestamos recibidos no son ingresos reales.
- Evitar duplicados entre cargas desde Luz/manuales/fotos y resumenes bancarios.
- Ante duplicado probable, VEO debe sugerir vincular o descartar, no cargar dos veces.
- Las correcciones del usuario deben alimentar memoria de categorizacion.

## Finanzas: economia familiar compartida

Criterio aprobado:

En pareja/familia, la app no debe asumir que una cuenta usada significa "plata de esa persona".

Separar preguntas:

1. De donde salio.
   - Cuenta usada, tarjeta, billetera, efectivo.

2. Para quien fue.
   - Agustin, Vicky, Maximo, pareja, hogar, familia, otro.

Campos conceptuales relevantes:

- `createdByUserId`: quien registro.
- `sourceAccountId`: cuenta/tarjeta/billetera desde donde salio.
- `executedByUserId`: quien hizo fisicamente la compra, si importa.
- `beneficiaryType`: user / couple / household / child / family / other.
- `beneficiaryLabel`: Maximo, Hogar, Pareja, Familia.
- `scope`: personal / pareja / hogar / familia.
- `visibility`: Finanzas por default compartido en household; Diario por default privado.

No implementar por ahora:

- deudas entre Agustin y Vicky
- split exacto 50/50
- reembolsos automaticos
- quien le debe a quien
- propiedad individual estricta del dinero

## Finanzas: categorizacion

Criterio aprobado:

La taxonomia debe ser minima, clara y aprendible. No crear categorias nuevas automaticamente.

Tipos de movimiento:

- `expense`
- `income`
- `neutral`

Movimientos neutros:

- `internal_transfer`
- `credit_card_payment`
- `currency_exchange`
- `investment_movement`
- `loan_movement`
- `balance_adjustment`

Principios:

- Categorias madre pocas.
- Subcategorias concretas pero no hiper especificas.
- Comercios, marcas, plataformas o personas van como merchant/tags, no como categorias.
- Si algo cae repetidamente en "Otros", VEO debe proponer mejora.
- Archivar categorias/subcategorias poco usadas, no borrar historico.

Vehiculo/Auto:

- Se debe distinguir tenencia vs uso.
- Tenencia: seguro, patente, VTV, cochera, service.
- Uso: combustible, peajes, estacionamiento, lavado, multas, reparaciones.

Subcategoria pendiente ya mencionada:

- Psicologo / terapia debe existir dentro de Salud o Bienestar, segun taxonomia final.

## Finanzas: importacion y conciliacion

Ya se avanzo en:

- Parser PDF BBVA caja de ahorro.
- Parser Visa BBVA.
- Manejo de consumos USD.
- Tarjetas como cuentas de deuda.
- Pagos de tarjeta como movimientos neutros.
- Salvaguardas contra duplicados.
- Vinculacion de duplicados importados contra movimientos manuales/Luz.
- Resumen de importacion.
- Conciliacion usando saldo de cierre detectado.
- Balance adjustment neutro para ajustes de conciliacion.
- Integridad de saldo al editar/borrar movimientos.
- Busqueda por descripcion, categoria, merchant, cuenta, destino, alias, CBU/CVU, archivo importado, notas y trazas.

Problemas abiertos:

- Mejorar informacion visible de transferencias: destinatario, CBU/CVU, alias, nombre, cuenta destino y texto original.
- Seguir validando PDFs reales.
- Evitar que caja de ahorro sea confundida con tarjeta.
- Mejorar match de importaciones con movimientos manuales en monedas distintas (ej. gasto cargado EUR, resumen llega USD/ARS).
- Mejorar experiencia de confirmacion masiva: agrupar similares, no obligar a aprobar 1000 transacciones una por una.
- Mostrar actividad por cuenta desde ultima conciliacion.

## Finanzas: inflacion y moneda dura

Criterio aprobado:

La lectura financiera de VEO tiene que contemplar inflacion desde el diseno, especialmente en Argentina.

Toda lectura importante deberia poder verse en:

1. Valor nominal.
2. Valor real ajustado por inflacion.
3. Moneda dura cuando corresponda, especialmente USD/EUR.
4. Impacto sobre decisiones de vida, objetivos y wishlist.

Casos:

- Comparar gastos mes contra mes ajustados por inflacion.
- Detectar si un gasto fijo subio por encima/debajo de inflacion.
- Detectar si ingresos reales crecen o caen.
- Proyectar 6/12 meses contemplando inflacion.
- Ajustar wishlist en ARS por inflacion estimada.
- Entender patrimonio nominal vs real.

No debe requerir carga manual del usuario.

Fuentes a priorizar:

- BCRA como fuente oficial.
- DolarAPI como fuente practica para cotizaciones de mercado.
- ArgentinaDatos/Bluelytics/MacroHoy como backups o historicos si se validan.

## Luz: captura universal

Principio:

El usuario no deberia ir siempre a la pantalla correcta para registrar algo. Puede cargar desde Luz o desde la pantalla especifica.

Intenciones esperadas:

- `journal_entry`
- `financial_transaction`
- `wishlist_item`
- `goal`
- `habit`
- `calendar_event`
- `task`
- `unknown`

Reglas:

- Luz crea borradores, no guarda automaticamente sin confirmacion.
- El usuario puede guardar, editar o descartar.
- Si falta informacion, Luz pregunta solo lo necesario.
- Si la accion esta clara, no agregar preguntas innecesarias.
- Si el usuario expresa experiencia/emocion/contexto personal, tambien debe proponer guardar en Diario.
- Si es solo un gasto simple, no debe crear entrada de Diario por default.

Ejemplos esperados:

- "Gaste 18.000 en Uber con efectivo" -> gasto, ARS inferido, transporte / Uber-Cabify, cuenta efectivo ARS si existe o cuenta similar.
- "Compre zapatillas por 950 EUR con Visa BBVA y me senti conflictuado" -> gasto + entrada de Diario por contexto emocional.
- "Quiero comprar una TV Samsung de 700k para el living" -> item de Wishlist.
- "Quiero empezar a entrenar 3 veces por semana" -> posible habito.
- "Este ano quiero estar en mi mejor estado fisico" -> posible objetivo.

## Viajes

Criterio aprobado:

Viaje no debe ser solo una categoria financiera. Debe ser un contexto que agrupa gastos.

Entidad conceptual:

- `TravelTrip`
- destino, pais, ciudad, fechas, miembros, moneda principal, visibilidad, estado.

Gastos de viaje:

- Deben conservar categoria financiera general y contexto de viaje.
- Ejemplo: "Pague 45 EUR una cena en Roma con Visa BBVA"
  - Monto: 45
  - Moneda: EUR
  - Cuenta: BBVA - Visa
  - Categoria: Viajes
  - Subcategoria/travelCategory: Comidas y salidas
  - Viaje sugerido: Roma / Italia
  - Fecha default: hoy si no se menciona otra

Pantalla futura de detalle de viaje:

- total gastado
- total por moneda
- total convertido
- gastos por categoria de viaje
- gastos por cuenta
- gastos por persona
- compartidos vs personales
- pendientes de categorizar
- resumen de Luz

## Wishlist / La Lista

Objetivo:

Lista de cosas materiales, experiencias o grandes objetivos que se quieren comprar/lograr.

Sirve para:

- evitar compras impulsivas
- priorizar lo importante
- conectar compras con objetivos de vida
- entender impacto financiero
- comparar gastos reales contra deseos declarados

Campos actuales/inferidos:

- titulo
- precio estimado
- moneda
- prioridad
- razon
- categoria
- tipo: purchase / big_goal / experience / asset
- horizonte: short / medium / long / open
- targetDate
- owner: Agustin / Vicky / shared / other
- visibility
- link
- notas
- tags

Decision:

La prioridad debe ser relativa al resto de items. Luz deberia proponer ranking, pero el usuario puede editar.

Tambien puede haber grandes objetivos como casa, viaje, auto o inversiones.

## Diario Mental

Estado:

- Ya existe estructura de biblioteca.
- Journal debe ser privado por default.
- Se puede cargar desde Diario, pero muchas entradas vendran desde Inicio/Luz.

Necesidades:

- Buscador fuerte por fechas, categorias, temas y busqueda semantica.
- Preguntas tipo: "cuantas veces mencione que tenia que sumar a alguien al equipo comercial y no lo hice?"
- Analisis de patrones emocionales, preocupaciones recurrentes, avances y bloqueos.
- No diagnosticar ni actuar como terapeuta.

## Tareas

Concepto:

Tareas son cosas del dia a dia que surgen. No son habitos.

Necesidad:

- Una pantalla propia.
- Ver todas.
- Clasificar por importancia y urgencia.
- Decidir si son importantes, urgentes, postergables o desechables.
- No agregar friccion innecesaria.

Estado:

- Base de tipos creada.
- No priorizar implementacion hasta cerrar Finanzas.

## Modelo de datos actual

Documento `docs/DATA_MODEL_CURRENT.md`: no encontrado. Esta seccion combina `src/domain/models.ts` y `src/features/*/*.types.ts`.

Entidades base:

- UserProfile
- Household
- HouseholdMember
- HouseholdInvite
- JournalEntry
- FinancialAccount
- FinancialTransaction
- InvestmentSnapshot
- Goal
- Habit
- HabitCheckin
- CalendarEvent
- AIInsight
- TaskRecord
- TravelTrip
- WishlistItemRecord

Visibilidad:

- `private`
- `shared_with_partner`
- `household_shared`
- `app_public` en modelo base, aunque producto real deberia usar con cuidado.

Finanzas actuales:

- Monedas: ARS, USD, EUR, BRL, CLP, UYU.
- TransactionKind: expense, income, neutral.
- NeutralType: internal_transfer, credit_card_payment, currency_exchange, investment_movement, loan_movement, balance_adjustment.
- Cuentas: bank, wallet, investment, credit_card, cash.
- Transacciones guardan: monto, moneda, descripcion, categoria, subcategoria, tipo, cuenta origen/destino, tags, fecha, source, confidence, status, merchant, beneficiario, scope, viaje, duplicados, fingerprints y balance aplicado.

## Permisos y privacidad

Estado:

- Hay helpers de visibilidad en `src/domain/permissions.ts`.
- Diario/thoughts deben ser privados por default.
- En producto, Finanzas/Lista/Objetivos/Habitos tienden a `household_shared` para este caso familiar.
- Las reglas Firestore han sido actualizadas varias veces para permitir nuevos campos.

Riesgos:

- Revisar que helpers y reglas no contradigan la decision de producto: Diario privado, finanzas familiares compartidas.
- No exponer API keys ni tokens en frontend.
- Tokens Google Calendar deberian residir en backend/servidor o gestion segura.

## Investigacion open source

Fuente: `docs/OPEN_SOURCE_RESEARCH.md`.

No se instalo nada. Solo investigacion.

Top para estudiar/usar:

Finanzas:

1. Actual Budget
   - Estudiar modelo local-first, importadores, privacidad y UX.
2. Firefly III
   - Estudiar conceptos financieros, reportes, categorias, tags, presupuestos.
3. Brisk Budget
   - Estudiar import wizard, payee memory, recurring transactions.

Cotizaciones:

1. BCRA APIs
   - Fuente oficial para dolar oficial, inflacion, CER/UVA y macro.
2. DolarAPI
   - Practica para dolar blue, MEP, tarjeta, cripto y cotizaciones actuales.
3. ArgentinaDatos / Bluelytics
   - Fallback/historicos no oficiales, siempre cacheados y marcados por fuente.

Importacion:

1. pdfjs-dist
   - Ya instalado, mantener para PDFs.
2. Papa Parse
   - Primera integracion futura para CSV.
3. SheetJS CE / ExcelJS
   - Estudiar solo si aparecen XLS/XLSX reales.

UI desktop:

1. Radix UI
   - Primitivas accesibles sin imponer estilo.
2. shadcn/ui
   - Usar como referencia de patrones, no como identidad completa.
3. FullCalendar
   - Cuando se retome Calendario.

Graficos/tablas:

1. Recharts
   - Mantener para graficos simples/medianos.
2. Apache ECharts
   - Estudiar para dashboards financieros avanzados.
3. TanStack Table
   - Estudiar con cautela por incidente npm 2026.

Primeras integraciones recomendadas:

1. Papa Parse para importacion CSV.
2. Radix UI para formularios/selects/dialogs financieros.
3. DolarAPI + BCRA como capa cacheada de cotizaciones e inflacion.

## Documentos fuente

Documentos usados:

- `IMPLEMENTATION_PLAN.md`
- `docs/PROGRESO_VEO.md`
- `docs/OPEN_SOURCE_RESEARCH.md`
- Codigo actual para inferir rutas, pantallas y modelos.

Documentos pedidos pero no encontrados:

- `docs/VEO_CONTEXT_PACK.md`
- `docs/DATA_MODEL_CURRENT.md`
- `docs/ROUTES_AND_SCREENS.md`
- `docs/PENDING_DECISIONS.md`

Recomendacion:

Crear esos documentos mas adelante si se quiere separar:

- contexto de producto
- modelo de datos vivo
- mapa de pantallas
- decisiones pendientes

Por ahora, este archivo centraliza todo.

## Pendientes y problemas abiertos

Prioridad inmediata:

1. Cerrar Finanzas hasta 90%.
2. Validar saldos al crear/editar/borrar.
3. Mejorar conciliacion y duplicados entre Luz/manual/PDF.
4. Mejorar experiencia desktop de Finanzas.
5. Mejorar importacion con mas informacion de transferencias.
6. Implementar lectura de inflacion/cotizaciones cacheada.
7. Mejorar reportes: caja, deuda, inversiones, patrimonio, gastos fijos, gastos reales vs nominales.

No priorizar todavia:

- IA real avanzada
- Google Calendar write/create events
- Tareas completas
- UI/UX global profunda
- Diario semantico completo

Motivo:

Finanzas es la base que mas puede romper confianza si no esta bien. Primero robustez, despues expansion.

## Preguntas utiles para ChatGPT

Para estrategia:

- "Con este contexto, que falta para que Finanzas llegue a 90% de robustez?"
- "Que decision de arquitectura tomarias para no duplicar gastos entre carga manual, Luz, foto de factura y resumen bancario?"
- "Como diseniarias la UX de conciliacion sin hacer aprobar 1000 transacciones?"

Para producto:

- "Como deberia verse el dashboard financiero diario de VEO en desktop?"
- "Que info es verdaderamente util ver todos los dias y que deberia esconderse?"
- "Como mostrar inflacion y moneda dura sin abrumar?"

Para IA:

- "Como deberia estructurarse Universal Capture para que Luz proponga acciones confiables?"
- "Que schema JSON deberia devolver Luz para gastos, journal, wishlist, tareas y viajes?"

## Regla final

VEO debe ser una app que toque la vida real, no una app para llenar formularios.

Cada mejora deberia reducir friccion, aumentar claridad o evitar errores importantes.


# Open Source Research para VEO

Ultima actualizacion: 2026-06-08

Objetivo: detectar piezas open source, librerias y APIs que puedan acelerar VEO sin copiar una app entera ni integrar nada todavia.

Estado: investigacion inicial verificada con fuentes publicas. No se instalo ningun paquete y no se modifico codigo productivo.

## Contexto de stack actual

VEO hoy usa React 19, Vite, TypeScript, Tailwind CSS, Firebase/Firestore, Express, pdfjs-dist, Recharts, lucide-react, date-fns y Google APIs. Por eso se priorizan soluciones React/TypeScript, APIs simples, licencias permisivas y componentes que permitan mantener la identidad visual de VEO.

## Tabla comparativa

| Nombre | URL | Tipo | Area de VEO que podria ayudar | Que problema resuelve | Licencia | Stack / tecnologia | Ultima actividad o mantenimiento | Popularidad aproximada | Riesgos | Como podria integrarse en VEO | Recomendacion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Actual Budget | https://github.com/actualbudget/actual | app completa / inspiracion UX | Finanzas, modelos, importacion, privacidad | Finanzas local-first, presupuesto, cuentas, sync, modelo de transacciones | MIT | TypeScript, React, Node | Activo; repo actualizado Jun 7 2026 segun GitHub | ~27k stars, ~2.5k forks | No conviene copiar producto; su enfoque envelope budgeting no es igual a VEO | Estudiar modelo de datos, local-first, importadores, UX de finanzas | Estudiar |
| Firefly III | https://github.com/firefly-iii/firefly-iii | app completa / inspiracion tecnica | Finanzas, reportes, categorias, presupuestos | Sistema financiero self-hosted maduro con presupuestos, categorias, tags e importadores | AGPL-3.0 | PHP, Laravel, Vue/Twig | Activo; release v6.6.3 May 21 2026 | ~23k stars, ~2.2k forks | AGPL fuerte; stack no encaja; demasiado grande para VEO | Estudiar conceptos: presupuestos vs categorias vs tags, reportes, transferencias | Estudiar |
| Maybe Finance | https://github.com/maybe-finance/maybe | app completa / inspiracion visual | Finanzas, patrimonio, UI financiera | Personal finance app moderna con buen enfoque de patrimonio y dashboard | AGPL-3.0 | Ruby on Rails, Hotwire, Postgres | Repo indica no mantenido; ultimo release Jul 2025 | ~54k stars, ~5.6k forks | No mantenido; AGPL; marca registrada; stack no encaja | Solo mirar UX y modelado patrimonial, no usar codigo | Estudiar |
| Brisk Budget | https://briskbudget.app/ | app completa simple / inspiracion | Finanzas, importacion CSV, dashboard | App financiera self-hosted liviana con JSON, CSV import wizard y payee memory | MIT | Vanilla JS, Node, JSON | Activo segun sitio; proyecto simple | Popularidad menor; no verificada en GitHub en detalle | Puede ser muy simple para VEO; sin arquitectura React | Estudiar import wizard, payee autocomplete y recurring transactions | Estudiar |
| DolarAPI | https://dolarapi.com/docs/argentina/operations/get-dolares | API | Cotizaciones USD/ARS y otras monedas | Devuelve cotizaciones actuales de dolar en Argentina; tambien endpoint de cotizaciones de monedas | MIT segun docs | REST API, EsJS | Activa; docs actualizadas y playground disponible | Adopcion alta en ecosistema argentino; GitHub enlazado desde docs | No oficial; disponibilidad depende del proyecto | Usar como fuente rapida para dolar blue, MEP, tarjeta, cripto; cachear resultados | Usar |
| BCRA APIs | https://principales-variables.bcra.apidocs.ar/ | API oficial | USD oficial, inflacion, CER/UVA, datos macro | Fuente oficial para variables monetarias, cambiarias e inflacion | Aviso legal BCRA; docs MIT del portal apidocs | REST API | Activa; API monetarias v4.0, v3 con deprecacion 2026 | Fuente madre oficial | Puede tener menos variantes de mercado; cambios de version/deprecacion | Usar para dolar oficial, IPC/inflacion, CER/UVA y respaldo confiable | Usar |
| ArgentinaDatos | https://argentinadatos.com/docs/ | API | Cotizaciones historicas, datos Argentina | API publica no oficial con datos actualizados de Argentina | Open source; licencia no confirmada en esta pasada | REST API, EsJS | Activa; docs publicas | Adopcion media/alta en comunidad argentina | No oficial; validar licencia y SLA antes de depender | Usar como fallback/historicos, con cache propio | Estudiar |
| Bluelytics | https://bluelytics.com.ar/ | API | USD/ARS historico y blue/oficial | API muy usada para dolar blue/oficial y evolucion historica | No confirmada | REST API | Sitio activo | Adopcion historica en comunidad argentina | No oficial; documentacion limitada; disponibilidad variable | Fallback para historicos de dolar si BCRA/DolarAPI no alcanzan | Estudiar |
| MacroHoy | https://www.macrohoy.com.ar/ | API / inspiracion datos | Inflacion, dolar, indicadores macro | Centraliza indicadores economicos argentinos con API publica | Open source segun sitio; licencia pendiente de verificar | API REST, dashboard | Activo; sitio actualizado 2026 | Popularidad no verificada | Proyecto nuevo; validar estabilidad y fuente de datos | Estudiar para inflacion/cotizaciones/cache macro | Estudiar |
| pdfjs-dist / PDF.js | https://www.npmjs.com/package/pdfjs-dist | libreria | Parser PDF, importacion de resumenes | Extraccion/render de PDFs en cliente; ya esta en VEO | Apache-2.0 | JavaScript/TypeScript, Mozilla PDF.js | Muy activo; ultimas versiones 2026 | Millones de descargas semanales; paquete clave | Pesado; parsing bancario requiere reglas propias | Mantener como base para BBVA/Visa; mejorar capa de parser propia | Usar |
| Papa Parse | https://www.papaparse.com/ | libreria | CSV import/export | Parser CSV en navegador, streaming, workers, auto delimiter | MIT | JavaScript | Activo; npm 5.5.3 publicado recientemente | Muy usado; miles de dependientes | CSV bancarios varian mucho; requiere mapeo de columnas | Integrar para CSV import wizard cuando Finanzas este mas estable | Usar |
| SheetJS CE / xlsx | https://github.com/SheetJS/sheetjs | libreria | Excel/XLS/XLSX import | Lectura/escritura de planillas Excel | Apache-2.0 | JavaScript | Activo fuera de npm; distribucion por CDN/Git propio | Muy usado historicamente | Paquete npm xlsx puede estar desactualizado; revisar distribucion y seguridad | Usar solo si necesitamos XLS/XLSX real; preferir CSV primero | Estudiar |
| ExcelJS | https://github.com/exceljs/exceljs | libreria | Excel import/export | Lectura/escritura XLSX con estilos y streams | MIT | JavaScript | Ultimo release fuerte v4.4.0; repo con actividad irregular | ~13k stars aprox, alta adopcion | Issues abiertos; dependencias; mas backend que frontend | Alternativa a SheetJS para exportar reportes o importar XLSX | Estudiar |
| react-currency-input-field | https://www.npmjs.com/package/react-currency-input-field | componente | Inputs de dinero/moneda | Input de moneda con separadores, locale, prefijos/sufijos, sin dependencias | MIT | React, TypeScript | Ultima version 3.10.0 publicada hace meses | 235 dependents; adopcion media | Puede no calzar perfecto con UX propia | Probar en formularios financieros para ARS/USD/EUR | Usar |
| react-number-format | https://github.com/s-yadav/react-number-format | componente | Inputs de dinero/moneda | Formateo de numeros, caret engine, formatos custom | MIT | React | Mantenimiento saludable segun Snyk; v5.4.5 reciente | ~4k stars; paquete muy usado | Mas generico; puede requerir wrapper propio | Usar si necesitamos control fino de monto, miles y decimales | Usar |
| Recharts | https://recharts.org/ | libreria | Graficos financieros | Charts React simples; ya esta instalado en VEO | MIT | React, D3 internals | Activo; v3 en ecosistema | Muy usado; decenas de millones descargas semanales segun Snyk/otros | Performance limitada en datasets enormes; menos avanzado que ECharts | Mantener para dashboards basicos y medianos | Usar |
| Apache ECharts | https://github.com/apache/echarts | libreria | Graficos financieros avanzados | Visualizaciones interactivas, grandes datasets, tooltips, zoom, multiples series | Apache-2.0 | TypeScript/JavaScript, Canvas/SVG | Muy activo; release 6.1.0 May 19 2026 | ~66k stars, ~20k forks | API mas compleja; puede sentirse pesada | Evaluar para dashboard financiero avanzado si Recharts queda corto | Estudiar |
| TanStack Table | https://github.com/TanStack/table | libreria headless | Tablas de movimientos, import review | Tablas potentes y headless para React/TS | MIT | TypeScript, headless UI | Activo; pero hubo incidente npm TanStack en May 2026 | ~27k stars | Riesgo reciente de supply-chain; requiere fijar versiones limpias | Buena base para tabla desktop personalizada, despues de auditoria de seguridad | Estudiar |
| AG Grid Community | https://github.com/ag-grid/ag-grid | componente / libreria | Tablas desktop pesadas | Data grid completo con sorting, filtering, editing, pagination | MIT para Community; Enterprise comercial | TypeScript, React adapter | Activo | ~15k stars; usado enterprise | Riesgo de features Enterprise bloqueadas; identidad visual pesada | Usar solo si Finanzas necesita grid pesado tipo Excel | Estudiar |
| MUI X Data Grid | https://mui.com/x/react-data-grid/ | componente | Tablas de datos | Data grid React listo, community MIT | MIT community; Pro/Premium comercial | React, MUI | Muy activo; npm publicado recientemente | Alta adopcion; cientos de dependientes | Meter MUI puede ensuciar Tailwind/identidad VEO | Descartar por ahora salvo que se adopte MUI mas ampliamente | Descartar |
| FullCalendar React | https://fullcalendar.io/docs/react | componente | Calendario | Calendario robusto con vistas, eventos y drag/drop | MIT para standard; Premium comercial | React, TypeScript | Activo; v7 RC en 2026 | ~20k stars en org/repo | Premium para scheduler avanzado; CSS propio fuerte | Usar para vista calendario cuando se retome modulo Calendario | Usar |
| react-big-calendar | https://github.com/jquense/react-big-calendar | componente | Calendario | Calendario React mas simple, con eventos y vistas | MIT | React | Ultima version hace ~12 meses segun reactlibraries | ~8.6k stars, ~2.4M descargas/mes | Menos mantenido que FullCalendar; styling antiguo | Estudiar si queremos algo mas simple que FullCalendar | Estudiar |
| Tiptap | https://github.com/ueberdosis/tiptap | libreria | Diario Mental / Journal | Editor rich text headless, extensible, React compatible | MIT para core OSS | TypeScript, ProseMirror | Muy activo; release v3.23.6 May 2026 | ~37k stars, ~3k forks | Algunas features son SaaS/pagas; complejidad de editor | Usar para Diario si necesitamos notas ricas, fotos, links y estructura | Usar |
| Lexical | https://github.com/facebook/lexical | libreria | Diario Mental / Journal | Editor extensible, accesible, performante, creado por Meta | MIT | TypeScript, React | Activo; release v0.44.0 Apr 2026 | ~23k stars, ~2k forks | Mas bajo nivel; requiere mas trabajo de UX | Estudiar como alternativa mas controlada a Tiptap | Estudiar |
| Loop Habit Tracker | https://github.com/iSoron/uhabits | app completa / inspiracion UX | Habitos | Modelo de habitos sostenible, score, offline, sin presion toxica | GPL-3.0 | Android, Kotlin/Java | Release v2.3.1 Aug 2025 | ~9.9k stars | GPL; app Android no React | Estudiar concepto de score y no obsesionarse con streaks | Estudiar |
| Habitica | https://github.com/HabitRPG/habitica | app completa / inspiracion | Habitos, tareas | Separa habitos, dailies, tareas; gamificacion | GPL-3.0 codigo; assets CC BY-NC-SA | Node, Vue, MongoDB | Mantenimiento discutible/variable | Popularidad alta historica | Gamificacion no encaja con VEO sobrio; licencias restrictivas | Estudiar separacion conceptual, no copiar estetica | Estudiar |
| shadcn/ui | https://github.com/shadcn-ui/ui | componentes / inspiracion UI | UI desktop, formularios, dialogs, tabs | Componentes accesibles copiables y customizables con Tailwind/Radix | MIT | React, Tailwind, Radix, Vite compatible | Muy activo; release May 2026 | ~115k stars | Puede homogeneizar visualmente la app si se copia sin criterio | Usar patrones/componentes puntuales y adaptarlos a VEO | Usar |
| Radix UI Primitives | https://github.com/radix-ui/primitives | libreria headless | UI desktop, modals, selects, popovers | Primitivas accesibles sin imponer estilos | MIT | React | Activo/mantenido por WorkOS | ~18.9k stars | Muchas dependencias pequenas si se usa sin criterio | Base para selects/dialogs/popovers robustos manteniendo estetica VEO | Usar |
| Ariakit | https://ariakit.com/ | libreria headless | UI accesible | Componentes/hooks accesibles y unstyled | Licencia no confirmada en esta pasada | React | Activo; docs actualizadas | ~8.6k stars aprox | Validar licencia; alternativa menos mainstream | Estudiar si Radix no alcanza | Estudiar |
| dnd-kit | https://github.com/clauderic/dnd-kit | libreria | La Lista, tareas, ranking wishlist | Drag and drop flexible, accesible, moderno | MIT | React, TypeScript | Activo pero requiere verificar release actual | ~13k stars aprox | Curva de aprendizaje; cuidado con UX mobile | Usar para ranking editable de Wishlist y listas de tareas | Usar |
| @hello-pangea/dnd | https://github.com/hello-pangea/dnd | libreria | La Lista, ranking simple | Drag/drop accesible para listas, fork mantenido de react-beautiful-dnd | Apache-2.0 | React, TypeScript | Ultimo release Feb 2025; mantenimiento moderado | ~3.7k stars, ~4.5M descargas/mes | Menos flexible que dnd-kit; mantenimiento menos intenso | Opcion simple para listas verticales si dnd-kit es excesivo | Estudiar |
| Dexie.js | https://github.com/dexie/Dexie.js | libreria local-first | Seguridad/privacidad local-first, offline | Wrapper robusto para IndexedDB; offline-first browser storage | Apache-2.0 | JavaScript/TypeScript, IndexedDB | Muy activo; v4.4.3 May 27 2026 | ~14.3k stars | Sync avanzado requiere Dexie Cloud u otro backend; privacidad depende de implementacion | Estudiar para cache local, borradores offline, import staging privado | Estudiar |
| RxDB | https://github.com/pubkey/rxdb | libreria local-first | Privacidad local-first, offline, sync | DB local-first reactiva con sync a multiples backends | Apache-2.0 core | JavaScript/TypeScript, IndexedDB/SQLite/etc. | Activo; release 17.2.0 May 2026 | ~23k stars | Mas compleja; algunas features premium; riesgo de sobrearquitectura | Estudiar si VEO migra a offline-first serio | Estudiar |

## Top recomendaciones para VEO

### 3 opciones para Finanzas

1. **Actual Budget** - estudiar primero. Encaja por TypeScript, local-first, importadores y filosofia de privacidad.
2. **Firefly III** - estudiar conceptos, no codigo. Muy bueno para separar cuentas, categorias, tags, presupuestos y reportes.
3. **Brisk Budget** - estudiar simplicidad: CSV wizard, payee memory, recurring transactions y dashboard sin sobreingenieria.

### 3 opciones para cotizaciones USD/ARS

1. **BCRA APIs** - fuente madre para dolar oficial, inflacion, CER/UVA y datos macro.
2. **DolarAPI** - fuente practica para dolar blue, MEP, tarjeta, cripto y cotizaciones actuales.
3. **ArgentinaDatos / Bluelytics** - fallback/historicos no oficiales, siempre cacheados y marcados por fuente.

### 3 opciones para importacion CSV/PDF

1. **pdfjs-dist** - mantener. Ya esta instalado y es correcto para PDFs bancarios.
2. **Papa Parse** - primera integracion futura para CSV por simplicidad, streaming y privacidad en cliente.
3. **SheetJS CE o ExcelJS** - estudiar solo cuando aparezcan XLS/XLSX reales; no meter todavia si CSV alcanza.

### 3 opciones para UI desktop

1. **Radix UI** - mejor base para selects, dialogs, popovers y accesibilidad sin imponer estilo.
2. **shadcn/ui** - usar como fuente de patrones/codigo adaptable, no como identidad visual completa.
3. **FullCalendar** - cuando retomemos Calendario, es la opcion mas robusta para vistas de calendario.

### 3 opciones para graficos/tablas

1. **Recharts** - mantener para graficos simples y medianos; ya esta instalado.
2. **Apache ECharts** - estudiar para dashboards financieros avanzados con zoom, multiples series y volumen.
3. **TanStack Table** - estudiar para tabla de movimientos/importaciones, pero con cautela por incidente npm 2026.

### 3 opciones para estudiar como inspiracion

1. **Actual Budget** - local-first, presupuesto, privacidad, importacion.
2. **Firefly III** - conceptos financieros, reportes, tags/categorias/presupuestos.
3. **Loop Habit Tracker** - habitos sostenibles sin productividad toxica.

## Primeras integraciones recomendadas

1. **Papa Parse para CSV import wizard**
   - Por que: nos permite importar movimientos CSV sin mandar archivos a servidores externos, con buen manejo de archivos grandes y errores.
   - Momento: despues de cerrar los bugs actuales de saldos/importacion PDF.

2. **Radix UI para formularios financieros criticos**
   - Por que: mejora selects, dialogs, popovers y accesibilidad sin forzar una estetica ajena.
   - Momento: cuando hagamos el redisenio UI/UX de Finanzas en PC.

3. **DolarAPI + BCRA como capa de cotizaciones cacheada**
   - Por que: VEO necesita ARS/USD/EUR, inflacion y lectura real. DolarAPI da mercado rapido; BCRA da fuente oficial.
   - Momento: antes de cerrar dashboard financiero 90%, para que las lecturas nominales/reales no lleven a conclusiones equivocadas.

## Decisiones de no integrar todavia

- No integrar apps completas: Actual, Firefly, Maybe o Brisk se estudian, no se copian.
- No adoptar MUI X Data Grid por ahora: meter MUI puede ensuciar la identidad Tailwind/VEO.
- No migrar a local-first completo todavia: Dexie/RxDB son importantes, pero implican arquitectura mayor.
- No instalar TanStack Table hasta revisar versiones limpias por el incidente de supply-chain de mayo 2026.
- No sumar un editor rich text pesado al Diario hasta cerrar Finanzas.

## Fuentes principales consultadas

- Actual Budget GitHub: https://github.com/actualbudget/actual
- Firefly III GitHub/docs: https://github.com/firefly-iii/firefly-iii y https://docs.firefly-iii.org/
- Maybe Finance GitHub: https://github.com/maybe-finance/maybe
- DolarAPI docs: https://dolarapi.com/docs/argentina/operations/get-dolares
- BCRA APIs: https://www.bcra.gob.ar/apis-banco-central/ y https://principales-variables.bcra.apidocs.ar/
- ArgentinaDatos docs: https://argentinadatos.com/docs/
- PDF.js/pdfjs-dist: https://www.npmjs.com/package/pdfjs-dist y https://github.com/mozilla/pdf.js
- Papa Parse: https://www.papaparse.com/
- TanStack Table docs/postmortem: https://tanstack.com/table y https://tanstack.com/blog/npm-supply-chain-compromise-postmortem
- Apache ECharts: https://github.com/apache/echarts
- shadcn/ui: https://github.com/shadcn-ui/ui
- Radix UI: https://github.com/radix-ui/primitives
- Dexie.js: https://github.com/dexie/Dexie.js
- RxDB: https://github.com/pubkey/rxdb
- FullCalendar React: https://fullcalendar.io/docs/react
- Tiptap: https://github.com/ueberdosis/tiptap
- Lexical: https://github.com/facebook/lexical

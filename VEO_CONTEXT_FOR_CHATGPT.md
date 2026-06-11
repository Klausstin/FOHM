# Contexto actualizado de VEO para ChatGPT

Ultima actualizacion: 2026-06-11

Este archivo resume el estado actual de VEO para compartirlo con ChatGPT u otros asistentes. No es un volcado completo de codigo: prioriza vision, decisiones troncales, arquitectura, estado real, pendientes y problemas abiertos.

## Que es VEO

VEO significa **Vida en Orden**.

Definicion conceptual:

```text
VEO es un sistema personal de claridad para entenderte mejor, decidir mejor y vivir mas alineado.
```

Claim:

```text
Entendete mejor. Decidi mejor. Vivi mas alineado.
```

Version extendida:

```text
VEO te ayuda a registrar tu vida, detectar patrones, definir objetivos autenticos y tomar mejores decisiones sobre tu tiempo, tus habitos, tus finanzas y tu energia, sin desordenar la vida que queres construir.
```

La app nacio como una primera version llamada "Mind & Money" creada en Google AI Studio. El codigo se esta refactorizando por fases hacia VEO.

## Capas del producto

VEO ordena la experiencia en tres capas:

1. **Entendete mejor**
   Diario, patrones, errores, aciertos, gustos, emociones, ideas recurrentes, bloqueos, deseos autenticos, energia y aprendizajes personales.

2. **Decidi mejor**
   Objetivos, decisiones, finanzas, calendario, prioridades, trade-offs, planificacion, proximos pasos, uso del tiempo y uso de la plata.

3. **Vivi mas alineado**
   Vida real, habitos, pareja, salud, descanso, familia, rutina, energia, disfrute y sostenibilidad.

## Luz

La inteligencia dentro de VEO se llama **Luz**.

Luz no debe ser un chatbot generico. Debe ayudar a ver patrones, contradicciones y proximos pasos para tomar decisiones mas alineadas con la vida que el usuario quiere construir.

Luz debe:

- usar datos estructurados;
- distinguir datos reales, estimados e inferidos;
- pedir informacion solo cuando hace falta;
- proponer acciones, pero dejar que el usuario confirme;
- respetar privacidad por modulo;
- evitar diagnosticos, autoayuda generica y productividad toxica.

Luz debe funcionar como entrada universal. El usuario puede escribir o dictar algo, y Luz propone si eso parece:

- entrada de diario;
- gasto, ingreso o transferencia;
- item de Wishlist;
- objetivo;
- habito;
- evento;
- tarea;
- desconocido.

Luz crea borradores y el usuario confirma, edita o descarta.

## Principios troncales

- El producto debe explicarse por uso, no por textos largos en pantalla.
- La app debe pedirle al usuario la menor carga posible.
- Si VEO puede inferir algo con confianza razonable, debe hacerlo y permitir correccion.
- Si VEO no esta seguro, debe preguntar poco y bien.
- No se crean categorias nuevas automaticamente.
- Comercios, marcas, plataformas y personas no son categorias financieras: son merchant, tags, notas o beneficiarios.
- Las cuentas usadas no significan propiedad individual del dinero.
- En la dinamica familiar, Finanzas, Wishlist, Objetivos y Habitos son `household_shared` por defecto.
- Diario Mental es `private` por defecto.
- APIs bancarias y de billeteras son post-MVP: primero debe cerrar Finanzas usable con carga desde Luz, carga manual, PDF/CSV, saldos, conciliacion, categorias y reportes.

## Estado macro actual

La app corre localmente y tiene estas secciones principales:

- Inicio
- Luz
- Diario Mental
- Finanzas
- Wishlist / La Lista
- Objetivos
- Habitos
- Calendario
- Ajustes

Estado estimado por modulo:

- Finanzas: 94% estimado. Prioridad actual y MVP central del producto.
- Luz: 45% estimado. Captura universal inicial; falta IA real y mejor interpretacion.
- Panel General: 35% estimado. Necesita dashboard mas utilitario y menos explicativo.
- Diario Mental: 45% estimado. Ya tiene estructura de biblioteca; falta busqueda semantica e IA real.
- Wishlist / La Lista: 35% estimado. Base creada; falta ranking inteligente y conexion fuerte con finanzas.
- Objetivos: 25% estimado. CRUD y vinculos iniciales; falta criterio profundo y alineacion real.
- Habitos: 25% estimado. Base creada; falta robustez y conexion con Luz/objetivos.
- Calendario: 10% estimado. Integracion real queda para despues de Finanzas.
- Tareas: 5% estimado. Concepto definido, no implementar fuerte hasta cerrar Finanzas.
- Ajustes: 30% estimado. Perfil, household y permisos iniciales.
- Documentacion troncal: 65% estimado. README actualizado como mapa central.
- Investigacion tecnica: 20% estimado. Primer mapa de librerias, APIs y proyectos open source creado.

Decision vigente:

```text
No avanzar fuerte sobre otros modulos grandes hasta dejar Finanzas usable al 100% para Agustin y Vicky.
```

## Finanzas: objetivo actual

Finanzas es el modulo central actual porque permite empezar a usar VEO en la vida real.

Finanzas MVP al 100% significa que VEO puede usarse con datos reales sin miedo a perder informacion ni romper saldos basicos.

No significa tener APIs bancarias conectadas. Las APIs son post-MVP.

## Finanzas: avances integrados

Ya existe:

- cuentas financieras separadas por tipo: banco, billetera, efectivo, inversion y tarjeta de credito;
- tarjetas de credito modeladas como cuentas de deuda;
- movimientos `expense`, `income`, `neutral` y `transfer`;
- pagos de tarjeta sin contarlos dos veces como gasto;
- carga manual desde Finanzas;
- carga desde Luz;
- importacion de PDFs BBVA para caja de ahorro y Visa;
- importacion CSV beta;
- procesamiento interno de historial Wallet como aprendizaje;
- deteccion de duplicados por resumen, huella de movimiento y similitud;
- reconciliacion de resumenes;
- saldos de cierre y ajustes neutros;
- acciones masivas de revision financiera;
- categorias financieras minimas y aprendibles;
- memoria de comercios/correcciones;
- aprendizajes financieros desactivables;
- beneficiarios y economia familiar compartida;
- filtros por cuenta y beneficiario;
- inflacion argentina como criterio de lectura financiera;
- dashboard/resumen mensual inicial;
- ritmo diario de gasto mensual;
- cuenta mas usada del mes;
- variacion real contra mes anterior;
- mayor cambio mensual por categoria;
- diagnostico financiero compacto;
- backup JSON completo;
- export CSV legible;
- prueba local de integridad de saldos con `npm run finance:smoke`.

## Finanzas: bloques y avance estimado

- Modelo de cuentas y tarjetas: 91%.
  Saldos, deuda de tarjeta, reversas seguras y smoke test local cubren el flujo critico. Falta validacion real con datos de Agustin/Vicky.

- Registro manual y desde Luz: 82%.
  Falta validar muchos casos reales, pero ya existe base de captura y guardado.

- Importador BBVA / Visa / CSV: 86%.
  Falta probar mas PDFs/CSV reales y ajustar mapeos.

- Reconciliacion de resumenes: 81%.
  Ya hay cierre de saldo, duplicados y vinculacion. Falta validar flujo masivo con datos reales.

- Categorias financieras: 85%.
  Hay categorias minimas, aprendizaje, memoria y limpieza. Falta seguir puliendo casos reales.

- Beneficiarios y economia familiar: 62%.
  Se separa cuenta usada de beneficiario, pero falta pulir UI/filtros y lenguaje.

- Inflacion y lectura real: 25%.
  Hay base y criterio, falta conectar mejor con reportes y proyecciones.

- Reportes y dashboard financiero: 67%.
  Hay primeras lecturas practicas, falta hacerlo mas util para uso diario.

- Backup y seguridad de datos: 86%.
  Export JSON y CSV listos; falta probar descarga real antes de carga masiva y definir restauracion futura.

- Integraciones financieras automaticas: post-MVP.
  Mercado Pago API, BBVA API o agregadores no cuentan dentro del 100% MVP.

## Finanzas: pendientes para llegar a 100% usable

Prioridad concreta:

1. Probar flujo real en la app: crear gasto, editar monto/cuenta, borrar gasto y verificar saldo contra la prueba local.
2. Descargar backup financiero y CSV antes de cargar datos reales masivos.
3. Validar que "Ver movimientos" desde una cuenta ayude a auditar saldos reales.
4. Validar el panel de movimientos a revisar y aplicar saldo faltante si aparece.
5. Probar CSV reales de banco/billetera/broker y ajustar mapeo de columnas.
6. Probar gastos reales desde Luz para validar memoria Wallet, beneficiarios y categorias.
7. Probar resumen mensual y diagnostico con datos reales, ajustando lo que no ayude en el uso diario.
8. Mantener el foco: no avanzar a otros modulos grandes hasta que Finanzas quede como MVP usable al 100%.

## Finanzas: decisiones de producto

### Economia familiar

VEO debe reflejar una economia familiar compartida, no una app de roommates que divide gastos.

No confundir:

- cuenta usada;
- quien registro;
- para quien fue;
- categoria;
- beneficiario;
- scope.

Ejemplo:

```text
30.000 ARS - Higiene / Bebe - Para Maximo - Salio de Mercado Pago Agustin
```

No significa que "la plata era de Agustin". Significa que esa fue la cuenta usada.

No implementar por ahora:

- sistema de deudas entre Agustin y Vicky;
- split exacto 50/50;
- reembolsos automaticos;
- quien le debe a quien;
- propiedad individual del dinero.

### Categorias

La taxonomia financiera debe ser minima, aprendible y guiada por uso real.

Reglas:

- usar pocas categorias madre;
- no crear categorias nuevas automaticamente;
- comercios, marcas, plataformas o personas son merchant/tags/notas/beneficiarios, no categorias;
- Visa, Mastercard, BBVA, Mercado Pago, efectivo, PayPal, etc. son cuentas o medios de pago;
- pago de tarjeta no es gasto si los consumos ya fueron cargados;
- compra de dolares/euros/cripto/inversiones no es gasto: es movimiento patrimonial/neutro;
- reembolsos y prestamos no son ingresos operativos reales.

Tipos de movimiento:

- `expense`
- `income`
- `neutral`

Neutrales:

- `internal_transfer`
- `credit_card_payment`
- `currency_exchange`
- `investment_movement`
- `loan_movement`
- `balance_adjustment`

### Inflacion

Para Argentina, VEO no debe leer Finanzas solo en valor nominal.

Lecturas importantes deberian poder verse en:

- valor nominal;
- valor real ajustado por inflacion;
- moneda dura cuando corresponda;
- impacto sobre decisiones de vida, objetivos y Wishlist.

La inflacion no debe ser un campo manual. VEO debe obtenerla automaticamente desde fuente oficial o confiable y cachearla.

### Importacion y conciliacion

La experiencia deseada no es aprobar 1000 transacciones una por una.

VEO debe:

- guardar automaticamente lo que esta suficientemente claro;
- agrupar lo dudoso;
- pedir correcciones por grupo cuando hay patrones repetidos;
- mostrar evidencia completa cuando haga falta;
- evitar duplicados entre Luz/manual/foto/resumen;
- permitir vincular un movimiento importado con uno existente.

### Backup y datos reales

Antes de cargar datos reales masivos:

- descargar backup JSON;
- descargar CSV;
- probar flujo basico de saldos;
- tener claro como recuperar datos si algo sale mal.

## Arquitectura actual

Stack:

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Firebase Auth
- Firestore
- Express local para Vite y OAuth de Google Calendar
- Firebase CLI para reglas
- Google Calendar API
- Gemini API
- Recharts
- Papa Parse
- pdfjs-dist
- lucide-react
- motion/react

Estructura relevante:

```text
src/
  components/
    layout/
    ui/
  domain/
    household.ts
    models.ts
    permissions.ts
  features/
    finance/
    goals/
    habits/
    journal/
    luz/
    wishlist/
  lib/
  services/
scripts/
docs/
```

Componentes grandes a refactorizar:

- `src/components/FinanceTracker.tsx` sigue siendo grande. La prioridad fue robustez funcional; luego debe dividirse mas.

## Comandos utiles

Instalar:

```powershell
npm install
```

Correr app:

```powershell
npm run dev
```

Build:

```powershell
npm run build
```

Tipos:

```powershell
npm run lint
```

Prueba local de saldos:

```powershell
npm run finance:smoke
```

Deploy de reglas Firestore:

```powershell
firebase.cmd deploy --project ai-studio-applet-webapp-8efca --only firestore:ai-studio-0e1ef577-1657-412f-88ed-bb624294b44b
```

Si Firebase pide reauth:

```powershell
firebase login --reauth
```

Cuenta que funciono para deploy:

```text
agustin@granberta.com
```

## Documentacion importante

- `README.md`: biblia actual del proyecto.
- `docs/PROGRESO_VEO.md`: estado vivo de modulos, bloques, tareas y proximos pasos.
- `docs/FINANCE_COMPLETION_PLAN.md`: criterio para cerrar Finanzas como MVP usable.
- `docs/FINANCE_AUTOMATION_STRATEGY.md`: decision de dejar APIs bancarias para post-MVP.
- `docs/FINANCE_INFLATION_STRATEGY.md`: criterio de inflacion, valor nominal y valor real.
- `docs/OPEN_SOURCE_RESEARCH.md`: investigacion de librerias, APIs y proyectos open source.
- `docs/VEO_PRODUCT_VISION.md`: vision conceptual de VEO y Luz.
- `IMPLEMENTATION_PLAN.md`: plan inicial y auditoria tecnica.

## Preguntas utiles para ChatGPT

Al usar este contexto, conviene pedir:

- Revisa si el README esta bien como documento troncal de VEO.
- Detecta contradicciones entre vision, Finanzas MVP y decisiones post-MVP.
- Que falta para que Finanzas sea 100% usable con datos reales?
- Como simplificarias la UX de importacion masiva sin perder control?
- Como diseniarias recuperacion/restauracion segura de backup sin sobrecomplicar la UI?
- Que riesgos ves en saldos, duplicados, categorias y memoria financiera?
- Que deberia quedar fuera del MVP para no abrir demasiado el alcance?

## Regla final

Finanzas es la base de confianza del producto. Si Finanzas duplica gastos, rompe saldos, pierde datos o pide demasiado trabajo manual, VEO pierde credibilidad.

Por eso el orden actual es:

1. Cerrar Finanzas 100% usable.
2. Proteger datos reales.
3. Recien despues avanzar fuerte en otros modulos.

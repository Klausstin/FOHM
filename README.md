# VEO / Vida en Orden

VEO significa **Vida en Orden**.

La app nacio como una primera version llamada "Mind & Money" creada en Google AI Studio. Hoy el producto se esta convirtiendo en VEO: un sistema personal y familiar para registrar la vida real, entender patrones y tomar mejores decisiones sin convertir todo en productividad vacia.

## Definicion conceptual

```text
VEO es un sistema personal de claridad para entenderte mejor, decidir mejor y vivir mas alineado.
```

Claim principal:

```text
Entendete mejor. Decidi mejor. Vivi mas alineado.
```

Version extendida:

```text
VEO te ayuda a registrar tu vida, detectar patrones, definir objetivos autenticos y tomar mejores decisiones sobre tu tiempo, tus habitos, tus finanzas y tu energia, sin desordenar la vida que queres construir.
```

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

Luz no debe ser un chatbot generico. Su rol es ayudar a ver patrones, contradicciones y proximos pasos para tomar decisiones mas alineadas con la vida que el usuario quiere construir.

Luz debe poder ayudar a responder preguntas como:

- Mis gastos estan alineados con mis prioridades?
- Estoy sosteniendo mis objetivos con habitos reales?
- Mi calendario refleja lo que digo que me importa?
- Que patrones aparecen en mi diario?
- Que compras o gastos se repiten mas de lo que creo?
- Que decision concreta conviene tomar ahora?

Luz debe:

- usar datos estructurados;
- distinguir datos reales, estimados e inferidos;
- pedir informacion solo cuando hace falta;
- proponer acciones, pero dejar que el usuario confirme;
- respetar privacidad por modulo;
- evitar diagnosticos, autoayuda generica y productividad toxica.

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

## Estado actual

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

El foco actual del proyecto es **Finanzas**. La decision vigente es no abrir modulos grandes nuevos hasta dejar Finanzas como MVP usable al 100% para Agustin y Vicky.

## Finanzas MVP

Finanzas es el modulo central actual porque permite empezar a usar VEO en la vida real.

Ya hay avances integrados en:

- cuentas financieras separadas por tipo: banco, billetera, efectivo, inversion y tarjeta de credito;
- tarjetas de credito modeladas como cuentas de deuda;
- gastos, ingresos, transferencias y movimientos neutros;
- pagos de tarjeta sin contarlos dos veces como gasto;
- carga manual y carga desde Luz;
- importacion de PDFs BBVA para caja de ahorro y Visa;
- importacion CSV beta;
- procesamiento interno de historial Wallet como aprendizaje;
- deteccion de duplicados y reconciliacion;
- saldos de cierre y ajustes neutros;
- categorias financieras minimas y aprendibles;
- memoria de comercios/correcciones;
- beneficiarios y economia familiar compartida;
- inflacion argentina como criterio de lectura financiera;
- backup JSON completo;
- export CSV legible;
- prueba local de integridad de saldos;
- validador local de backup financiero.

Finanzas MVP al 100% significa que VEO puede usarse con datos reales sin miedo a perder informacion ni romper saldos basicos. No significa tener APIs bancarias conectadas.

Queda seguir cerrando:

- prueba real en la app con crear, editar y borrar movimientos;
- validacion de saldos con datos reales;
- importacion masiva con mas PDFs/CSV reales;
- mejor lectura de cuotas futuras;
- restauracion o recuperacion de backup;
- dashboard financiero diario/mensual mas util;
- lectura real vs nominal con inflacion;
- reportes claros para usar con Vicky.

## Modulos

### Inicio

Debe ser un tablero practico, no una landing page. Sirve para capturar rapido con Luz, ver senales importantes y entender si la vida esta razonablemente en orden.

### Luz

Debe funcionar como entrada universal. El usuario puede escribir o dictar algo, y Luz propone si eso parece:

- entrada de diario;
- gasto, ingreso o transferencia;
- item de Wishlist;
- objetivo;
- habito;
- evento;
- tarea;
- desconocido.

Luz crea borradores y el usuario confirma, edita o descarta.

### Diario Mental

Es una biblioteca personal. El lugar principal para cargar puede ser Inicio/Luz, pero Diario debe ser el lugar donde se revisan entradas, fechas, temas, busquedas y patrones.

### Finanzas

Prioridad actual. Debe permitir entender caja, deuda, gastos, ingresos, cuentas, beneficiarios, categorias, inflacion, importaciones, duplicados y decisiones financieras.

### Wishlist / La Lista

Lista de compras y deseos materiales, individuales o compartidos. Debe ayudar a evitar compras impulsivas y alinear compras con objetivos reales.

### Objetivos

Deben representar direccion vital, no solamente tareas grandes. Deben conectarse con habitos, finanzas, calendario, diario y Wishlist.

### Habitos

Acciones repetibles que sostienen objetivos. No deben convertirse en una lista infinita de obligaciones.

### Calendario

Post-Finanzas. Debe mostrar si el tiempo refleja prioridades y eventualmente ayudar a bloquear tiempo para ponerse al dia.

### Tareas

Planificado, no implementar fuerte hasta cerrar Finanzas. Debe ordenar tareas por importancia, urgencia, postergacion y descarte.

## Stack

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

## Correr localmente

Instalar dependencias:

```powershell
npm install
```

Levantar la app:

```powershell
npm run dev
```

Abrir:

```text
http://localhost:3000
```

Verificar build:

```powershell
npm run build
```

Chequeo de tipos:

```powershell
npm run lint
```

Prueba local de saldos de Finanzas:

```powershell
npm run finance:smoke
```

Validar un backup JSON de Finanzas:

```powershell
npm run finance:backup:validate -- "C:\ruta\al\veo-finanzas-backup.json"
```

Dry-run para limpiar datos financieros de prueba sin borrar estructura base:

```powershell
npm run finance:reset-test-data -- --email agustin@granberta.com
```

Este script usa credenciales admin locales de Google Cloud. Si aparece un error de `default credentials`, no borro nada: configurar primero Application Default Credentials con Google Cloud CLI o una service account. `firebase login` alcanza para desplegar reglas, pero no para este script admin.

Borrado real de datos financieros de prueba:

```powershell
npm run finance:reset-test-data -- --email agustin@granberta.com --apply --confirm "BORRAR DATOS FINANCIEROS DE PRUEBA"
```

## Variables de entorno

Crear `.env` o `.env.local` segun el entorno:

```env
GEMINI_API_KEY=
APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SESSION_SECRET=
```

Notas:

- Sin `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, Google Calendar no funciona.
- Sin `GEMINI_API_KEY`, las features de IA real no deben considerarse listas.
- No subir archivos `.env` reales al repo.

## Firebase

Cuando cambian reglas de Firestore, hay que desplegarlas:

```powershell
firebase.cmd deploy --project ai-studio-applet-webapp-8efca --only firestore:ai-studio-0e1ef577-1657-412f-88ed-bb624294b44b
```

Si las credenciales vencen:

```powershell
firebase login --reauth
```

La cuenta que funciono para deploy fue:

```text
agustin@granberta.com
```

## Warnings conocidos

Durante `npm run build` pueden aparecer warnings de chunks grandes y bundling de Firebase. Hoy no bloquean el build.

Tambien puede aparecer:

```text
WARNING: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set.
```

Eso es esperado si todavia no se configuro Google Calendar OAuth.

## Privacidad y permisos

Regla critica:

```text
El Diario Mental es privado por defecto y no se comparte automaticamente.
```

Visibilidades base:

- `private`
- `shared_with_partner`
- `household_shared`
- `app_public`

Regla de producto:

- Diario Mental: privado por defecto.
- Finanzas, Wishlist, Objetivos y Habitos: compartido con el hogar por defecto.

## Estructura relevante

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

## Documentacion importante

- `docs/PROGRESO_VEO.md`: estado vivo de modulos, bloques, tareas y proximos pasos.
- `docs/FINANCE_COMPLETION_PLAN.md`: criterio para cerrar Finanzas como MVP usable.
- `docs/FINANCE_REAL_USE_TEST_PROTOCOL.md`: prueba controlada antes de cargar datos reales masivos.
- `docs/FINANCE_BACKUP_RECOVERY_PLAYBOOK.md`: pasos para actuar si algo sale mal con datos financieros reales.
- `docs/FINANCE_AUTOMATION_STRATEGY.md`: decision de dejar APIs bancarias para post-MVP.
- `docs/FINANCE_INFLATION_STRATEGY.md`: criterio de inflacion, valor nominal y valor real.
- `docs/OPEN_SOURCE_RESEARCH.md`: investigacion de librerias, APIs y proyectos open source.
- `docs/VEO_PRODUCT_VISION.md`: vision conceptual de VEO y Luz.
- `VEO_CONTEXT_FOR_CHATGPT.md`: contexto consolidado para compartir con ChatGPT u otros asistentes.
- `IMPLEMENTATION_PLAN.md`: plan inicial y auditoria tecnica.

## Regla de seguimiento

Cada respuesta sobre VEO debe empezar con un encabezado de progreso:

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

El archivo de seguimiento vivo es:

```text
docs/PROGRESO_VEO.md
```

## Filosofia de trabajo actual

1. Cerrar Finanzas antes de avanzar fuerte en otros modulos.
2. Proteger datos reales antes de cargar masivamente.
3. Priorizar flujos simples para usuario final.
4. Usar confirmaciones solo cuando agregan confianza.
5. Automatizar clasificacion, deduplicacion y memoria sin quitar control.
6. Evitar deuda tecnica cuando una extraccion simple mejora confiabilidad.
7. APIs automaticas despues del MVP, no como bloqueo del MVP.

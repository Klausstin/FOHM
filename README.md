# VEO / Vida En Orden

VEO significa **Vida En Orden**.

La app nacio como una primera version llamada "Mind & Money" creada en Google AI Studio. El codigo se esta refactorizando por fases, sin rehacer todo desde cero salvo donde convenga por calidad de producto.

## Vision

VEO es un sistema operativo personal para entender quien sos, definir objetivos autenticos y tomar mejores decisiones sin desordenar la vida que queres vivir.

Bajada:

```text
Entendete mejor. Elegi mejor. Vivi mas alineado.
```

La capa funcional incluye diario, objetivos, habitos, calendario y finanzas. La idea profunda es ayudar al usuario a revisar si lo que hace, lo que dice que quiere y la vida que esta construyendo estan alineados.

## Luz

La IA dentro de VEO se llama **Luz**.

Luz no debe ser un chatbot generico. Su rol es ayudar a ver patrones, contradicciones, desalineaciones y proximos pasos concretos.

Luz debe poder analizar, cuando haya datos suficientes:

- Si los habitos actuales sostienen los objetivos anuales.
- Si el calendario refleja las prioridades declaradas.
- Si los gastos estan al servicio de la vida que el usuario dice querer.
- Si el diario muestra patrones emocionales, preocupaciones o bloqueos recurrentes.
- Si un objetivo parece autentico o parece venir de comparacion, presion externa o impulso.
- Si el usuario avanza en una meta pero descuida salud, pareja, descanso, finanzas o disfrute.

Reglas de producto:

- No empujar productividad por productividad.
- No asumir que mas eficiencia siempre es mejor.
- No proponer objetivos genericos.
- No diagnosticar ni actuar como terapeuta.
- No inventar datos.
- Si falta informacion, pedir mejor carga de datos.
- Respetar privacidad antes de construir contexto para IA.

## Estado Actual

La app corre localmente y tiene estas secciones:

- Inicio
- Diario Mental
- Finanzas
- Objetivos
- Habitos
- Calendario
- Ajustes

Avances ya integrados:

- UI principal migrando a espanol.
- Layout y navegacion separados.
- Componentes UI reutilizables iniciales.
- Modelos de dominio base.
- Sistema inicial de visibilidad y permisos.
- Diario privado por defecto.
- Base de household/pareja/grupo.
- Journal con estructura de feature, servicio, busqueda, edicion y borrado.
- Objetivos y habitos vinculados.
- Dashboard con primera lectura de alineacion sin IA real.
- Servicios separados para journal, goals, habits y finance.
- Finanzas con base para puesta al dia, movimientos estimados, `needs_review`, `confidence`, `source` y revision.
- Finanzas con primera base de inflacion para leer gastos, ingresos y proyecciones en valor nominal y real.

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Firebase Auth
- Firestore
- Express local para Vite y OAuth de Google Calendar
- Google Calendar API
- Gemini API
- Recharts
- lucide-react
- motion/react

## Correr Localmente

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

## Variables De Entorno

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
- Sin `GEMINI_API_KEY`, las features de IA no deben considerarse listas.
- No subir archivos `.env` reales al repo.

## Warnings Conocidos

Durante `npm run build` pueden aparecer warnings de chunks grandes y bundling de Firebase. Hoy no bloquean el build.

Tambien puede aparecer:

```text
WARNING: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set.
```

Eso es esperado si todavia no se configuro Google Calendar OAuth.

## Privacidad

Regla critica:

```text
El Diario Mental es privado por defecto y no se comparte automaticamente.
```

Visibilidades base:

- `private`
- `shared_with_partner`
- `household_shared`
- `app_public`

## Estructura Relevante

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
  lib/
  services/
```

## Documentacion

- `IMPLEMENTATION_PLAN.md`: auditoria tecnica y plan por fases.
- `PHASE_TODOS.md`: pendientes operativos por fase.
- `docs/VEO_PRODUCT_VISION.md`: definicion conceptual de VEO y Luz.
- `docs/FINANCE_INFLATION_STRATEGY.md`: estrategia para lectura nominal, real e inflacionaria de Finanzas.

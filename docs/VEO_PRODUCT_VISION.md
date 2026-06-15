# VEO Product Vision

## Nombre

**VEO** significa **Vida En Orden**.

La app puede seguir usando nombres historicos en codigo o repo durante la transicion, pero el producto hacia adelante debe pensarse como VEO.

## Frase Conceptual

```text
VEO es un sistema personal de claridad para entenderte mejor, decidir mejor y vivir mas alineado.
```

## Bajada

```text
Entendete mejor. Decidi mejor. Vivi mas alineado.
```

## Proposito

VEO no es solamente una app financiera, de habitos o de productividad. Es un sistema personal/familiar para ordenar informacion vital y convertirla en claridad.

La app debe ayudar a una persona a:

- Definir objetivos alineados con sus busquedas personales reales.
- Distinguir objetivos autenticos de objetivos prestados, impulsivos o impuestos por comparacion.
- Traducir objetivos en decisiones, habitos, calendario y finanzas.
- Avanzar sin desordenar salud, pareja, familia, descanso, estabilidad emocional, finanzas o disfrute.
- Revisar constantemente si lo que hace, lo que dice que quiere y la vida que construye estan alineados.

## Luz

La IA dentro de VEO se llama **Luz**.

Luz no es un chatbot generico. Es la inteligencia de alineacion del sistema.

Debe ayudar a ver:

- patrones;
- contradicciones;
- desalineaciones;
- costos ocultos;
- datos faltantes;
- proximos pasos concretos.

Luz debe poder responder preguntas como:

- Estoy siendo consistente con mis objetivos?
- Que habito me conviene sumar este trimestre?
- En que se me esta yendo mas tiempo?
- Mis gastos estan alineados con mis prioridades?
- Que patrones aparecen en mi diario?
- Que deberia ajustar esta semana?
- Estoy descuidando salud, pareja, finanzas o trabajo?

## Principios De Luz

Luz debe:

- Usar datos estructurados.
- Citar o referenciar la fuente interna cuando sea posible.
- Decir cuando no tiene informacion suficiente.
- Pedir mejor carga de datos si falta contexto.
- Respetar privacidad por modulo y por visibilidad.
- Dar recomendaciones concretas, no frases genericas.

Luz no debe:

- Inventar datos.
- Diagnosticar.
- Actuar como terapeuta.
- Empujar productividad por productividad.
- Asumir que mas eficiencia siempre es mejor.
- Convertir toda la vida en optimizacion.
- Proponer objetivos genericos.

## Criterio De Diseño

VEO debe usar una densidad media desktop: calmo, claro y premium, pero no gigante ni vacio.

La prioridad inmediata es aplicar este criterio dentro de Finanzas para llegar a un MVP usable al 100%. El ajuste global de Luz, Panel General, Diario, Wishlist, Objetivos, Habitos, Calendario y Ajustes queda para despues de cerrar Finanzas.

## Modulos Funcionales

### Diario

El diario es privado por defecto. Sirve para registrar pensamiento, emociones, energia, imagenes, audios y patrones.

### Objetivos

Los objetivos anuales deben expresar direccion, motivacion, progreso y categoria. Deben poder conectarse con habitos, diario, calendario y finanzas.

### Habitos

Los habitos son acciones repetibles que sostienen objetivos. La logica deseada es sumar un habito fuerte por trimestre y mantener lo anterior.

### Finanzas

Finanzas debe mostrar donde esta la plata, cuanto se gasta, cuanto se invierte y si el uso del dinero esta al servicio de la vida deseada.

Incluye una idea clave: **Puesta al Dia**.

Cuando el usuario no cargo movimientos durante varios dias, VEO debe ayudar a reconstruir la realidad con preguntas. Si no hay exactitud, puede guardar movimientos estimados como supuestos, con:

- `source: catchup_estimate`
- `confidence: estimated`
- `status: needs_review`
- `estimatedReason`
- `reconciliationBatchId`

La meta no es perfeccion contable inmediata. La meta es volver a tener una caja razonablemente realista y seguir.

### Calendario

El calendario debe ayudar a ver si el tiempo refleja las prioridades declaradas.

## Estado De Implementacion

Ya existe:

- Base tecnica React/Firebase.
- Login con Google mediante Firebase.
- Journal privado por defecto.
- Feature folders para journal, goals, habits y finance.
- Vinculo entre objetivos y habitos.
- Dashboard con senales basicas de alineacion.
- Finanzas con movimientos estimados y revision.

Pendiente:

- Renombrar UI completa a VEO cuando sea oportuno.
- Introducir Luz como identidad de IA en la interfaz.
- Crear builder de contexto para IA.
- Completar permisos por visibilidad en todos los modulos.
- Mejorar modelos financieros y conciliacion.
- Consolidar Google Calendar read-only.

## Foco Actual

La prioridad vigente es cerrar Finanzas como MVP usable al 100% para Agustin y Vicky antes de abrir modulos grandes nuevos.

Finanzas debe poder usarse con datos reales mediante:

- carga desde Luz;
- carga manual;
- importacion PDF/CSV;
- saldos confiables;
- conciliacion;
- categorias aprendibles;
- memoria financiera;
- backup y exportacion.

Las APIs automaticas de bancos, billeteras y agregadores son post-MVP. No bloquean el 100% de Finanzas.

# Estrategia De Inflacion En Finanzas

## Principio

VEO no debe leer las finanzas argentinas solo en valor nominal. Para Argentina, una lectura de ingresos, gastos, patrimonio, Wishlist, objetivos o proyecciones sin inflacion puede ser engañosa.

Toda lectura financiera importante debe poder expresarse en:

- valor nominal;
- valor real ajustado por inflacion;
- moneda dura cuando corresponda, especialmente USD/EUR;
- impacto sobre decisiones de vida, objetivos y Wishlist.

## Fuente De Datos

La inflacion no debe ser un campo manual para el usuario. VEO debe obtenerla automaticamente desde una fuente oficial o confiable y cachearla.

Fuente inicial:

- Datos Argentina / INDEC - IPC Nivel General Nacional.
- Modulo actual: `src/features/finance/argentinaInflation.ts`.
- Cache local para evitar depender de una llamada externa en cada render.

Si la fuente falla, VEO debe:

- seguir funcionando con valor nominal;
- marcar que falta inflacion actualizada;
- evitar conclusiones fuertes en terminos reales.

## Lecturas Obligatorias

El modulo Finanzas debe contemplar inflacion para:

- comparar gastos mes contra mes;
- detectar si un gasto fijo subio por encima o por debajo de inflacion;
- detectar si ingresos reales crecen o caen;
- proyectar gastos 6/12 meses;
- ajustar Wishlist en ARS;
- analizar objetivos grandes como casa, viaje, auto, inversiones o ahorro;
- entender patrimonio nominal vs patrimonio real;
- explicar la diferencia entre "gastaste mas" y "gastaste mas en terminos reales".

## Reglas De Producto

- No pedir al usuario que cargue inflacion mensual.
- No esconder la diferencia entre nominal y real en reportes importantes.
- No usar inflacion para asustar; usarla para decidir mejor.
- Luz debe explicar cuando no hay datos suficientes.
- Wishlist y objetivos grandes deben poder verse en ARS ajustado y en moneda dura.

## Implementacion Tecnica

Piezas actuales:

- `argentinaInflation.ts`: consulta y cache de IPC.
- `finance.realValue.ts`: utilidades para comparar nominal vs real.
- `finance.insights.ts`: primeras lecturas de gasto e ingreso mensual ajustadas por inflacion.

Siguientes pasos:

- Persistir snapshots de inflacion en Firestore para que no dependan solo de cache local.
- Crear reconciliacion mensual de IPC por periodo.
- Mostrar comparaciones nominal vs real en dashboard financiero.
- Ajustar Wishlist en ARS segun inflacion estimada.
- Agregar lectura de patrimonio real por moneda y tipo de cuenta.
- Permitir que Luz responda preguntas financieras usando contexto nominal y real.

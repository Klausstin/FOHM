# Finanzas 90% - Plan de cierre

Este documento define la regla de trabajo actual: VEO no deberia avanzar fuerte sobre otros modulos hasta que Finanzas sea confiable para uso real.

## Estado actual

Ya existe una base importante:

- Cuentas financieras separadas por tipo: banco, billetera, efectivo, inversion y tarjeta de credito.
- Tarjetas de credito modeladas como cuentas de deuda.
- Movimientos `expense`, `income` y `neutral`, incluyendo pagos de tarjeta y transferencias internas.
- Importacion de PDFs BBVA para caja de ahorro y Visa.
- Deteccion inicial de duplicados por resumen, huella de movimiento y similitud semantica.
- Categorizacion financiera con pocas categorias madre y subcategorias.
- Aprendizaje basico cuando el usuario corrige categorias.
- Deteccion de gastos recurrentes, fijos, inusuales y perfil mensual.
- Inflacion oficial Argentina como fuente automatica para lecturas nominales vs reales.
- Captura desde Luz para registrar gastos simples sin ir a la pantalla de Finanzas.

## Que significa Finanzas al 90%

Finanzas llega al 90% cuando se pueda confiar en estas capacidades:

1. **Registro diario confiable**
   - Luz registra gastos simples con monto, moneda, cuenta, categoria, subcategoria y fecha.
   - Si falta informacion, pregunta solo lo imprescindible.
   - Despues de confirmar, limpia el formulario y deja lista la siguiente entrada.

2. **Cuentas y saldos claros**
   - Caja de ahorro, efectivo, billeteras, inversiones y tarjetas se comportan distinto.
   - Las tarjetas acumulan deuda hasta que se pagan.
   - El pago de tarjeta es neutro si los consumos ya fueron cargados.
   - Los saldos no se duplican ni se recalculan dos veces por error.

3. **Importacion masiva util**
   - Se pueden subir varios resumenes.
   - VEO detecta si un PDF ya fue importado.
   - Los movimientos listos se guardan sin pedir aprobacion uno por uno.
   - Los dudosos se agrupan por tipo de problema: duplicado, sin cuenta, categoria dudosa, moneda dudosa.
   - Si hay muchos movimientos parecidos, se corrigen en grupo.

4. **Dedupe y conciliacion**
   - Un gasto cargado por Luz o por foto puede vincularse luego con el resumen de tarjeta.
   - VEO no duplica gastos iguales por exactitud ni por equivalencias razonables entre EUR, USD y ARS.
   - Cuando no esta seguro, propone unir, mantener separado o ignorar.

5. **Categorias simples y aprendibles**
   - Las categorias madre son pocas y utiles.
   - Comercios, marcas y personas no son categorias: son merchant/tags/notas.
   - Las correcciones del usuario se recuerdan para gastos similares.
   - "Otros" se usa como excepcion, y si se repite, Luz propone mejorar la taxonomia.

6. **Lectura financiera real**
   - Dashboard con caja, deuda de tarjetas, flujo del periodo y gastos por categoria.
   - Perfil mensual: fijo declarado, recurrente detectado, variable e inusual.
   - Comparacion nominal vs real ajustada por inflacion.
   - Proyeccion 6/12 meses con inflacion.
   - Lectura clara de Luz: que esta pasando, que revisar y que accion concreta conviene tomar.

7. **UX de PC y celular**
   - PC: importacion, revision, analisis, conciliacion y dashboard completo.
   - Celular: captura rapida, saldos, alertas, ultimos movimientos y decisiones simples.
   - No mostrar explicaciones repetidas todos los dias.

## Prioridad de implementacion

1. Estabilizar registro desde Luz y formulario manual.
2. Consolidar cuentas, saldos y pagos de tarjeta.
3. Mejorar importacion masiva y revision por grupos.
4. Mejorar deduplicacion y vinculacion entre carga manual, fotos y resumenes.
5. Pulir categorias, merchant intelligence y aprendizaje.
6. Rehacer dashboard financiero con lectura nominal, real y por moneda.
7. Separar `FinanceTracker.tsx` en componentes y servicios mas mantenibles.

## Riesgos

- Duplicar saldos al aplicar movimientos mas de una vez.
- Confundir caja de ahorro con tarjeta por nombres parecidos.
- Sobrecargar al usuario con confirmaciones individuales.
- Clasificar marcas o comercios como categorias.
- Leer mejor en pantalla que en datos reales: la prioridad es que los datos cierren.

## Regla de foco

Hasta que esta lista este resuelta en su mayoria, no abrimos nuevas funcionalidades grandes fuera de Finanzas salvo que sean bloqueantes para Finanzas.

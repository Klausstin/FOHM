# Protocolo de prueba real de Finanzas

Ultima actualizacion: 2026-06-11

Este protocolo existe para validar Finanzas antes de cargar datos reales masivos.

La idea no es probar todo durante horas. Es hacer una prueba chica, controlada y suficiente para saber si VEO ya puede empezar a usarse con confianza.

## Objetivo

Confirmar que VEO puede:

- guardar movimientos reales;
- editar movimientos sin duplicar impacto en saldo;
- borrar movimientos y revertir saldo;
- registrar gastos desde Luz;
- manejar cuentas y tarjetas sin confundirlas;
- exportar backup y CSV;
- validar el backup JSON;
- mostrar informacion suficiente para revisar errores.

## Antes de empezar

1. Actualizar `main`.
2. Correr la app.
3. Descargar backup JSON desde Finanzas.
4. Descargar CSV desde Finanzas.
5. Validar el backup JSON:

```powershell
npm run finance:backup:validate -- "C:\ruta\al\veo-finanzas-backup.json"
```

6. Correr prueba local de saldos:

```powershell
npm run finance:smoke
```

Si algo de esto falla, no cargar datos masivos todavia.

## Prueba minima en la app

### 1. Gasto en efectivo

Crear desde Luz:

```text
Gaste 18000 en Uber en efectivo
```

Esperado:

- monto: 18000;
- moneda: ARS;
- categoria: Transporte;
- subcategoria: Uber-Cabify;
- cuenta usada: efectivo/caja de Agustin en ARS, segun exista;
- beneficiario: Agustin, salvo que el texto indique otra cosa;
- impacta saldo una sola vez.

Revisar:

- el movimiento queda guardado;
- Luz se limpia despues de confirmar;
- el saldo baja una sola vez.

### 2. Editar gasto

Editar el gasto anterior de 18000 a 20000.

Esperado:

- el saldo refleja 20000 final;
- no queda impacto doble de 18000 + 20000;
- el movimiento mantiene categoria, cuenta y fecha editables.

### 3. Borrar gasto

Borrar el gasto anterior.

Esperado:

- el saldo vuelve al valor anterior;
- el movimiento desaparece;
- no queda alerta falsa de integridad de saldo.

### 4. Gasto con tarjeta

Crear desde Luz:

```text
Compre unas zapatillas por 950 EUR con Visa BBVA
```

Esperado:

- monto: 950;
- moneda: EUR;
- categoria: Compras;
- subcategoria: Ropa y calzado;
- cuenta usada: BBVA - Visa;
- la tarjeta aumenta deuda, no baja caja de ahorro;
- si hay texto emocional o contexto personal, Luz puede sugerir tambien Diario, pero el gasto debe quedar bien.

### 5. Pago de tarjeta

Crear o importar un pago de tarjeta.

Esperado:

- tipo: transferencia / neutral;
- sale de banco o billetera;
- entra a tarjeta;
- no cuenta como gasto si los consumos ya existen;
- baja deuda de tarjeta.

### 6. Transferencia

Crear una transferencia entre cuentas propias.

Esperado:

- no cuenta como gasto ni ingreso real;
- baja una cuenta y sube la otra;
- pide cuenta destino si falta;
- no queda en categoria de gasto.

### 7. Importacion chica

Importar pocos movimientos desde PDF o CSV.

Esperado:

- movimientos claros se guardan sin pedir confirmacion uno por uno;
- dudosos quedan agrupados;
- duplicados se ofrecen para vincular/ignorar;
- se ve informacion suficiente: fecha, monto, concepto, archivo, huella, cuenta, destino si existe.

## Criterio para aprobar la prueba

Finanzas queda habilitada para uso real inicial si:

- no se pierde ningun movimiento;
- los saldos no se duplican;
- las tarjetas se comportan como deuda;
- transferencias y pagos de tarjeta no inflan gastos;
- backup y CSV descargan bien;
- el backup valida sin errores bloqueantes;
- los errores que aparezcan son corregibles desde UI o quedan claramente identificados.

## Si algo falla

No cargar datos masivos.

Anotar:

- texto exacto usado en Luz;
- cuenta involucrada;
- captura o descripcion del error;
- si fallo al guardar, editar, borrar, importar o reconciliar;
- si el saldo quedo mal y por cuanto.

Luego crear un bloque de correccion antes de seguir.

## Despues de aprobar

Pasos siguientes:

1. Cargar gastos reales de una semana.
2. Descargar backup y CSV.
3. Revisar dashboard mensual.
4. Importar un resumen chico.
5. Comparar saldos reales contra VEO.
6. Repetir con Vicky antes de considerar Finanzas 100% para uso familiar.

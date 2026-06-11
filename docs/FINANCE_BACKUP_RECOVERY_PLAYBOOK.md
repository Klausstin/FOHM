# Playbook de recuperacion de backup financiero

Ultima actualizacion: 2026-06-11

Este documento define que hacer si algo sale mal con datos reales de Finanzas.

La regla principal es:

```text
No restaurar automaticamente sobre datos vivos sin diagnostico previo.
```

Primero se valida, despues se compara, despues se decide.

## Que cubre el backup

El backup JSON de Finanzas contiene:

- cuentas;
- movimientos;
- categorias;
- aprendizajes financieros;
- borradores pendientes de importacion;
- metadatos de exportacion;
- conteos de control.

El CSV de Finanzas no es un backup completo. Es una copia legible para revisar movimientos en Excel o Google Sheets.

## Cuando usar este playbook

Usarlo si:

- se cargaron movimientos duplicados;
- un saldo quedo mal;
- se borro o edito algo por error;
- una importacion masiva salio mal;
- una correccion en lote afecto demasiados movimientos;
- hay dudas antes de cargar muchos datos reales.

## Paso 1: No seguir cargando datos

Si se detecta un problema:

1. No importar mas PDFs/CSV.
2. No hacer correcciones masivas.
3. No borrar movimientos en bloque.
4. Descargar un backup nuevo del estado actual, aunque este mal.

Esto conserva evidencia de lo ocurrido.

## Paso 2: Juntar archivos

Guardar en una carpeta:

- backup previo sano;
- backup actual despues del problema;
- CSV previo si existe;
- CSV actual si existe;
- capturas o notas del problema.

Nombrar los archivos con fecha y hora.

Ejemplo:

```text
2026-06-11_antes-importacion-veo-finanzas-backup.json
2026-06-11_despues-importacion-veo-finanzas-backup.json
```

## Paso 3: Validar backups

Validar cada JSON:

```powershell
npm run finance:backup:validate -- "C:\ruta\al\backup.json"
```

Interpretacion:

- Sin errores ni advertencias: backup aparentemente sano.
- Advertencias: puede servir, pero revisar detalles.
- Errores: no usar como fuente de recuperacion sin analizar.

## Paso 4: Identificar tipo de problema

Clasificar el problema:

1. **Duplicados**
   Movimientos repetidos por importacion, Luz o carga manual.

2. **Saldo incorrecto**
   El movimiento existe, pero el saldo no refleja bien su impacto.

3. **Cuenta equivocada**
   El movimiento salio de BBVA cuando era Visa, MC, Mercado Pago, efectivo, etc.

4. **Categoria equivocada**
   El movimiento esta bien guardado pero mal clasificado.

5. **Movimiento perdido**
   Algo que deberia estar no aparece.

6. **Importacion mala**
   Muchos movimientos entraron con mala cuenta, mala categoria o mala fecha.

## Paso 5: Elegir recuperacion menos riesgosa

Orden recomendado:

1. Corregir desde la UI si son pocos movimientos.
2. Usar filtros de Finanzas para encontrar y editar grupos chicos.
3. Usar CSV para auditar y detectar patrones.
4. Si el problema es masivo, crear una rama/copia de trabajo y preparar script especifico.
5. Restauracion completa solo si el estado actual no sirve y el backup previo fue validado.

## Que NO hacer

- No sobrescribir toda la base sin comparar.
- No borrar todas las finanzas sin backup actual.
- No mezclar backups de hogares distintos.
- No asumir que el CSV alcanza para restaurar todo.
- No aplicar scripts sobre produccion sin dry-run.

## Criterio para restauracion completa

Solo considerar restauracion completa si:

- el backup previo valida sin errores bloqueantes;
- se sabe exactamente que datos se perderian al volver atras;
- hay backup del estado actual;
- el problema no se puede corregir desde UI o con una reparacion pequena;
- el usuario confirma explicitamente.

## Restauracion futura deseada

La restauracion ideal futura deberia tener:

- modo preview;
- comparacion backup vs estado actual;
- conteo de altas, bajas y cambios;
- deteccion de household;
- proteccion contra duplicados;
- boton de confirmar con advertencia clara;
- log de restauracion.

No implementar restauracion automatica hasta que este flujo exista o haya una necesidad real.

## Estado actual

Hoy VEO tiene:

- export JSON completo;
- export CSV legible;
- validador local de backup;
- prueba local de saldos;
- protocolo de prueba real.

Falta:

- comparador automatico entre backup y estado actual;
- restauracion asistida;
- UI de recuperacion.

## Decision actual

Para el MVP de Finanzas, alcanza con:

1. poder exportar;
2. poder validar;
3. tener un protocolo claro;
4. no hacer restauraciones automaticas peligrosas.

La restauracion asistida queda como mejora posterior, salvo que aparezca un problema real que la vuelva urgente.

# Estrategia de automatizacion financiera

Ultima actualizacion: 2026-06-11

## Objetivo

Reducir al minimo la carga manual de movimientos financieros sin comprometer seguridad, confiabilidad ni control del usuario.

VEO debe poder alimentarse de varias fuentes:

- carga desde Luz
- carga manual desde Finanzas
- PDF de resumen bancario
- CSV/Excel de bancos, billeteras o historial anterior
- APIs oficiales o agregadores financieros, cuando sean viables

El modelo interno debe tratar todas esas fuentes como entradas hacia el mismo flujo:

1. importar o recibir movimiento
2. normalizar datos
3. detectar cuenta usada
4. detectar duplicados o posibles coincidencias
5. clasificar categoria, subcategoria, beneficiario y scope
6. aplicar impacto en saldo solo cuando corresponde
7. aprender de correcciones reales

## Principio de producto

La mejor experiencia no es pedirle al usuario que cargue todo, sino pedirle intervencion solo cuando VEO no puede decidir con confianza.

La automatizacion debe ser gradual:

- primero confiabilidad
- despues comodidad
- despues conexion directa

## Capas de ingreso de datos

### 1. Luz y carga manual

Uso diario. Sirve para registrar gastos, ingresos, transferencias, decisiones, contexto y datos que el resumen bancario no sabe explicar.

Ejemplo:

> Compre zapatillas por 950 EUR con Visa BBVA y me senti conflictuado.

VEO puede guardar:

- movimiento financiero
- contexto emocional en diario
- merchant o marca
- posible compra futura similar para reconciliacion

### 2. PDF / CSV / Excel

Uso periodico. Sirve para ponerse al dia, cerrar saldos y traer evidencia bancaria real.

Esta capa sigue siendo prioritaria porque:

- funciona aunque el banco no tenga API disponible
- permite validar saldos reales
- es portable entre bancos y tarjetas
- es controlable por nosotros

### 3. APIs directas

Uso futuro. Sirve para automatizar movimientos sin subir archivos.

No debe reemplazar inmediatamente a PDFs/CSV porque:

- no todas las entidades tienen APIs personales abiertas
- pueden requerir aprobacion comercial
- pueden tener costo
- requieren OAuth, tokens, renovacion y permisos
- agregan superficie de seguridad

## Entidades prioritarias

### Mercado Pago

Prioridad alta para primera integracion API.

Motivo:

- tiene documentacion publica de APIs, OAuth y reportes
- los reportes incluyen movimientos que afectan saldo
- encaja con billeteras/cuentas de VEO

Estrategia:

1. documentar scopes y endpoints necesarios
2. crear proveedor interno `mercado_pago`
3. traer movimientos como borradores o importaciones reconciliables
4. no impactar saldos dos veces si ya existian movimientos manuales o PDF

### BBVA

Prioridad media.

Motivo:

- existe BBVA API Market
- puede requerir alta como partner/empresa
- no esta confirmado que exponga movimientos personales minoristas para una app propia

Estrategia:

1. seguir robusteciendo PDF/CSV BBVA
2. investigar acceso real a BBVA API Market Argentina
3. evaluar solo si permite movimientos/saldos con consentimiento del usuario

### Agregadores tipo Belvo / Prometeo

Prioridad exploratoria.

Motivo:

- podrian conectar multiples entidades mas rapido
- pueden resolver normalizacion bancaria
- probablemente tengan costo, contrato y compliance

Estrategia:

1. evaluar cobertura Argentina: BBVA, Galicia, Santander, Mercado Pago, brokers
2. validar costos y requisitos legales
3. no integrar hasta que Finanzas base este estable

## Modelo tecnico sugerido

Crear una capa conceptual de proveedores:

```ts
type FinanceDataProvider =
  | "manual"
  | "luz"
  | "pdf"
  | "csv"
  | "wallet_history"
  | "mercado_pago"
  | "bbva_api"
  | "aggregator";
```

Cada proveedor deberia devolver movimientos normalizados, no escribir directo en Finanzas.

```ts
type NormalizedFinanceImportItem = {
  provider: FinanceDataProvider;
  externalId?: string;
  accountHint?: string;
  date: string;
  amount: number;
  currency: string;
  description: string;
  rawDescription?: string;
  counterpartyName?: string;
  counterpartyAlias?: string;
  counterpartyAccount?: string;
  merchantName?: string;
  sourcePayload?: unknown;
  transactionFingerprint: string;
  statementFingerprint?: string;
};
```

Despues, VEO decide:

- si es gasto, ingreso o movimiento neutro
- si afecta saldo
- si coincide con un movimiento existente
- si necesita revision
- si puede guardarse automaticamente

## Seguridad y privacidad

No implementar conexiones bancarias hasta tener claro:

- donde se guardan tokens
- como se renuevan
- como se revocan
- que permisos se piden
- como evitar escribir credenciales en el frontend
- como auditar acciones automaticas

Regla:

VEO puede leer datos financieros con permiso explicito. Para mover plata o iniciar pagos, no avanzar hasta una fase posterior y con confirmacion fuerte.

## Roadmap recomendado

### Fase A: ahora

- cerrar importacion PDF/CSV confiable
- mejorar trazabilidad de cada movimiento
- usar historico Wallet como memoria
- detectar duplicados, cuotas, transferencias y pagos de tarjeta

### Fase B: siguiente

- agregar capa interna de proveedor normalizado
- dejar `source` preparado para `mercado_pago` y futuros proveedores
- documentar endpoints de Mercado Pago y datos que devolverian

### Fase C: primera API real

- prototipo Mercado Pago en modo lectura
- traer movimientos como borradores reconciliables
- no aplicar saldos automaticamente hasta validar contra cuenta

### Fase D: bancos/agregadores

- evaluar BBVA API Market
- evaluar Belvo/Prometeo
- decidir si conviene contrato/agregador o seguir con archivos por banco

## No hacer por ahora

- No guardar usuario y clave de home banking.
- No hacer scraping de bancos.
- No iniciar pagos desde VEO.
- No reemplazar PDFs/CSV hasta que una API sea claramente mejor.
- No agregar una integracion que obligue a rehacer Finanzas.

## Decision actual

Mantener PDFs/CSV como base robusta y preparar arquitectura para integraciones.

Primera integracion candidata: Mercado Pago API.

BBVA queda por ahora cubierto con PDF/CSV mientras se verifica acceso real a API.

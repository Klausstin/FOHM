# Estrategia de automatizacion financiera post-MVP

Ultima actualizacion: 2026-06-11

## Decision clave

Las integraciones automaticas con bancos, billeteras o agregadores no forman parte del porcentaje necesario para cerrar Finanzas MVP al 100%.

Finanzas MVP al 100% significa que VEO ya puede usarse bien con Agustin y Vicky usando:

- carga desde Luz
- carga manual desde Finanzas
- importacion PDF
- importacion CSV/Excel
- conciliacion
- saldos confiables
- categorias y memoria de aprendizaje
- reportes utiles
- economia familiar compartida

Las APIs vienen despues como mejora de automatizacion, no como bloqueo del MVP.

## Objetivo post-MVP

Reducir al minimo la carga manual de movimientos financieros sin comprometer seguridad, confiabilidad ni control del usuario.

VEO debe poder alimentarse eventualmente de varias fuentes:

- Mercado Pago API
- BBVA API, si el acceso real sirve para cuentas personales
- otros bancos mediante API o agregadores
- brokers o plataformas de inversion

Todas esas fuentes deben entrar al mismo flujo interno:

1. recibir movimiento
2. normalizar datos
3. detectar cuenta usada
4. detectar duplicados o posibles coincidencias
5. clasificar categoria, subcategoria, beneficiario y scope
6. aplicar impacto en saldo solo cuando corresponde
7. aprender de correcciones reales

## Principio de producto

La mejor experiencia no es pedirle al usuario que cargue todo, sino pedirle intervencion solo cuando VEO no puede decidir con confianza.

La automatizacion debe ser gradual:

- primero confiabilidad del MVP
- despues comodidad
- despues conexion directa

## Capas del MVP

### Luz y carga manual

Uso diario. Sirve para registrar gastos, ingresos, transferencias, decisiones, contexto y datos que el resumen bancario no sabe explicar.

### PDF / CSV / Excel

Uso periodico. Sirve para ponerse al dia, cerrar saldos y traer evidencia bancaria real.

Esta capa sigue siendo prioritaria para el MVP porque:

- funciona aunque el banco no tenga API disponible
- permite validar saldos reales
- es portable entre bancos y tarjetas
- es controlable por nosotros

## APIs despues del MVP

### Mercado Pago

Primera candidata post-MVP.

Motivo:

- tiene documentacion publica de APIs, OAuth y reportes
- los reportes incluyen movimientos que afectan saldo
- encaja con billeteras/cuentas de VEO

### BBVA

Candidata a investigar despues.

Motivo:

- existe BBVA API Market
- no esta confirmado que exponga movimientos personales minoristas para una app propia
- puede requerir alta como partner/empresa

Mientras tanto, BBVA queda cubierto por PDF/CSV.

### Agregadores tipo Belvo / Prometeo

Candidatos exploratorios post-MVP.

Motivo:

- podrian conectar multiples entidades mas rapido
- probablemente tengan costo, contrato y requisitos de compliance
- no conviene depender de ellos antes de que Finanzas base este estable

## Seguridad y privacidad

No implementar conexiones bancarias hasta tener claro:

- donde se guardan tokens
- como se renuevan
- como se revocan
- que permisos se piden
- como evitar credenciales sensibles en frontend
- como auditar acciones automaticas

Regla:

VEO puede leer datos financieros con permiso explicito. Para mover plata o iniciar pagos, no avanzar hasta una fase posterior y con confirmacion fuerte.

## No hacer por ahora

- No guardar usuario y clave de home banking.
- No hacer scraping de bancos.
- No iniciar pagos desde VEO.
- No contar APIs dentro del 100% del MVP Finanzas.
- No reemplazar PDFs/CSV hasta que una API sea claramente mejor.

## Decision actual

Cerrar primero Finanzas MVP con PDF/CSV, Luz, saldos, conciliacion, categorias, memoria y reportes.

Despues del MVP, evaluar Mercado Pago API como primera integracion automatica.

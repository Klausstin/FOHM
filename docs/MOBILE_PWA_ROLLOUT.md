# Acceso movil instalable de VEO

## Objetivo

Publicar VEO como app web instalable para tener un acceso de un toque en iPhone y Android,
sin depender de App Store, Play Store ni una aplicacion nativa en esta etapa.

## Alcance inicial

- URL publica segura con HTTPS.
- Icono VEO en la pantalla de inicio.
- Apertura en modo app, sin interfaz principal del navegador.
- Actualizaciones automaticas al publicar una nueva version.
- Acceso a Firebase Authentication y Firestore.

URL publica canonica:

`https://ai-studio-applet-webapp-8efca.firebaseapp.com`

El alias `web.app` redirige automaticamente a esta direccion para mantener compatible el
inicio de sesion de Google configurado originalmente para el proyecto.

No incluye todavia:

- redisenio movil completo;
- widget nativo con datos;
- modo offline financiero garantizado;
- Google Calendar en produccion, porque sus endpoints viven actualmente en `server.ts`;
- invitaciones automaticas al household.

## Instalacion

### iPhone

1. Abrir la URL publica en Safari.
2. Tocar Compartir.
3. Elegir Agregar a pantalla de inicio.
4. Activar Abrir como app web.
5. Tocar Agregar.

### Android / Samsung

1. Abrir la URL publica en Chrome.
2. Abrir el menu del navegador.
3. Elegir Agregar a pantalla principal o Instalar app.
4. Confirmar.

## Household de Agustin y Vicky

El inicio de sesion crea un espacio personal para cada usuario nuevo. Antes de considerar
completo el uso compartido, Vicky debe iniciar sesion una vez y luego ambos perfiles deben
quedar vinculados al mismo `householdId`. Las invitaciones automaticas siguen pendientes;
no se debe asumir que iniciar sesion ya comparte los datos.

## Validacion minima

1. Abrir VEO desde la URL publica en ambos telefonos.
2. Instalar el icono en ambas pantallas.
3. Iniciar sesion con la cuenta personal de cada usuario.
4. Confirmar que ambos perfiles pertenecen al mismo household.
5. Crear un gasto de prueba desde un dispositivo.
6. Confirmar que aparece en el otro sin recargar manualmente.
7. Editarlo y verificar que el saldo cambia una sola vez.
8. Borrar el movimiento de prueba.

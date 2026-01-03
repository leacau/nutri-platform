# Nutri Platform (modo demo)

Guía rápida para levantar los emuladores de Firebase, sembrar datos de prueba y ejecutar el backend + frontend en modo demo local.

## Requisitos

- Node.js 20+
- npm 10+
- Firebase CLI instalado (`npm i -g firebase-tools`) para los emuladores.

## Instalación

```bash
npm install
```

Creá un archivo `.env` en la raíz con las variables mínimas para el backend:

```
FIREBASE_PROJECT_ID=demo-nutri-platform
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIRESTORE_EMULATOR_HOST=127.0.0.1:8088
DEV_ADMIN_SECRET=local-dev-secret
PORT=8081
```

Para el frontend (`apps/qa-console`) definí la URL del backend (sirve desde Vite):

```
VITE_API_BASE_URL=http://localhost:8081
```

Guardalo como `apps/qa-console/.env.local` o exportalo en tu shell antes de correr Vite.

## Emuladores + seed

1. Levantá los emuladores de Auth y Firestore (mantener en una terminal):

    ```bash
    npm run emulators
    ```

2. En otra terminal, cargá el seed para dejar datos listos en el emulador:

    ```bash
    npm run seed:emu
    ```

    El seed crea usuarios con claims, un paciente vinculado y dos turnos de ejemplo en la clínica `clinic_demo_1`:

    - Paciente: `patient@test.com` / `Passw0rd!` (rol `patient`, clinicId `clinic_demo_1`)
    - Nutricionista: `nutri@test.com` / `Passw0rd!` (rol `nutri`, clinicId `clinic_demo_1`)
    - Admin de clínica: `clinic-admin@test.com` / `Passw0rd!` (rol `clinic_admin`, clinicId `clinic_demo_1`)
    - Platform admin: `platform-admin@test.com` / `Passw0rd!` (rol `platform_admin`, sin clinicId)

    Firestore queda con:

    - `patients/patient_demo_1`: vinculado al usuario de paciente y asignado al nutri demo.
    - `appointments/appt_demo_scheduled`: turno programado para mañana con el nutri demo.
    - `appointments/appt_demo_requested`: turno solicitado para la semana siguiente, listo para programar/reprogramar.

Reejecutá el seed cada vez que quieras resetear los datos del emulador.

## Ejecutar backend y frontend en modo demo

- Backend API (usa `.env`): `npm run dev:api`
- Frontend QA console (usa `apps/qa-console/.env.local`): `npm run dev:qa`

Si ya tenés las variables configuradas podés levantar todo junto con:

```bash
npm run dev
```

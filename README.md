# Nutri Platform (modo demo)

Frontend y backend para AMSA Core. Incluye el nuevo front en Next.js (App
Router) con Firebase Auth, multi-clínica y shadcn/ui.

## Requisitos

- Node.js 20+
- npm 10+
- Firebase CLI (`npm i -g firebase-tools`) para los emuladores.

## Instalación

```bash
npm install
```

### Variables de entorno

Backend (`.env` en la raíz):

```
FIREBASE_PROJECT_ID=amsa-core-stg
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIRESTORE_EMULATOR_HOST=127.0.0.1:8088
DEV_ADMIN_SECRET=local-dev-secret
PORT=8081
ENABLE_QA_LOGIN=true              # solo dev/staging: permite Authorization: Bearer qa:<uid>
```

Frontend AMSA Core (`apps/web/.env.local`, hay plantilla en `.env.example`):

```
NEXT_PUBLIC_API_BASE_URL=/api       # proxy local hacia backend
NEXT_PUBLIC_ENABLE_QA_LOGIN=true    # solo dev/staging: muestra acceso QA por rol
BACKEND_PROXY_TARGET=http://localhost:8081
NEXT_PUBLIC_FIREBASE_PROJECT_ID=amsa-core-stg
NEXT_PUBLIC_FIREBASE_API_KEY=demo-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-nutri-platform.firebaseapp.com
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-nutri-platform.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:demo
NEXT_PUBLIC_USE_EMULATORS=true
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
NEXT_PUBLIC_ENV=dev
```

QA Console (`apps/qa-console/.env.local`):

```
VITE_API_BASE_URL=http://localhost:8081
```

## Emuladores + seed

1. Levantá los emuladores de Auth y Firestore (mantener en una terminal):

   ```bash
   npm run emulators
   ```

2. Cargá el seed para dejar datos listos en el emulador:

   ```bash
   npm run seed:emu
   ```

   El seed crea usuarios con claims, un paciente vinculado y dos turnos de
   ejemplo en la clínica `clinic_demo_1`:

   - Paciente: `patient@test.com` / `Passw0rd!` (rol `patient`, clinicId
     `clinic_demo_1`)
   - Nutricionista: `nutri@test.com` / `Passw0rd!` (rol `nutri`, clinicId
     `clinic_demo_1`)
   - Admin de clínica: `clinic-admin@test.com` / `Passw0rd!` (rol
     `clinic_admin`, clinicId `clinic_demo_1`)
   - Platform admin: `platform-admin@test.com` / `Passw0rd!` (rol
     `platform_admin`, sin clinicId)

   Firestore queda con:

   - `patients/patient_demo_1`: vinculado al usuario de paciente y asignado al
     nutri demo.
   - `appointments/appt_demo_scheduled`: turno programado para mañana con el
     nutri demo.
   - `appointments/appt_demo_requested`: turno solicitado para la semana
     siguiente, listo para programar/reprogramar.

Reejecutá el seed cada vez que quieras resetear los datos del emulador.

## Ejecutar backend y frontends

- Backend API (usa `.env`): `npm run dev:api`
- Frontend AMSA Core (Next.js App Router): `npm run dev:web`
- QA console (modo debug): `npm run dev:qa`

Para todo junto (emuladores + API + AMSA Core):

```bash
npm run dev
```

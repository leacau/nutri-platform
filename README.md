# Nutri Platform

Frontend y backend para Noria by AmsaCore. Incluye Next.js App Router, Firebase Auth,
multi-clinica, consultorios individuales, RBAC por membership y auditoria.

## Requisitos

- Node.js 20+
- npm 10+
- Firebase CLI (`npm i -g firebase-tools`) si vas a usar emuladores locales.
- Java 11+ para Firebase Emulators.

## Instalacion

```bash
npm install
```

## Variables de entorno

Backend (`.env` en la raiz):

```env
FIREBASE_PROJECT_ID=amsa-core-stg
FIRESTORE_DATABASE_ID=amsa-core-stg
PORT=8081
NODE_ENV=development
CLINICAL_ENCRYPTION_KEY=change-me
ALLOWED_ORIGINS=http://localhost:3000
```

Frontend Noria (`apps/web/.env.local`, hay plantilla en `.env.example`):

```env
NEXT_PUBLIC_API_BASE_URL=/api
BACKEND_PROXY_TARGET=http://localhost:8081
NEXT_PUBLIC_FIREBASE_PROJECT_ID=amsa-core-stg
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=amsa-core-stg.firebaseapp.com
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=amsa-core-stg.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_ENV=dev
```

Para usar el front local contra la API de Cloud Run:

```env
NEXT_PUBLIC_API_BASE_URL=https://amsa-core-api-418425481470.southamerica-east1.run.app/api
```

## Desarrollo local

Backend API:

```bash
npm run dev:api
```

Frontend Noria:

```bash
npm run dev:web
```

Emuladores locales sin datos precargados:

```bash
npm run emulators
```

Todo junto:

```bash
npm run dev
```

## Puesta en modo real

La plataforma no debe usar tokens `qa:<uid>` ni endpoints `/api/dev`.
Los usuarios reales se crean o invitan mediante Firebase Auth y las pantallas
administrativas correspondientes. El superadmin se identifica desde Firestore en
`platformAdmins/{uid}` con `enabled: true`.

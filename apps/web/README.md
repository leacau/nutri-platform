# Noria Web

Frontend principal del producto Noria by AmsaCore con Next.js App Router.

Incluye:
- Autenticacion con Firebase Auth por email/password y Google.
- Contexto multi-clinica y consultorios individuales.
- Selector persistente de espacio activo.
- RBAC derivado del membership y capacidades.
- Portal paciente separado del panel profesional/clinica.
- TanStack Query para data fetching mediante `apiClient`.

## Configuracion de entorno

Crear `apps/web/.env.local`:

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

`NEXT_PUBLIC_API_BASE_URL=/api` usa el rewrite definido en `next.config.ts`
hacia `BACKEND_PROXY_TARGET`.

Para probar el front local contra Cloud Run:

```env
NEXT_PUBLIC_API_BASE_URL=https://amsa-core-api-418425481470.southamerica-east1.run.app/api
```

## Scripts

```bash
npm run dev:web
npm run lint --workspace apps/web
npm run build --workspace apps/web
```

## Estructura

- `src/app/(public)`: login, registro, recuperacion y legales.
- `src/app/select-clinic`: seleccion de espacio activo.
- `src/app/(protected)/app/*`: modulos internos.
- `src/app/(portal)/portal/*`: portal paciente.
- `src/providers/*`: Auth, Clinic, I18n, Theme y Query providers.
- `src/lib/api-client.ts`: capa HTTP centralizada.

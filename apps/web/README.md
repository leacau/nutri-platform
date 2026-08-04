# AMSA Core Web (Next.js + App Router)

Frontend principal del producto AMSA Core. Incluye:
- Autenticación con Firebase (email/password + Google) y soporte para emulador.
- Contexto multi-clínica con switcher persistente y RBAC derivado del membership.
- UI premium con Tailwind + shadcn/ui, Inter y layout Sidebar + Topbar.
- TanStack Query para data fetching con `apiClient` centralizado (envía `Authorization` + `X-Clinic-Id`). Incluye mocks de fallback (`NEXT_PUBLIC_USE_MOCKS=true`).
- Portal paciente con turnos, perfil y cancelaciones respetando regla de 24h (validación de backend pendiente).
- Dev Tools visibles solo en `NEXT_PUBLIC_ENV=dev` (token, rol efectivo, /users/me, /health).

## Configuración de entorno

Crear `apps/web/.env.local` (ver `.env.example`):

```
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_ENABLE_QA_LOGIN=true
BACKEND_PROXY_TARGET=http://localhost:8081
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-nutri-platform
NEXT_PUBLIC_FIREBASE_API_KEY=demo-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-nutri-platform.firebaseapp.com
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-nutri-platform.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:demo
NEXT_PUBLIC_USE_EMULATORS=true
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
NEXT_PUBLIC_ENV=dev
```

`NEXT_PUBLIC_API_BASE_URL=/api` usa el rewrite definido en `next.config.ts` hacia `BACKEND_PROXY_TARGET` (por defecto `http://localhost:8081`).

`NEXT_PUBLIC_ENABLE_QA_LOGIN=true` muestra el selector QA por rol en `/login`. La API tambien debe tener `ENABLE_QA_LOGIN=true` para aceptar tokens `qa:<uid>`. Usarlo solo en dev/staging.

## Scripts

```bash
npm run dev:web   # arranca Next.js en modo dev (http://localhost:3000)
npm run lint --workspace apps/web
```

Para levantar todo el stack local (emuladores + API + front) desde la raíz:

```bash
npm run dev
```

## Estructura

- `src/app/(public)`: login, register, forgot password.
- `src/app/select-clinic`: selección explícita de clínica (siempre obligatoria post-login).
- `src/app/(protected)/app/*`: módulos internos (dashboard, pacientes, turnos, nutris, staff, settings, plantillas, auditoría).
- `src/app/(portal)/portal/*`: portal paciente (dashboard, perfil, turnos).
- `src/providers/*`: AuthProvider (Firebase), ClinicProvider (memberships + clinicId), I18nProvider, ThemeProvider, QueryProvider.
- `src/lib/api-client.ts`: capa centralizada para llamadas HTTP con mocks de respaldo y headers `Authorization` + `X-Clinic-Id`.

## Notas de permisos

- Guardas obligatorias: `AuthGuard` (login), `ClinicGuard` (clinicId activo), `RoleGuard` (403 con UX).
- `usePermissions` deriva capacidades según rol en la clínica activa o `platform_admin`.
- El portal paciente se protege con `RoleGuard` y muestra solo datos propios.

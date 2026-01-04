# QA Console (React + Vite)

Aplicación React para la consola de QA de Nutri Platform, empaquetada con Vite.

## Flujo de build y deploy

1. Definí las variables de entorno según el ambiente (ver sección siguiente).
2. Ejecutá el build con el workspace:
   - Dev/local: `npm --workspace apps/qa-console run build`
   - Stage: `VITE_APP_ENV=stage npm --workspace apps/qa-console run build`
   - Prod: `VITE_APP_ENV=prod npm --workspace apps/qa-console run build`
3. El artefacto queda en `apps/qa-console/dist/` listo para subirlo a tu hosting/CDN (Firebase Hosting, CloudFront, etc.).
4. Para previsualizar el build: `npm --workspace apps/qa-console run preview`.

El bundle se divide por rutas (code splitting con `React.lazy`) y cuenta con un analizador opcional. Para generar el reporte de tamaño ejecutá el build con `VITE_ANALYZE=true`; el archivo `dist/bundle-analysis.html` quedará disponible.

## Variables requeridas

Todas las variables expuestas al cliente usan el prefijo `VITE_`. Cada ambiente puede definir sus valores específicos:

- `VITE_APP_ENV` (`dev` | `stage` | `prod`). Por defecto `dev` en modo `vite dev` y `prod` en build de producción.
- Base URLs de API por ambiente:
  - `VITE_DEV_API_BASE_URL`
  - `VITE_STAGE_API_BASE_URL`
  - `VITE_PROD_API_BASE_URL`
- Credenciales de Firebase (todas obligatorias en stage/prod):
  - `VITE_DEV_FIREBASE_API_KEY`, `VITE_STAGE_FIREBASE_API_KEY`, `VITE_PROD_FIREBASE_API_KEY`
  - `VITE_DEV_FIREBASE_AUTH_DOMAIN`, `VITE_STAGE_FIREBASE_AUTH_DOMAIN`, `VITE_PROD_FIREBASE_AUTH_DOMAIN`
  - `VITE_DEV_FIREBASE_PROJECT_ID`, `VITE_STAGE_FIREBASE_PROJECT_ID`, `VITE_PROD_FIREBASE_PROJECT_ID`
- Opcionales:
  - `VITE_ANALYZE=true` para habilitar el reporte de bundle.
  - `VITE_E2E_API_STUB`, `VITE_E2E_MOCK_AUTH`, `VITE_E2E_ROLE`, `VITE_E2E_CLINIC_ID` para pruebas E2E.

Si no se especifican variables de entorno, el build usará el host local (`http://localhost:8081`) y dejará las credenciales de Firebase en blanco (obligatorias para stage/prod).

## Scripts útiles

Ejecutá los scripts desde la raíz del monorepo usando workspaces:

- `npm --workspace apps/qa-console run dev` para levantar el entorno local.
- `npm --workspace apps/qa-console run build` para compilar TypeScript y generar el bundle de Vite.
- `npm --workspace apps/qa-console run lint` para correr ESLint.

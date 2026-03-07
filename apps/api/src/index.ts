import 'dotenv/config'; // En local carga .env, en Cloud Run es ignorado silenciosamente

import { buildApp } from './app.js';
import { getFirebaseAdmin } from './firebase/admin.js';

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		console.error(`[FATAL] Missing required environment variable: ${name}`);
		process.exit(1);
	}
	return value;
}

// 1. Validación de variables críticas antes de arrancar nada
requireEnv('FIREBASE_PROJECT_ID');
if (process.env.NODE_ENV !== 'production') {
	requireEnv('DEV_ADMIN_SECRET');
}

// 2. Inicialización de Firebase (Fail-fast si hay problema de credenciales)
try {
	getFirebaseAdmin();
} catch (error) {
	console.error('[FATAL] Failed to initialize Firebase Admin:', error);
	process.exit(1);
}

// 3. Levantar el servidor
const PORT = Number(process.env.PORT || '8080'); // Cloud run inyecta PORT automáticamente
if (!Number.isFinite(PORT)) {
	console.error('[FATAL] PORT must be a valid number');
	process.exit(1);
}

const app = buildApp();
const server = app.listen(PORT, () => {
	const env = process.env.NODE_ENV || 'development';
	console.log(`[api] Server listening on port ${PORT} in ${env} mode`);
});

// 4. Graceful Shutdown (Requisito indispensable para Cloud Run)
const shutdown = (signal: string) => {
	console.log(`\n[api] Received ${signal}. Shutting down gracefully...`);
	server.close(() => {
		console.log('[api] HTTP server closed.');
		process.exit(0);
	});
};

process.on('SIGINT', () => shutdown('SIGINT')); // Para cuando cortas con Ctrl+C en local
process.on('SIGTERM', () => shutdown('SIGTERM')); // La señal que envía Google Cloud Run para apagar

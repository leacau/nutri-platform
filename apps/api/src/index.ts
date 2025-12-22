import 'dotenv/config';

import { buildApp } from './app.js';

function mustGetEnv(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`Missing env var: ${name}`);
	return v;
}

const PORT = Number(process.env.PORT ?? '8081');
if (!Number.isFinite(PORT)) {
	throw new Error('PORT must be a valid number');
}

mustGetEnv('FIREBASE_PROJECT_ID');

if (process.env.NODE_ENV !== 'production') {
	mustGetEnv('DEV_ADMIN_SECRET');
}

const app = buildApp();

app.listen(PORT, () => {
	console.log(`[api] listening on http://localhost:${PORT}`);
});

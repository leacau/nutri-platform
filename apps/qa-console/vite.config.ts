import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

type AppEnvironment = 'dev' | 'stage' | 'prod';

type FirebaseClientConfig = {
	apiKey: string;
	authDomain: string;
	projectId: string;
};

type ClientConfig = {
	env: AppEnvironment;
	apiBaseUrl: string;
	firebase: FirebaseClientConfig;
};

const PAGE_ROUTE_CHUNK_RE = /[/\\]src[/\\]pages[/\\]([^/\\]+)\.(t|j)sx?$/;

function resolveAppEnv(mode: string): ClientConfig {
	const root = process.cwd();
	const env = loadEnv(mode, root, '');
	const appEnv = (env.VITE_APP_ENV as AppEnvironment | undefined) ?? (mode === 'production' ? 'prod' : 'dev');
	const envKey = (key: string) => env[`VITE_${appEnv.toUpperCase()}_${key}`] ?? env[`VITE_${key}`];

	return {
		env: appEnv,
		apiBaseUrl: envKey('API_BASE_URL') ?? 'http://localhost:8081',
		firebase: {
			apiKey: envKey('FIREBASE_API_KEY') ?? (appEnv === 'dev' ? 'fake-api-key' : ''),
			authDomain:
				envKey('FIREBASE_AUTH_DOMAIN') ??
				(appEnv === 'dev' ? 'demo-nutri-platform.firebaseapp.com' : ''),
			projectId: envKey('FIREBASE_PROJECT_ID') ?? (appEnv === 'dev' ? 'demo-nutri-platform' : ''),
		},
	};
}

export default defineConfig(({ mode }) => {
	const appConfig = resolveAppEnv(mode);
	const rawEnv = loadEnv(mode, process.cwd(), '');
	const shouldAnalyze = rawEnv.VITE_ANALYZE === 'true' || rawEnv.ANALYZE === 'true';

	return {
		plugins: [
			react(),
			...(shouldAnalyze
				? [
						visualizer({
							filename: 'dist/bundle-analysis.html',
							gzipSize: true,
							brotliSize: true,
							template: 'sunburst',
						}),
				  ]
				: []),
		],
		define: {
			__APP_CONFIG__: JSON.stringify(appConfig),
		},
		envPrefix: 'VITE_',
		build: {
			rollupOptions: {
				output: {
					manualChunks: (id) => {
						if (id.includes('node_modules')) return 'vendor';
						const match = id.match(PAGE_ROUTE_CHUNK_RE);
						if (match?.[1]) return `route-${match[1].toLowerCase()}`;
						return undefined;
					},
				},
			},
		},
		server: {
			proxy: {
				'/api': {
					target: 'http://localhost:8081',
					changeOrigin: true,
					secure: false,
				},
			},
		},
	};
});

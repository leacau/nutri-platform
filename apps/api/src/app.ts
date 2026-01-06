import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { errorHandler } from './middlewares/errorHandler.js';
import { apiRouter } from './routes/api.js';
import { metricsMiddleware, metricsRegistry } from './middlewares/metrics.js';
import { requireAuth } from './middlewares/requireAuth.js';

const parseAllowedOrigins = (value: string | undefined): string[] =>
	(value ?? '')
		.split(',')
		.map((origin) => origin.trim())
		.filter((origin) => origin.length > 0);

export function buildApp(): Express {
	const app = express();
	const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

	// Seguridad: headers básicos
	app.use(helmet());

	// Logging
	app.use(morgan('dev'));

	// Métricas / observabilidad
	app.use(metricsMiddleware);

	// JSON (limit bajo para reducir riesgo DoS)
	app.use(express.json({ limit: '256kb' }));

	// CORS con allowlist basado en ALLOWED_ORIGINS
	// Se permite request sin origin (server-to-server / curl) y origins listados.
	app.use(
		cors({
			origin: (origin, callback) => {
				if (!origin) return callback(null, true);
				if (allowedOrigins.includes(origin)) {
					return callback(null, true);
				}
				return callback(null, false);
			},
			credentials: false, // Token Bearer no usa cookies
			methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
			allowedHeaders: ['Content-Type', 'Authorization', 'x-clinic-id'],
		})
	);

	// Prometheus metrics
	app.get('/metrics', async (_req: Request, res: Response) => {
		res.setHeader('Content-Type', metricsRegistry.contentType);
		res.send(await metricsRegistry.metrics());
	});

	// Health "root" (requisito)
	app.get('/health', (_req: Request, res: Response) => {
		res.status(200).json({
			success: true,
			data: { ok: true },
			message: 'healthy',
		});
	});

	// API routes bajo /api
	// requireAuth protege todo /api, evitando redundancia en sub-rutas
	app.use('/api', requireAuth, apiRouter);

	// 404 consistente (evita HTML default)
	app.use((_req: Request, res: Response) => {
		res.status(404).json({ success: false, message: 'Not found' });
	});

	// Handler centralizado
	app.use(errorHandler);

	return app;
}

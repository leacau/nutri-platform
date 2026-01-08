import express, {
	type Express,
	type Request,
	type Response,
	type NextFunction,
} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { errorHandler } from './middlewares/errorHandler.js';
import { apiRouter } from './routes/api.js';
import { devRouter } from './routes/dev.js'; // Importamos el router de dev
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

	// 1. Middlewares Globales
	app.use(helmet());
	app.use(morgan('dev'));
	app.use(metricsMiddleware);
	app.use(express.json({ limit: '256kb' }));

	app.use(
		cors({
			origin: (origin, callback) => {
				if (!origin) return callback(null, true);
				if (allowedOrigins.includes(origin)) {
					return callback(null, true);
				}
				return callback(null, false);
			},
			credentials: false,
			methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
			allowedHeaders: [
				'Content-Type',
				'Authorization',
				'x-clinic-id',
				'x-dev-secret',
			], // Agregamos x-dev-secret
		})
	);

	// 2. Rutas Públicas (Sin Auth)
	// Prometheus metrics
	app.get('/metrics', async (_req: Request, res: Response) => {
		res.setHeader('Content-Type', metricsRegistry.contentType);
		res.send(await metricsRegistry.metrics());
	});

	// Health Root
	app.get('/health', (_req: Request, res: Response) => {
		res.status(200).json({
			success: true,
			data: { ok: true },
			message: 'healthy',
		});
	});

	// Health API (Requisito explícito: público)
	app.get('/api/health', (_req: Request, res: Response) => {
		res.status(200).json({
			success: true,
			data: { ok: true },
			message: 'api healthy',
		});
	});

	// 3. Rutas de Desarrollo (NODE_ENV != production)
	// Se montan ANTES de /api protegido. No usan requireAuth, usan validación de header.
	if (process.env.NODE_ENV !== 'production') {
		app.use(
			'/api/dev',
			(req: Request, res: Response, next: NextFunction) => {
				const secret = req.header('x-dev-secret');
				if (!secret || secret !== process.env.DEV_ADMIN_SECRET) {
					return res
						.status(403)
						.json({ success: false, message: 'Invalid Dev Secret' });
				}
				return next();
			},
			devRouter
		);
	}

	// 4. API Protegida (Firebase Auth)
	// Todo lo que caiga bajo /api (y no haya sido capturado arriba) requiere token.
	app.use('/api', requireAuth, apiRouter);

	// 5. Manejo de errores
	app.use((_req: Request, res: Response) => {
		res.status(404).json({ success: false, message: 'Not found' });
	});

	app.use(errorHandler);

	return app;
}

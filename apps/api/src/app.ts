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
import { devRouter } from './routes/dev.js';
// NUEVO: Importamos el router de registros clínicos
import { clinicalRecordsRouter } from './routes/clinical-records.js';
import { metricsMiddleware, metricsRegistry } from './middlewares/metrics.js';
import { requireAuth } from './middlewares/requireAuth.js';
import { templatesRouter } from './routes/templates.js';

export function buildApp(): Express {
	const app = express();
	const isProd = process.env.NODE_ENV === 'production';

	// 1. CORS DEBE IR PRIMERO (Antes que Helmet y cualquier otro middleware)
	app.use(
		cors({
			origin: function (origin, callback) {
				// Permitir peticiones sin origen (como Postman o preflight requests internas)
				if (!origin) return callback(null, true);

				const allowedOrigins = process.env.ALLOWED_ORIGINS
					? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
					: ['*'];

				// Si está configurado el asterisco o el origen coincide, pasa
				if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
					return callback(null, true);
				} else {
					console.warn(`[CORS] Origen bloqueado: ${origin}`);
					return callback(null, false);
				}
			},
			credentials: true,
			methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
			allowedHeaders: [
				'Origin',
				'X-Requested-With',
				'Content-Type',
				'Accept',
				'Authorization',
				'x-clinic-id',
				'x-dev-secret',
			],
		}),
	);

	// 2. Seguridad y Parseo
	app.use(helmet());
	app.use(morgan(isProd ? 'combined' : 'dev'));
	app.use(express.json({ limit: '256kb' }));

	// Observabilidad (Métricas)
	app.use(metricsMiddleware);
	app.get('/metrics', async (_req: Request, res: Response) => {
		res.setHeader('Content-Type', metricsRegistry.contentType);
		res.send(await metricsRegistry.metrics());
	});

	// Healthchecks (Útiles para el balanceador de carga de Cloud Run)
	const healthCheck = (_req: Request, res: Response) => {
		res.status(200).json({
			success: true,
			message: 'healthy',
			env: isProd ? 'production' : 'development',
		});
	};
	app.get('/health', healthCheck);
	app.get('/api/health', healthCheck);

	// Rutas de Desarrollo (Excluidas de Auth Firebase, protegidas por Secret)
	if (!isProd) {
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
			devRouter,
		);
	}

	// NUEVO: Conectamos la ruta de registros clínicos protegiéndola con Auth
	app.use('/api/clinical-records', requireAuth, clinicalRecordsRouter);

	// NUEVO: Agregamos el router de plantillas
	app.use('/api/measurement-templates', templatesRouter);

	// API Principal Protegida
	app.use('/api', requireAuth, apiRouter);

	// 404 & Manejo centralizado de errores
	app.use((_req: Request, res: Response) => {
		res.status(404).json({ success: false, message: 'Not found' });
	});
	app.use(errorHandler);

	return app;
}

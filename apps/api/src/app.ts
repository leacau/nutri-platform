import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { errorHandler } from './middlewares/errorHandler.js';
import { apiRouter } from './routes/api.js';

export function buildApp(): Express {
	const app = express();

	// Seguridad: headers básicos
	app.use(helmet());

	// Logging
	app.use(morgan('dev'));

	// JSON (limit bajo para reducir riesgo DoS)
	app.use(express.json({ limit: '256kb' }));

	/**
	 * CORS:
	 * - En dev NO lo necesitamos si usamos proxy de Vite (/api -> backend).
	 * - Por defecto BLOQUEAMOS cross-origin (origin:false).
	 * - Si algún día querés correr sin proxy, vas a habilitar un origin explícito.
	 */
	app.use(
		cors({
			origin: false,
			credentials: false,
		})
	);

	// Health "root" (requisito)
	app.get('/health', (_req: Request, res: Response) => {
		res.status(200).json({
			success: true,
			data: { ok: true },
			message: 'healthy',
		});
	});

	// API routes bajo /api
	app.use('/api', apiRouter);

	// 404 consistente (evita HTML default)
	app.use((_req: Request, res: Response) => {
		res.status(404).json({ success: false, message: 'Not found' });
	});

	// Handler centralizado
	app.use(errorHandler);

	return app;
}

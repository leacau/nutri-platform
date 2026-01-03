import type { NextFunction, Request, Response } from 'express';
import {
	Counter,
	Histogram,
	Registry,
	collectDefaultMetrics,
} from 'prom-client';

const registry = new Registry();

collectDefaultMetrics({ register: registry });

const requestDurationMs = new Histogram({
	name: 'api_request_duration_ms',
	help: 'Duración de requests HTTP (ms)',
	labelNames: ['method', 'route', 'status', 'success'] as const,
	buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
	registers: [registry],
});

const requestCounter = new Counter({
	name: 'api_request_total',
	help: 'Contador de requests HTTP agrupado por éxito/error',
	labelNames: ['method', 'route', 'status', 'success'] as const,
	registers: [registry],
});

function resolveRoute(req: Request): string {
	if (req.route?.path) {
		return `${req.baseUrl ?? ''}${req.route.path}`;
	}
	return req.originalUrl?.split('?')[0] ?? req.url ?? 'unknown';
}

export function metricsMiddleware(
	req: Request,
	res: Response,
	next: NextFunction
) {
	const started = process.hrtime.bigint();

	res.on('finish', () => {
		const ended = process.hrtime.bigint();
		const durationMs = Number(ended - started) / 1_000_000;
		const route = resolveRoute(req);
		const status = res.statusCode;
		const success = status < 400 ? 'true' : 'false';

		requestDurationMs.labels(req.method, route, String(status), success).observe(durationMs);
		requestCounter.labels(req.method, route, String(status), success).inc();
	});

	next();
}

export { registry as metricsRegistry };

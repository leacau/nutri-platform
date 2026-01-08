import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	async rewrites() {
		const target = process.env.BACKEND_PROXY_TARGET || 'http://localhost:3001';
		return [{ source: '/api/:path*', destination: `${target}/api/:path*` }];
	},
};

export default nextConfig;

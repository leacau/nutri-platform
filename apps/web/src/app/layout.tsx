import './globals.css';

import { AppProviders } from './providers';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';

const inter = Inter({
	subsets: ['latin'],
	variable: '--font-inter',
	display: 'swap',
});

export const metadata: Metadata = {
	title: 'AMSA Core',
	description: 'Frontend premium para clínicas multi-tenant',
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		// FIX: suppressHydrationWarning en HTML y BODY evita que extensiones de traducción rompan React
		<html lang='es' suppressHydrationWarning>
			<body
				className={`${inter.variable} min-h-screen bg-background text-foreground`}
				suppressHydrationWarning
			>
				<AppProviders>{children}</AppProviders>
			</body>
		</html>
	);
}

import './globals.css';

import { AppProviders } from './providers';
import { Inter, Sora } from 'next/font/google';
import type { Metadata } from 'next';
import { cn } from "@/lib/utils";

const sora = Sora({
	subsets: ['latin'],
	variable: '--font-sora',
	weight: ['400', '500', '600'],
	display: 'swap',
});

const inter = Inter({
	subsets: ['latin'],
	variable: '--font-inter',
	display: 'swap',
});

export const metadata: Metadata = {
	title: 'Noria by AmsaCore',
	description: 'Gestión integral para profesionales y clínicas.',
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang='es' suppressHydrationWarning className={cn("font-sans", sora.variable)}>
			<body
				className={`${inter.variable} min-h-screen bg-background text-foreground`}
				suppressHydrationWarning
			>
				<AppProviders>{children}</AppProviders>
			</body>
		</html>
	);
}

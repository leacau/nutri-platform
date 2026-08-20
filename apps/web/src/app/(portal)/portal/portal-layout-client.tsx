"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Protected, RoleGuard } from '../../../components/guards';
import { cn } from '../../../lib/utils';
import { useClinic } from '../../../providers/clinic-provider';
import { useI18n } from '../../../providers/i18n-provider';

export default function PortalLayoutClient({ children }: { children: React.ReactNode }) {
	const { activeClinic, activeMembership } = useClinic();
	const { t } = useI18n();
	const pathname = usePathname();
	const canReturnToPanel = activeMembership?.role !== 'patient';
	const patientPortalEnabled =
		activeClinic?.billing?.enabledModules?.patientPortal === true;
	const nav = [
		{ href: '/portal/dashboard', label: t('nav.dashboard') },
		{ href: '/portal/appointments', label: t('portal.appointments') },
		{ href: '/portal/food-log', label: t('foodLog.title') },
		{ href: '/portal/profile', label: t('portal.profile') },
	];

	return (
		<Protected>
			<RoleGuard allowed={['patient']}>
				{!patientPortalEnabled ? (
					<div className='flex min-h-screen items-center justify-center bg-slate-50 px-6'>
						<div className='max-w-md rounded-lg border bg-white p-6 text-center shadow-sm'>
							<h1 className='text-xl font-semibold text-primary'>
								{t('portal.unavailableTitle')}
							</h1>
							<p className='mt-2 text-sm text-muted-foreground'>
								{t('portal.unavailableDetail')}
							</p>
						</div>
					</div>
				) : (
				<div className='min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50'>
					<header className='mx-auto flex max-w-5xl items-center justify-between px-6 py-6'>
						<div>
							<p className='text-xs uppercase text-muted-foreground'>
								{t('portal.title')}
							</p>
							<h1 className='text-2xl font-semibold text-primary'>{t('app.name')}</h1>
						</div>
						{canReturnToPanel ? (
							<Link href='/app/dashboard' className='text-sm text-primary underline'>
								{t('action.backToPanel')}
							</Link>
						) : null}
					</header>
					<nav className='mx-auto mb-6 flex max-w-5xl flex-wrap gap-2 px-6'>
						{nav.map((item) => {
							const active = pathname === item.href;
							return (
								<Link
									key={item.href}
									href={item.href}
									className={cn(
										'rounded-lg border px-3 py-2 text-sm font-medium transition',
										active
											? 'border-primary bg-primary text-primary-foreground'
											: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
									)}
								>
									{item.label}
								</Link>
							);
						})}
					</nav>
					<main className='mx-auto max-w-5xl px-6 pb-10'>{children}</main>
				</div>
				)}
			</RoleGuard>
		</Protected>
	);
}

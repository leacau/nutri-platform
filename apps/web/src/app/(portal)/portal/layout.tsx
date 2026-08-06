'use client';

import Link from 'next/link';
import { Protected, RoleGuard } from '../../../components/guards';
import { useClinic } from '../../../providers/clinic-provider';
import { useI18n } from '../../../providers/i18n-provider';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
	const { activeClinic, activeMembership } = useClinic();
	const { t } = useI18n();
	const canReturnToPanel = activeMembership?.role !== 'patient';
	const patientPortalEnabled =
		activeClinic?.billing?.enabledModules?.patientPortal === true;

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
					<main className='mx-auto max-w-5xl px-6 pb-10'>{children}</main>
				</div>
				)}
			</RoleGuard>
		</Protected>
	);
}

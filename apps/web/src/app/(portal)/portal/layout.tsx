'use client';

import Link from 'next/link';
import { Protected, RoleGuard } from '../../../components/guards';
import { useClinic } from '../../../providers/clinic-provider';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
	const { activeMembership, platformRole } = useClinic();
	const canReturnToPanel =
		platformRole === 'platform_admin' || activeMembership?.role !== 'patient';

	return (
		<Protected>
			<RoleGuard allowed={['patient']} allowPlatformAdmin>
				<div className='min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50'>
					<header className='mx-auto flex max-w-5xl items-center justify-between px-6 py-6'>
						<div>
							<p className='text-xs uppercase text-muted-foreground'>
								Portal paciente
							</p>
							<h1 className='text-2xl font-semibold text-primary'>AMSA Core</h1>
						</div>
						{canReturnToPanel ? (
							<Link href='/app/dashboard' className='text-sm text-primary underline'>
								Volver al panel
							</Link>
						) : null}
					</header>
					<main className='mx-auto max-w-5xl px-6 pb-10'>{children}</main>
				</div>
			</RoleGuard>
		</Protected>
	);
}

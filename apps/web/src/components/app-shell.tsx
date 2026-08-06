'use client';

import {
	Activity,
	BarChart3,
	Building2,
	CalendarClock,
	ClipboardList,
	FileText,
	LayoutDashboard,
	Loader2,
	LogOut,
	Settings,
	Shield,
	ShieldCheck,
	UserCircle,
	Users,
} from 'lucide-react';
import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { Button } from './ui/button';
import { ClinicSwitcher } from './clinic-switcher';
import { LanguageSelector } from './language-selector';
import Link from 'next/link';
import { ThemeToggle } from './theme-toggle';
import type { BillingModuleKey } from '../lib/types';
import { cn } from '../lib/utils';
import { useAuth } from '../providers/auth-provider';
import { useClinic } from '../providers/clinic-provider';
import { useI18n } from '../providers/i18n-provider';
import { usePermissions } from '../hooks/use-permissions';

type NavItem = {
	labelKey: string;
	href: string;
	icon: ReactNode;
	roles?: string[];
	requiredModule?: BillingModuleKey;
};

const navItems: NavItem[] = [
	{
		labelKey: 'nav.clinics',
		href: '/admin/clinics',
		icon: <Building2 className='h-4 w-4' />,
		roles: ['platform_admin'],
	},
	{
		labelKey: 'nav.dashboard',
		href: '/app/dashboard',
		icon: <LayoutDashboard className='h-4 w-4' />,
		roles: ['clinic_admin', 'staff', 'professional', 'platform_admin'],
	},
	{
		labelKey: 'nav.patients',
		href: '/app/patients',
		icon: <Users className='h-4 w-4' />,
		roles: ['clinic_admin', 'staff', 'professional'],
	},
	{
		labelKey: 'nav.appointments',
		href: '/app/appointments',
		icon: <CalendarClock className='h-4 w-4' />,
		roles: ['clinic_admin', 'staff', 'professional'],
	},
	{
		labelKey: 'nav.nutritionists',
		href: '/app/nutritionists',
		icon: <UserCircle className='h-4 w-4' />,
		roles: ['clinic_admin', 'staff'],
	},
	{
		labelKey: 'nav.staff',
		href: '/app/staff',
		icon: <Users className='h-4 w-4' />,
		roles: ['clinic_admin'],
	},
	{
		labelKey: 'nav.messages',
		href: '/app/templates',
		icon: <FileText className='h-4 w-4' />,
		roles: ['clinic_admin', 'staff', 'professional'],
		requiredModule: 'automatedMessaging',
	},
	{
		labelKey: 'nav.measurementTemplates',
		href: '/app/measurement-templates',
		icon: <Activity className='h-4 w-4' />,
		roles: ['clinic_admin', 'professional'],
	},
	{
		labelKey: 'nav.audit',
		href: '/app/audit',
		icon: <Shield className='h-4 w-4' />,
		roles: ['clinic_admin', 'platform_admin'],
		requiredModule: 'advancedAudit',
	},
	{
		labelKey: 'nav.compliance',
		href: '/app/compliance',
		icon: <ShieldCheck className='h-4 w-4' />,
		roles: ['clinic_admin', 'platform_admin'],
		requiredModule: 'advancedAudit',
	},
	{
		labelKey: 'nav.settings',
		href: '/app/clinic-settings',
		icon: <Settings className='h-4 w-4' />,
		roles: ['clinic_admin'],
		requiredModule: 'customBranding',
	},
	{
		labelKey: 'nav.portal',
		href: '/portal/dashboard',
		icon: <ClipboardList className='h-4 w-4' />,
		roles: ['patient'],
		requiredModule: 'patientPortal',
	},
];

export function AppShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const { activeClinic, activeMembership, platformRole } = useClinic();
	const { logout } = useAuth();
	const router = useRouter();
	const perms = usePermissions();
	const { t } = useI18n();

	const currentRole = activeMembership?.role;
	const patientPortalEnabled =
		activeClinic?.billing?.enabledModules?.patientPortal === true;
	const displayRole =
		platformRole === 'platform_admin' ? t('common.superuser') : currentRole;
	const logoUrl = activeClinic?.branding?.logoUrl;
	const accentColor = activeClinic?.branding?.accentColor || undefined;

	useEffect(() => {
		if (currentRole === 'patient' && pathname?.startsWith('/app')) {
			router.replace('/portal/dashboard');
		}
	}, [currentRole, pathname, router]);

	if (currentRole === 'patient' && pathname?.startsWith('/app')) {
		return (
			<div className='flex min-h-screen flex-col items-center justify-center gap-2 text-muted-foreground'>
				<Loader2 className='h-6 w-6 animate-spin' />
				<p>{t('portal.opening')}</p>
			</div>
		);
	}

	const filteredNav = navItems.filter((item) => {
		if (item.href === '/portal/dashboard' && !patientPortalEnabled) return false;
		if (
			item.requiredModule &&
			activeClinic?.billing?.enabledModules?.[item.requiredModule] !== true
		) {
			return false;
		}
		if (!item.roles) return true;
		if (platformRole === 'platform_admin' && item.href !== '/portal/dashboard') {
			return true;
		}
		return currentRole ? item.roles.includes(currentRole) : false;
	});

	return (
		<div className='flex min-h-screen bg-slate-50'>
			<aside className='hidden w-64 flex-col border-r bg-white/80 backdrop-blur lg:flex'>
				<div className='flex items-center gap-3 px-5 py-4'>
					{logoUrl ? (
						<img
							src={logoUrl}
							alt={activeClinic?.name || t('app.name')}
							className='h-10 w-10 rounded-xl border object-cover'
						/>
					) : (
						<div
							className='flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary'
							style={
								accentColor
									? {
											color: accentColor,
											backgroundColor: `${accentColor}18`,
										}
									: undefined
							}
						>
							AC
						</div>
					)}
					<div>
						<p className='text-sm font-semibold text-primary'>{t('app.name')}</p>
						<p className='text-xs text-muted-foreground'>
							{activeMembership?.clinicName ??
								activeClinic?.name ??
								t('common.noWorkspace')}
						</p>
					</div>
				</div>
				<nav className='flex-1 space-y-1 px-3 py-4'>
					{filteredNav.map((item) => (
						<Link
							key={item.href}
							href={item.href}
							className={cn(
								'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-primary/5 hover:text-primary',
								pathname?.startsWith(item.href)
									? 'bg-primary/10 text-primary'
									: '',
							)}
						>
							{item.icon}
							{t(item.labelKey)}
						</Link>
					))}
				</nav>
				<div className='mt-auto space-y-2 px-4 pb-4'>
					<div className='rounded-xl border bg-gradient-to-r from-primary/10 to-secondary/10 px-3 py-3 text-xs text-muted-foreground'>
						<div className='flex items-center gap-2 text-primary'>
							<BarChart3 className='h-4 w-4' />
							<span>{t('common.status')}</span>
						</div>
						<p>{t('common.currentRole', { role: displayRole || t('common.noRole') })}</p>
					</div>
					<Button
						variant='outline'
						className='w-full'
						onClick={() => router.push('/select-clinic')}
					>
						{t('action.changeWorkspace')}
					</Button>
					<Button variant='ghost' className='w-full' onClick={logout}>
						<LogOut className='mr-2 h-4 w-4' />
						{t('action.logout')}
					</Button>
				</div>
			</aside>
			<div className='flex flex-1 flex-col'>
				<header className='sticky top-0 z-10 flex items-center justify-between border-b bg-white/70 px-4 py-3 backdrop-blur'>
					<div className='flex items-center gap-3'>
						<ClinicSwitcher />
						{perms.canViewAudit ? (
							<span className='rounded-full bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary'>
								{t('common.adminMode')}
							</span>
						) : null}
					</div>
					<div className='flex items-center gap-2'>
						<LanguageSelector />
						<ThemeToggle />
					</div>
				</header>
				<main className='flex-1 px-4 py-6'>{children}</main>
			</div>
		</div>
	);
}

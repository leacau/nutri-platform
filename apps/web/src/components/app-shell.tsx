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
	Menu,
	Settings,
	Shield,
	ShieldCheck,
	UserCircle,
	Users,
	X,
} from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { Button } from './ui/button';
import { ClinicSwitcher } from './clinic-switcher';
import { LanguageSelector } from './language-selector';
import Link from 'next/link';
import { NoriaLogo } from './brand/noria-logo';
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
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

	useEffect(() => {
		setIsMobileMenuOpen(false);
	}, [pathname]);

	if (currentRole === 'patient' && pathname?.startsWith('/app')) {
		return (
			<div className='flex min-h-screen flex-col items-center justify-center gap-2 text-muted-foreground'>
				<Loader2 className='h-6 w-6 animate-spin' />
				<p>{t('portal.opening')}</p>
			</div>
		);
	}

	const filteredNav = navItems.filter((item) => {
		if (item.href === '/portal/dashboard' && !patientPortalEnabled)
			return false;
		if (
			item.requiredModule &&
			activeClinic?.billing?.enabledModules?.[item.requiredModule] !== true
		) {
			return false;
		}
		if (!item.roles) return true;
		if (
			platformRole === 'platform_admin' &&
			item.href !== '/portal/dashboard'
		) {
			return true;
		}
		return currentRole ? item.roles.includes(currentRole) : false;
	});

	const workspaceName =
		activeMembership?.clinicName ??
		activeClinic?.name ??
		t('common.noWorkspace');
	const goToWorkspaceSelection = () => {
		setIsMobileMenuOpen(false);
		router.push('/select-clinic');
	};
	const handleLogout = () => {
		setIsMobileMenuOpen(false);
		logout();
	};
	const BrandBlock = ({ compact = false }: { compact?: boolean }) => (
		<div className='flex min-w-0 items-center gap-3'>
			{logoUrl ? (
				<img
					src={logoUrl}
					alt={activeClinic?.name || t('app.name')}
					className={cn(
						'rounded-xl border object-cover',
						compact ? 'h-9 w-9' : 'h-10 w-10',
					)}
				/>
			) : (
				<div
					className={cn(
						'flex items-center justify-center rounded-xl border bg-white',
						compact ? 'h-9 w-9' : 'h-10 w-10',
					)}
					style={
						accentColor
							? {
									color: accentColor,
									backgroundColor: `${accentColor}18`,
								}
							: undefined
					}
				>
					<NoriaLogo markOnly className={compact ? 'h-6 w-6' : 'h-7 w-7'} />
				</div>
			)}
			<div className='min-w-0'>
				<p className='truncate text-sm font-semibold text-primary'>
					{t('app.name')}
				</p>
				<p className='truncate text-xs text-muted-foreground'>by AMSA Core</p>
				<p className='truncate text-xs text-primary'>{workspaceName}</p>
			</div>
		</div>
	);
	const NavigationLinks = () => (
		<nav className='flex-1 space-y-1 px-3 py-4'>
			{filteredNav.map((item) => (
				<Link
					key={item.href}
					href={item.href}
					className={cn(
						'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-primary/5 hover:text-primary',
						pathname?.startsWith(item.href) ? 'bg-primary/10 text-primary' : '',
					)}
				>
					{item.icon}
					{t(item.labelKey)}
				</Link>
			))}
		</nav>
	);
	const SidebarActions = () => (
		<div className='mt-auto space-y-2 px-4 pb-4'>
			<div className='rounded-xl border bg-muted px-3 py-3 text-xs text-muted-foreground'>
				<div className='flex items-center gap-2 text-primary'>
					<BarChart3 className='h-4 w-4' />
					<span>{t('common.status')}</span>
				</div>
				<p>
					{t('common.currentRole', { role: displayRole || t('common.noRole') })}
				</p>
			</div>
			<Button
				variant='outline'
				className='w-full'
				onClick={goToWorkspaceSelection}
			>
				{t('action.changeWorkspace')}
			</Button>
			<Button variant='ghost' className='w-full' onClick={handleLogout}>
				<LogOut className='mr-2 h-4 w-4' />
				{t('action.logout')}
			</Button>
		</div>
	);

	return (
		<div className='flex min-h-screen bg-slate-50'>
			<aside className='hidden w-64 flex-col border-r bg-white/80 backdrop-blur lg:flex'>
				<div className='flex items-center gap-3 px-5 py-4'>
					<BrandBlock />
				</div>
				<NavigationLinks />
				<SidebarActions />
			</aside>
			{isMobileMenuOpen ? (
				<div className='fixed inset-0 z-40 lg:hidden'>
					<button
						type='button'
						className='absolute inset-0 bg-slate-950/40'
						aria-label={t('action.closeMenu')}
						onClick={() => setIsMobileMenuOpen(false)}
					/>
					<aside className='relative flex h-full w-[min(86vw,320px)] flex-col border-r bg-white shadow-xl'>
						<div className='flex items-center justify-between gap-3 border-b px-4 py-3'>
							<BrandBlock compact />
							<Button
								type='button'
								variant='ghost'
								size='icon'
								aria-label={t('action.closeMenu')}
								onClick={() => setIsMobileMenuOpen(false)}
							>
								<X className='h-5 w-5' />
							</Button>
						</div>
						<NavigationLinks />
						<SidebarActions />
					</aside>
				</div>
			) : null}
			<div className='flex flex-1 flex-col'>
				<header className='sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white/70 px-3 py-3 backdrop-blur sm:px-4'>
					<div className='flex min-w-0 items-center gap-2 sm:gap-3'>
						<Button
							type='button'
							variant='ghost'
							size='icon'
							className='shrink-0 lg:hidden'
							aria-label={t('action.openMenu')}
							onClick={() => setIsMobileMenuOpen(true)}
						>
							<Menu className='h-5 w-5' />
						</Button>
						<ClinicSwitcher />
						{perms.canViewAudit ? (
							<span className='rounded-full bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary'>
								{t('common.adminMode')}
							</span>
						) : null}
					</div>
					<div className='flex shrink-0 items-center gap-2'>
						<LanguageSelector />
						<ThemeToggle />
					</div>
				</header>
				<main className='flex-1 overflow-x-hidden px-3 py-5 sm:px-4 sm:py-6'>
					{children}
				</main>
			</div>
		</div>
	);
}


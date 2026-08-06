'use client';

import {
	Building2,
	CheckCircle2,
	Hospital,
	Loader2,
	LogOut,
	Pencil,
	Plus,
	Power,
	PowerOff,
	RefreshCw,
	Settings2,
	Shield,
	Trash2,
	UserPlus,
	Users,
} from 'lucide-react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../../components/ui/card';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { AuthGuard } from '../../../components/guards';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select } from '../../../components/ui/select';
import { apiClient } from '../../../lib/api-client';
import {
	BillingModuleKey,
	BillingPlanKey,
	BillingStatus,
	Clinic,
	ClinicBillingLimits,
	ClinicMembershipRole,
	UserAccount,
} from '../../../lib/types';
import { useAuth } from '../../../providers/auth-provider';
import { useClinic } from '../../../providers/clinic-provider';
import { useForm } from 'react-hook-form';
import { useI18n } from '../../../providers/i18n-provider';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const createClinicSchema = z.object({
	name: z.string().min(2, 'El nombre es obligatorio'),
	plan: z.enum(['starter_1_5', 'team_6_15', 'scale_16_50', 'enterprise']),
	adminName: z.string().min(2, 'El nombre es obligatorio'),
	adminEmail: z.string().email('Email invalido'),
	adminDni: z
		.string()
		.min(7, 'El DNI debe tener min 7 digitos')
		.max(8, 'El DNI debe tener max 8 digitos')
		.regex(/^\d+$/, 'Solo numeros'),
});

const editClinicSchema = z.object({
	name: z.string().min(2, 'El nombre es obligatorio'),
});

const assignMemberSchema = z.object({
	uid: z.string().min(7, 'Ingresá el DNI del usuario'),
	role: z.enum(['clinic_admin', 'professional', 'staff']),
});

type CreateClinicForm = z.infer<typeof createClinicSchema>;
type EditClinicForm = z.infer<typeof editClinicSchema>;
type AssignMemberForm = z.infer<typeof assignMemberSchema>;

type AdminRole = Extract<ClinicMembershipRole, 'clinic_admin' | 'professional' | 'staff'>;

const roleOptions: Array<{ value: AdminRole; label: string }> = [
	{ value: 'clinic_admin', label: 'Admin de clinica' },
	{ value: 'professional', label: 'Profesional' },
	{ value: 'staff', label: 'Staff' },
];

const planOptions: Array<{ value: BillingPlanKey; label: string; detail: string }> = [
	{ value: 'individual', label: 'Individual', detail: '1 profesional' },
	{ value: 'starter_1_5', label: 'Inicial', detail: '1 a 5 profesionales' },
	{ value: 'team_6_15', label: 'Equipo', detail: '6 a 15 profesionales' },
	{ value: 'scale_16_50', label: 'Escala', detail: '16 a 50 profesionales' },
	{ value: 'enterprise', label: 'Enterprise', detail: 'Sin limite predefinido' },
];

const commercialStatusOptions: Array<{ value: BillingStatus; label: string }> = [
	{ value: 'trial', label: 'Trial' },
	{ value: 'active', label: 'Activo' },
	{ value: 'past_due', label: 'Pago vencido' },
	{ value: 'suspended', label: 'Suspendido' },
	{ value: 'cancelled', label: 'Cancelado' },
];

const moduleOptions: Array<{ value: BillingModuleKey; label: string; detail: string }> = [
	{
		value: 'patientPortal',
		label: 'Portal paciente',
		detail: 'Acceso de pacientes a turnos, perfil e historia habilitada.',
	},
	{
		value: 'automatedMessaging',
		label: 'Mensajeria automatica',
		detail: 'Recordatorios y comunicaciones automáticas.',
	},
	{
		value: 'advancedAudit',
		label: 'Auditoria avanzada',
		detail: 'Eventos extendidos y reportes de compliance.',
	},
	{
		value: 'digitalSignature',
		label: 'Firma digital',
		detail: 'Preparado para proveedor certificado.',
	},
	{
		value: 'customBranding',
		label: 'Marca blanca',
		detail: 'Branding propio del espacio.',
	},
];

const defaultLimitsByPlan: Record<BillingPlanKey, ClinicBillingLimits> = {
	individual: { professionals: 1, staff: 1, activePatients: 100, storageGb: 2 },
	starter_1_5: { professionals: 5, staff: 4, activePatients: 500, storageGb: 10 },
	team_6_15: { professionals: 15, staff: 10, activePatients: 2000, storageGb: 30 },
	scale_16_50: { professionals: 50, staff: 30, activePatients: 10000, storageGb: 100 },
	enterprise: { professionals: null, staff: null, activePatients: null, storageGb: null },
};

const moduleFallback = {
	patientPortal: false,
	automatedMessaging: false,
	advancedAudit: false,
	digitalSignature: false,
	customBranding: false,
};

function displayLimit(value: number | null | undefined) {
	return value === null || value === undefined ? 'Sin limite' : String(value);
}

function AdminClinicsContent() {
	const { clinics, isLoading, me, setActiveClinic } = useClinic();
	const { idToken, logout } = useAuth();
	const { t } = useI18n();
	const qc = useQueryClient();
	const router = useRouter();
	const isPlatformAdmin = me?.platformRole === 'platform_admin';
	const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
	const [deleteConfirm, setDeleteConfirm] = useState('');
	const planLabel = (plan: BillingPlanKey) =>
		({
			individual: t('billing.plan.individual'),
			starter_1_5: t('billing.plan.starter'),
			team_6_15: t('billing.plan.team'),
			scale_16_50: t('billing.plan.scale'),
			enterprise: t('billing.plan.enterprise'),
		})[plan];
	const planDetail = (plan: BillingPlanKey) =>
		({
			individual: t('billing.plan.individualDetail'),
			starter_1_5: t('billing.plan.starterDetail'),
			team_6_15: t('billing.plan.teamDetail'),
			scale_16_50: t('billing.plan.scaleDetail'),
			enterprise: t('billing.plan.enterpriseDetail'),
		})[plan];
	const statusLabel = (status: BillingStatus) =>
		({
			trial: t('billing.status.trial'),
			active: t('billing.status.active'),
			past_due: t('billing.status.pastDue'),
			suspended: t('billing.status.suspended'),
			cancelled: t('billing.status.cancelled'),
		})[status];
	const adminRoleLabel = (role: AdminRole) =>
		({
			clinic_admin: t('role.clinicAdmin'),
			professional: t('professionals.title'),
			staff: t('staff.title'),
		})[role];
	const moduleLabel = (module: BillingModuleKey) => t(`module.${module}`);
	const moduleDetail = (module: BillingModuleKey) => t(`module.${module}Detail`);

	useEffect(() => {
		if (!isLoading && me && !isPlatformAdmin) router.replace('/select-clinic');
	}, [isLoading, isPlatformAdmin, me, router]);

	useEffect(() => {
		if (!selectedClinicId && clinics?.[0]) {
			const firstClinicId = clinics[0].id;
			queueMicrotask(() => setSelectedClinicId(firstClinicId));
		}
	}, [clinics, selectedClinicId]);

	const selectedClinic = useMemo(
		() => clinics?.find((clinic) => clinic.id === selectedClinicId) ?? null,
		[clinics, selectedClinicId],
	);

	const createForm = useForm<CreateClinicForm>({
		resolver: zodResolver(createClinicSchema),
		defaultValues: { plan: 'starter_1_5' },
	});
	const editForm = useForm<EditClinicForm>({
		resolver: zodResolver(editClinicSchema),
		values: { name: selectedClinic?.name ?? '' },
	});
	const assignForm = useForm<AssignMemberForm>({
		resolver: zodResolver(assignMemberSchema),
		defaultValues: { role: 'staff' },
	});

	const membersQuery = useQuery({
		queryKey: ['admin-clinic-members', selectedClinicId],
		queryFn: () => apiClient.adminClinicMembers(selectedClinicId!, idToken || undefined),
		enabled: Boolean(idToken && selectedClinicId && isPlatformAdmin),
	});

	const refreshAdminClinics = () => {
		qc.invalidateQueries({ queryKey: ['clinics'] });
		qc.invalidateQueries({ queryKey: ['admin-clinic-members', selectedClinicId] });
	};

	const enterClinic = (clinicId: string) => {
		setActiveClinic(clinicId);
		router.push('/app/dashboard');
	};

	const createClinicMutation = useMutation({
		mutationFn: async (data: CreateClinicForm) =>
			apiClient.createClinic(
				{
					name: data.name,
					billing: { plan: data.plan },
					admin: {
						name: data.adminName,
						email: data.adminEmail,
						dni: data.adminDni,
					},
				},
				idToken || undefined,
			),
		onSuccess: (clinic) => {
			refreshAdminClinics();
			createForm.reset();
			const clinicId = clinic.id || clinic.clinicId;
			if (clinicId) {
				setSelectedClinicId(clinicId);
				enterClinic(clinicId);
			}
		},
	});

	const updateClinicMutation = useMutation({
		mutationFn: async (data: {
			clinicId: string;
			name?: string;
			isActive?: boolean;
			billing?: Parameters<typeof apiClient.updateClinic>[1]['billing'];
		}) =>
			apiClient.updateClinic(
				data.clinicId,
				{ name: data.name, isActive: data.isActive, billing: data.billing },
				idToken || undefined,
			),
		onSuccess: refreshAdminClinics,
	});

	const updateBilling = (
		billing: NonNullable<Parameters<typeof apiClient.updateClinic>[1]['billing']>,
	) => {
		if (!selectedClinic) return;
		updateClinicMutation.mutate({ clinicId: selectedClinic.id, billing });
	};

	const deleteClinicMutation = useMutation({
		mutationFn: async (clinicId: string) =>
			apiClient.deleteClinic(clinicId, idToken || undefined),
		onSuccess: () => {
			setDeleteConfirm('');
			setSelectedClinicId(null);
			refreshAdminClinics();
		},
	});

	const addMemberMutation = useMutation({
		mutationFn: async (data: AssignMemberForm) => {
			const user = await apiClient.lookupUser(data.uid, idToken || undefined);
			if (!user?.uid) {
				throw new Error(t('admin.userNotFoundByDni'));
			}
			return apiClient.addAdminClinicMember(
				selectedClinicId!,
				{ uid: user.uid, role: data.role },
				idToken || undefined,
			);
		},
		onSuccess: () => {
			assignForm.reset({ uid: '', role: 'staff' });
			qc.invalidateQueries({ queryKey: ['admin-clinic-members', selectedClinicId] });
		},
	});

	const updateMemberMutation = useMutation({
		mutationFn: async (data: {
			member: UserAccount;
			role?: AdminRole;
			isActive?: boolean;
		}) =>
			apiClient.updateAdminClinicMember(
				selectedClinicId!,
				data.member.id,
				{ role: data.role, isActive: data.isActive },
				idToken || undefined,
			),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ['admin-clinic-members', selectedClinicId] }),
	});

	const deleteMemberMutation = useMutation({
		mutationFn: async (member: UserAccount) =>
			apiClient.deleteAdminClinicMember(
				selectedClinicId!,
				member.id,
				idToken || undefined,
			),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ['admin-clinic-members', selectedClinicId] }),
	});

	const selectedPlan =
		selectedClinic?.billing?.plan ??
		(selectedClinic?.tenantType === 'individual_practice'
			? 'individual'
			: 'starter_1_5');
	const selectedStatus = selectedClinic?.billing?.status ?? 'trial';
	const selectedModules = {
		...moduleFallback,
		...(selectedClinic?.billing?.enabledModules ?? {}),
	};
	const selectedLimits =
		selectedPlan === 'enterprise'
			? (selectedClinic?.billing?.limits ?? defaultLimitsByPlan.enterprise)
			: defaultLimitsByPlan[selectedPlan];

	if (isLoading || !me) {
		return (
			<div className='flex min-h-screen items-center justify-center text-muted-foreground'>
				<Loader2 className='mr-2 h-5 w-5 animate-spin' />
				{t('admin.loadingClinics')}
			</div>
		);
	}

	if (!isPlatformAdmin) return null;

	return (
		<main className='mx-auto max-w-7xl px-6 py-8'>
			<div className='mb-6 flex flex-wrap items-center justify-between gap-4'>
				<div>
					<p className='text-sm text-muted-foreground'>{t('admin.platformAdministration')}</p>
					<h1 className='text-3xl font-semibold text-primary'>{t('admin.clinics')}</h1>
				</div>
				<div className='flex gap-2'>
					<Button variant='outline' onClick={refreshAdminClinics}>
						<RefreshCw className='mr-2 h-4 w-4' />
						{t('action.refresh')}
					</Button>
					<Button variant='outline' onClick={logout}>
						<LogOut className='mr-2 h-4 w-4' />
						{t('action.logout')}
					</Button>
				</div>
			</div>

			<div className='grid gap-6 xl:grid-cols-[minmax(360px,1fr)_minmax(420px,520px)]'>
				<section className='space-y-3'>
					{clinics?.length ? (
						clinics.map((clinic: Clinic) => {
							const active = clinic.isActive !== false;
							const selected = selectedClinicId === clinic.id;
							return (
								<Card
									key={clinic.id}
									className={selected ? 'border-primary shadow-sm' : 'border-primary/10 shadow-sm'}
								>
									<CardContent className='grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-center'>
										<button
											type='button'
											onClick={() => setSelectedClinicId(clinic.id)}
											className='flex min-w-0 items-center gap-3 text-left'
										>
											<div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
												<Building2 className='h-5 w-5' />
											</div>
											<div className='min-w-0'>
												<div className='flex flex-wrap items-center gap-2'>
													<h2 className='truncate text-lg font-semibold text-primary'>{clinic.name}</h2>
													<Badge variant={active ? 'secondary' : 'outline'}>
														{active ? t('common.active') : t('common.inactive')}
													</Badge>
													<Badge variant='outline'>
														{planLabel(clinic.billing?.plan ?? 'starter_1_5')}
													</Badge>
													{clinic.billing?.enabledModules?.patientPortal ? (
														<Badge variant='secondary'>{t('module.patientPortal')}</Badge>
													) : null}
												</div>
												<p className='truncate text-xs text-muted-foreground'>
													{clinic.tenantType === 'individual_practice'
														? t('clinic.kind.individual')
														: t('clinic.kind.clinic')}
												</p>
											</div>
										</button>
										<div className='flex flex-wrap justify-end gap-2'>
											<Button size='sm' variant='outline' onClick={() => setSelectedClinicId(clinic.id)}>
												<Pencil className='mr-2 h-4 w-4' />
												{t('action.edit')}
											</Button>
											<Button size='sm' onClick={() => enterClinic(clinic.id)} disabled={!active}>
												<CheckCircle2 className='mr-2 h-4 w-4' />
												{t('action.enter')}
											</Button>
										</div>
									</CardContent>
								</Card>
							);
						})
					) : (
						<div className='rounded-lg border border-dashed p-8 text-center text-muted-foreground'>
							{t('admin.noClinics')}
						</div>
					)}
				</section>

				<aside className='space-y-6'>
					<Card className='border-primary/10 shadow-sm'>
						<CardHeader>
							<CardTitle className='flex items-center gap-2 text-lg'>
								<Hospital className='h-4 w-4' />
								{t('clinic.createClinic')}
							</CardTitle>
							<CardDescription>{t('admin.initialAdminDetail')}</CardDescription>
						</CardHeader>
						<CardContent>
							<form
								onSubmit={createForm.handleSubmit((data) => createClinicMutation.mutate(data))}
								className='grid gap-3 sm:grid-cols-2'
							>
								<div className='space-y-1 sm:col-span-2'>
									<Label>{t('clinic.clinicName')}</Label>
									<Input placeholder={t('clinic.clinicPlaceholder')} {...createForm.register('name')} />
								</div>
								<div className='space-y-1 sm:col-span-2'>
									<Label>{t('admin.initialPlan')}</Label>
									<Select {...createForm.register('plan')}>
										{planOptions
											.filter((plan) => plan.value !== 'individual')
											.map((plan) => (
												<option key={plan.value} value={plan.value}>
													{planLabel(plan.value)} - {planDetail(plan.value)}
												</option>
											))}
									</Select>
								</div>
								<div className='space-y-1'>
									<Label>Admin</Label>
									<Input placeholder={t('common.fullNamePlaceholder')} {...createForm.register('adminName')} />
								</div>
								<div className='space-y-1'>
									<Label>Email</Label>
									<Input type='email' placeholder='admin@clinica.com' {...createForm.register('adminEmail')} />
								</div>
								<div className='space-y-1'>
									<Label>DNI</Label>
									<Input placeholder='12345678' {...createForm.register('adminDni')} />
								</div>
								<Button className='self-end' type='submit' disabled={createClinicMutation.isPending}>
									<Plus className='mr-2 h-4 w-4' />
									{t('action.create')}
								</Button>
							</form>
							{createClinicMutation.error ? (
								<p className='mt-3 text-sm text-destructive'>{t('clinic.createClinicError')}</p>
							) : null}
						</CardContent>
					</Card>

					{selectedClinic ? (
						<Card className='border-primary/10 shadow-sm'>
							<CardHeader>
								<CardTitle className='flex items-center gap-2 text-lg'>
									<Shield className='h-4 w-4' />
									{t('admin.maintenance')}
								</CardTitle>
								<CardDescription>{selectedClinic.name}</CardDescription>
							</CardHeader>
							<CardContent className='space-y-5'>
								<form
									onSubmit={editForm.handleSubmit((data) =>
										updateClinicMutation.mutate({ clinicId: selectedClinic.id, name: data.name }),
									)}
									className='flex gap-2'
								>
									<Input {...editForm.register('name')} />
									<Button type='submit' disabled={updateClinicMutation.isPending}>
										<Pencil className='mr-2 h-4 w-4' />
										{t('action.save')}
									</Button>
								</form>

								<div className='grid gap-2 sm:grid-cols-2'>
									<Button
										variant='outline'
										onClick={() =>
											updateClinicMutation.mutate({
												clinicId: selectedClinic.id,
												isActive: selectedClinic.isActive === false,
											})
										}
									>
										{selectedClinic.isActive === false ? (
											<Power className='mr-2 h-4 w-4' />
										) : (
											<PowerOff className='mr-2 h-4 w-4' />
										)}
										{selectedClinic.isActive === false ? t('action.enable') : t('action.disable')}
									</Button>
									<Button onClick={() => enterClinic(selectedClinic.id)} disabled={selectedClinic.isActive === false}>
										<CheckCircle2 className='mr-2 h-4 w-4' />
										{t('action.enter')}
									</Button>
								</div>

								<div className='rounded-md border p-3'>
									<div className='mb-3 flex items-center gap-2 font-medium text-primary'>
										<Settings2 className='h-4 w-4' />
										{t('admin.planAndFeatures')}
									</div>
									<div className='grid gap-3 sm:grid-cols-2'>
										<div className='space-y-1'>
											<Label>{t('admin.commercialLevel')}</Label>
											<Select
												value={selectedPlan}
												onChange={(event) =>
													updateBilling({ plan: event.target.value as BillingPlanKey })
												}
											>
												{planOptions.map((plan) => (
													<option key={plan.value} value={plan.value}>
														{planLabel(plan.value)} - {planDetail(plan.value)}
													</option>
												))}
											</Select>
										</div>
										<div className='space-y-1'>
											<Label>{t('admin.commercialStatus')}</Label>
											<Select
												value={selectedStatus}
												onChange={(event) =>
													updateBilling({ status: event.target.value as BillingStatus })
												}
											>
												{commercialStatusOptions.map((status) => (
													<option key={status.value} value={status.value}>
														{statusLabel(status.value)}
													</option>
												))}
											</Select>
										</div>
									</div>

									<div className='mt-4 grid gap-2'>
										{moduleOptions.map((module) => {
											const enabled = selectedModules[module.value];
											return (
												<button
													key={module.value}
													type='button'
													onClick={() =>
														updateBilling({
															enabledModules: {
																[module.value]: !enabled,
															},
														})
													}
													className={`rounded-md border p-3 text-left transition ${
														enabled
															? 'border-secondary bg-secondary/10'
															: 'border-border hover:bg-muted'
													}`}
												>
													<div className='flex items-center justify-between gap-3'>
														<span className='font-medium'>{moduleLabel(module.value)}</span>
														<Badge variant={enabled ? 'secondary' : 'outline'}>
															{enabled ? t('admin.included') : t('admin.notIncluded')}
														</Badge>
													</div>
													<p className='mt-1 text-xs text-muted-foreground'>
														{moduleDetail(module.value)}
													</p>
												</button>
											);
										})}
									</div>

									<div className='mt-4 grid gap-3 sm:grid-cols-2'>
										{(
											[
												['professionals', t('professionals.title')],
												['staff', t('staff.title')],
												['activePatients', t('patients.activePatients')],
												['storageGb', 'Storage GB'],
											] as const
										).map(([key, label]) => (
											<div key={key} className='space-y-1'>
												<Label>{label}</Label>
												<Input
													key={`${selectedClinic.id}-${selectedPlan}-${key}-${selectedLimits[key] ?? 'none'}`}
													type='number'
													min={0}
													placeholder={displayLimit(selectedLimits[key])}
													defaultValue={selectedLimits[key] ?? ''}
													disabled={selectedPlan !== 'enterprise'}
													onBlur={(event) => {
														if (selectedPlan !== 'enterprise') return;
														const raw = event.target.value.trim();
														updateBilling({
															limits: {
																[key]: raw === '' ? null : Number(raw),
															},
														});
													}}
												/>
											</div>
										))}
									</div>
									<p className='mt-3 text-xs text-muted-foreground'>
										{selectedPlan === 'enterprise'
											? t('admin.enterpriseCustomLimits')
											: t('admin.planDefinedLimits')}{' '}
										{t('admin.patientPortalAddon')}
									</p>
								</div>

								<div className='rounded-md border p-3'>
									<div className='mb-3 flex items-center gap-2 font-medium text-primary'>
										<Users className='h-4 w-4' />
										{t('admin.assignedUsers')}
									</div>
									<form
										onSubmit={assignForm.handleSubmit((data) => addMemberMutation.mutate(data))}
										className='mb-3 grid gap-2 sm:grid-cols-[1fr_150px_auto]'
									>
										<Input placeholder={t('clinic.adminDni')} {...assignForm.register('uid')} />
										<Select {...assignForm.register('role')}>
											{roleOptions.map((role) => (
												<option key={role.value} value={role.value}>{adminRoleLabel(role.value)}</option>
											))}
										</Select>
										<Button type='submit' disabled={addMemberMutation.isPending}>
											<UserPlus className='mr-2 h-4 w-4' />
											{t('admin.assign')}
										</Button>
									</form>

									{membersQuery.isLoading ? (
										<p className='text-sm text-muted-foreground'>{t('admin.loadingUsers')}</p>
									) : membersQuery.data?.length ? (
										<div className='space-y-2'>
											{membersQuery.data.map((member) => (
												<div key={member.id} className='grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_145px_auto] sm:items-center'>
													<div className='min-w-0'>
														<p className='truncate text-sm font-medium'>{member.name}</p>
														<p className='truncate text-xs text-muted-foreground'>{member.email}</p>
													</div>
													<Select
														value={member.role as AdminRole}
														onChange={(event) =>
															updateMemberMutation.mutate({ member, role: event.target.value as AdminRole })
														}
													>
														{roleOptions.map((role) => (
															<option key={role.value} value={role.value}>{adminRoleLabel(role.value)}</option>
														))}
													</Select>
													<div className='flex justify-end gap-2'>
														<Button
															size='sm'
															variant='outline'
															onClick={() => updateMemberMutation.mutate({ member, isActive: !member.isActive })}
														>
															{member.isActive === false ? t('action.enable') : t('admin.pause')}
														</Button>
														<Button size='sm' variant='outline' onClick={() => deleteMemberMutation.mutate(member)}>
															<Trash2 className='h-4 w-4' />
														</Button>
													</div>
												</div>
											))}
										</div>
									) : (
										<p className='text-sm text-muted-foreground'>{t('admin.noAssignedUsers')}</p>
									)}
								</div>

								<div className='rounded-md border border-destructive/30 p-3'>
									<Label>{t('admin.archiveClinic')}</Label>
									<p className='mb-3 text-xs text-muted-foreground'>{t('admin.archiveClinicDetail')}</p>
									<div className='flex gap-2'>
										<Input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} placeholder={t('admin.archiveConfirm')} />
										<Button
											variant='destructive'
											disabled={deleteConfirm !== t('admin.archiveConfirm') || deleteClinicMutation.isPending}
											onClick={() => deleteClinicMutation.mutate(selectedClinic.id)}
										>
											<Trash2 className='mr-2 h-4 w-4' />
											{t('action.archive')}
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					) : null}
				</aside>
			</div>
		</main>
	);
}

export default function AdminClinicsPage() {
	return (
		<AuthGuard>
			<AdminClinicsContent />
		</AuthGuard>
	);
}

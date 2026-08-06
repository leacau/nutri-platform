'use client';

import {
	Building2,
	CheckCircle2,
	Hospital,
	Loader2,
	Stethoscope,
} from 'lucide-react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../components/ui/card';
import { Suspense, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';

import { AuthGuard } from './../../components/guards';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { apiClient } from '../../lib/api-client';
import { getFirebaseAuth } from '../../lib/firebase';
import { useAuth } from '../../providers/auth-provider';
import { useClinic } from '../../providers/clinic-provider';
import { useForm } from 'react-hook-form';
import { useI18n } from '../../providers/i18n-provider';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

type CreateClinicForm = {
	name: string;
	adminName: string;
	adminEmail: string;
	adminDni: string;
};

type CreateIndividualPracticeForm = {
	name: string;
};

function SelectClinicContent() {
	const qc = useQueryClient();
	const { clinics, me, setActiveClinic, isLoading } = useClinic();
	const { logout, idToken } = useAuth();
	const router = useRouter();
	const searchParams = useSearchParams();
	const { t } = useI18n();
	const next = searchParams.get('next') || '/app/dashboard';

	const createClinicSchema = z.object({
		name: z.string().min(2, t('validation.nameRequired')),
		adminName: z.string().min(2, t('validation.nameRequired')),
		adminEmail: z.string().email(t('validation.invalidEmail')),
		adminDni: z
			.string()
			.min(7, t('team.dniMin'))
			.max(8, t('team.dniMax'))
			.regex(/^\d+$/, t('team.onlyNumbers')),
	});

	const createIndividualPracticeSchema = z.object({
		name: z.string().min(2, t('validation.nameRequired')),
	});

	const isPlatformAdmin = me?.platformRole === 'platform_admin';
	const hasIndividualPractice = clinics?.some(
		(clinic) =>
			clinic.tenantType === 'individual_practice' &&
			clinic.ownerProfessionalUid === me?.uid,
	);
	const hasOnlyPatientMemberships =
		(me?.memberships.length ?? 0) > 0 &&
		me?.memberships.every((membership) => membership.role === 'patient');
	const canCreateIndividualPractice =
		!isPlatformAdmin && !hasIndividualPractice && !hasOnlyPatientMemberships;

	useEffect(() => {
		if (!isLoading && isPlatformAdmin) {
			router.replace('/admin/clinics');
		}
	}, [isLoading, isPlatformAdmin, router]);

	useEffect(() => {
		(async () => {
			const auth = getFirebaseAuth();
			const user = auth.currentUser;

			if (!user) return;

			await user.getIdToken(true);
		})().catch(() => undefined);
	}, []);

	const handleSelect = (clinicId: string) => {
		setActiveClinic(clinicId);
		router.push(next);
	};

	const roleLabel = (clinicId: string) => {
		if (isPlatformAdmin) return t('common.superuser');
		return me?.memberships.find((m) => m.clinicId === clinicId)?.role;
	};

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<CreateClinicForm>({
		resolver: zodResolver(createClinicSchema),
	});

	const {
		register: registerPractice,
		handleSubmit: handlePracticeSubmit,
		reset: resetPractice,
		formState: { errors: practiceErrors },
	} = useForm<CreateIndividualPracticeForm>({
		resolver: zodResolver(createIndividualPracticeSchema),
		defaultValues: {
			name: me?.email ? `Consultorio de ${me.email}` : 'Mi consultorio',
		},
	});

	const createClinicMutation = useMutation({
		mutationFn: async (data: CreateClinicForm) =>
			apiClient.createClinic(
				{
					name: data.name,
					admin: {
						name: data.adminName,
						email: data.adminEmail,
						dni: data.adminDni,
					},
				},
				idToken || undefined,
			),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['clinics'] });
			reset();
		},
		onError: () => alert(t('clinic.createClinicError')),
	});

	const createIndividualPracticeMutation = useMutation({
		mutationFn: async (data: CreateIndividualPracticeForm) =>
			apiClient.createIndividualPractice(data, idToken || undefined),
		onSuccess: (clinic) => {
			qc.invalidateQueries({ queryKey: ['clinics'] });
			qc.invalidateQueries({ queryKey: ['me'] });
			resetPractice();
			setActiveClinic(clinic.id);
			router.push('/app/dashboard');
		},
		onError: () => alert(t('clinic.createPracticeError')),
	});

	const isFullyLoading = isLoading || !idToken;
	const individualPractices =
		clinics?.filter((clinic) => clinic.tenantType === 'individual_practice') ??
		[];
	const clinicTenants =
		clinics?.filter((clinic) => clinic.tenantType !== 'individual_practice') ??
		[];

	const renderClinicCard = (clinic: NonNullable<typeof clinics>[number]) => (
		<Card key={clinic.id} className='border-primary/10 shadow-sm'>
			<CardHeader className='flex flex-row items-center gap-3'>
				<div className='flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary'>
					{clinic.tenantType === 'individual_practice' ? (
						<Stethoscope className='h-5 w-5' />
					) : (
						<Building2 className='h-5 w-5' />
					)}
				</div>
				<div>
					<CardTitle className='text-lg'>{clinic.name}</CardTitle>
					<CardDescription>
						{clinic.tenantType === 'individual_practice'
							? t('clinic.kind.individual')
							: t('clinic.kind.clinic')}
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className='flex items-center justify-between'>
				<Badge variant='secondary'>
					{t('clinic.role')}: {roleLabel(clinic.id)}
				</Badge>
				<Button onClick={() => handleSelect(clinic.id)} variant='default'>
					<CheckCircle2 className='mr-2 h-4 w-4' />
					{t('action.enter')}
				</Button>
			</CardContent>
		</Card>
	);

	return (
		<AuthGuard>
			<main className='mx-auto max-w-5xl px-6 py-14'>
				<div className='mb-10 flex items-center justify-between'>
					<div>
						<p className='text-sm text-muted-foreground'>
							{t('clinic.select')}
						</p>
						<h1 className='text-3xl font-semibold text-primary'>
							{isPlatformAdmin ? t('clinic.platformPanel') : t('common.workspace')}
						</h1>
					</div>
					<Button variant='ghost' onClick={logout}>
						{t('action.logout')}
					</Button>
				</div>

				{isFullyLoading ? (
					<div className='flex flex-col items-center justify-center py-12 text-muted-foreground'>
						<Loader2 className='h-8 w-8 animate-spin mb-4 text-primary' />
						<p>{t('clinic.loadingWorkspaces')}</p>
					</div>
				) : (
					<>
						<div className='space-y-8'>
							{individualPractices.length ? (
								<section className='space-y-3'>
									<div>
										<h2 className='text-lg font-semibold text-primary'>
											{t('clinic.myPractice')}
										</h2>
										<p className='text-sm text-muted-foreground'>
											{t('clinic.myPracticeDetail')}
										</p>
									</div>
									<div className='grid gap-6 md:grid-cols-2'>
										{individualPractices.map(renderClinicCard)}
									</div>
								</section>
							) : null}

							{clinicTenants.length ? (
								<section className='space-y-3'>
									<div>
										<h2 className='text-lg font-semibold text-primary'>
											{t('clinic.clinicsTitle')}
										</h2>
										<p className='text-sm text-muted-foreground'>
											{t('clinic.clinicsDetail')}
										</p>
									</div>
									<div className='grid gap-6 md:grid-cols-2'>
										{clinicTenants.map(renderClinicCard)}
									</div>
								</section>
							) : null}
						</div>

						{!clinics?.length && !isFullyLoading ? (
							<div className='mt-8 rounded-xl border border-dashed p-6 text-center text-muted-foreground'>
								{t('clinic.noWorkspaces')}
							</div>
						) : null}
					</>
				)}

				{canCreateIndividualPractice && !isFullyLoading ? (
					<Card className='mt-8 border-primary/10 shadow-lg'>
						<CardHeader>
							<CardTitle className='flex items-center gap-2 text-lg'>
								<Stethoscope className='h-4 w-4' />
								{t('clinic.createIndividual')}
							</CardTitle>
							<CardDescription>{t('clinic.createIndividualDetail')}</CardDescription>
						</CardHeader>
						<CardContent>
							<form
								onSubmit={handlePracticeSubmit((data) =>
									createIndividualPracticeMutation.mutate(data),
								)}
								className='grid gap-4 md:grid-cols-[1fr_auto]'
							>
								<div className='space-y-1'>
									<Label>{t('clinic.practiceName')}</Label>
									<Input
										placeholder={t('clinic.practicePlaceholder')}
										{...registerPractice('name')}
									/>
									{practiceErrors.name && (
										<p className='text-xs text-red-500'>
											{practiceErrors.name.message}
										</p>
									)}
								</div>
								<div className='flex items-end'>
									<Button
										type='submit'
										disabled={createIndividualPracticeMutation.isPending}
									>
										{createIndividualPracticeMutation.isPending
											? t('clinic.creating')
											: t('clinic.createPractice')}
									</Button>
								</div>
							</form>
						</CardContent>
					</Card>
				) : null}

				{isPlatformAdmin && !isFullyLoading ? (
					<Card className='mt-8 border-primary/10 shadow-lg'>
						<CardHeader>
							<CardTitle className='flex items-center gap-2 text-lg'>
								<Hospital className='h-4 w-4' />
								{t('clinic.createClinicAndAdmin')}
							</CardTitle>
							<CardDescription>{t('clinic.createClinicAndAdminDetail')}</CardDescription>
						</CardHeader>
						<CardContent>
							<form
								onSubmit={handleSubmit((data) =>
									createClinicMutation.mutate(data),
								)}
								className='grid gap-4 md:grid-cols-2'
							>
								<div className='space-y-1 md:col-span-2'>
									<Label>{t('clinic.clinicName')}</Label>
									<Input placeholder={t('clinic.clinicPlaceholder')} {...register('name')} />
									{errors.name && (
										<p className='text-xs text-red-500'>
											{errors.name.message}
										</p>
									)}
								</div>
								<div className='space-y-1'>
									<Label>{t('clinic.adminName')}</Label>
									<Input
										placeholder={t('common.fullNamePlaceholder')}
										{...register('adminName')}
									/>
									{errors.adminName && (
										<p className='text-xs text-red-500'>
											{errors.adminName.message}
										</p>
									)}
								</div>
								<div className='space-y-1'>
									<Label>{t('clinic.adminEmail')}</Label>
									<Input
										type='email'
										placeholder={t('common.adminEmailPlaceholder')}
										{...register('adminEmail')}
									/>
									{errors.adminEmail && (
										<p className='text-xs text-red-500'>
											{errors.adminEmail.message}
										</p>
									)}
								</div>
								<div className='space-y-1'>
									<Label>{t('clinic.adminDni')}</Label>
									<Input placeholder={t('common.dniPlaceholder')} {...register('adminDni')} />
									{errors.adminDni && (
										<p className='text-xs text-red-500'>
											{errors.adminDni.message}
										</p>
									)}
								</div>
								<div className='flex items-end md:col-span-2'>
									<Button type='submit' disabled={isSubmitting}>
										{isSubmitting ? t('clinic.creating') : t('clinic.createClinic')}
									</Button>
								</div>
							</form>
						</CardContent>
					</Card>
				) : null}
			</main>
		</AuthGuard>
	);
}

export default function SelectClinicPage() {
	return (
		<Suspense
			fallback={
				<div className='flex justify-center py-20'>
					<Loader2 className='h-8 w-8 animate-spin text-primary' />
				</div>
			}
		>
			<SelectClinicContent />
		</Suspense>
	);
}

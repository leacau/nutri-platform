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

const createClinicSchema = z.object({
	name: z.string().min(2, 'El nombre es obligatorio'),
	adminName: z.string().min(2, 'El nombre es obligatorio'),
	adminEmail: z.string().email('Email inválido'),
	adminDni: z
		.string()
		.min(7, 'El DNI debe tener min 7 dígitos')
		.max(8, 'El DNI debe tener max 8 dígitos')
		.regex(/^\d+$/, 'Solo números'),
});

type CreateClinicForm = z.infer<typeof createClinicSchema>;

const createIndividualPracticeSchema = z.object({
	name: z.string().min(2, 'El nombre es obligatorio'),
});

type CreateIndividualPracticeForm = z.infer<
	typeof createIndividualPracticeSchema
>;

function SelectClinicContent() {
	const qc = useQueryClient();
	const { clinics, me, setActiveClinic, isLoading } = useClinic();
	const { logout, idToken } = useAuth();
	const router = useRouter();
	const searchParams = useSearchParams();
	const { t } = useI18n();
	const next = searchParams.get('next') || '/app/dashboard';

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
		})().catch((e) => console.error('Token debug error:', e));
	}, []);

	const handleSelect = (clinicId: string) => {
		setActiveClinic(clinicId);
		router.push(next);
	};

	const roleLabel = (clinicId: string) => {
		if (isPlatformAdmin) return 'Superusuario';
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
			// Ya no forzamos la redirección ni seteamos la clínica activa aquí,
			// así te quedás en la pantalla viendo tu nueva clínica en la lista.
		},
		onError: () => alert('Error al crear la clínica'),
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
		onError: () => alert('Error al crear el consultorio'),
	});

	// Pequeño hack visual: a veces isLoading es false pero idToken sigue calculándose.
	// Usamos esta variable para asegurarnos de que la carga sea real y completa.
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
							? 'Consultorio individual'
							: 'Clinica'}
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className='flex items-center justify-between'>
				<Badge variant='secondary'>Rol: {roleLabel(clinic.id)}</Badge>
				<Button onClick={() => handleSelect(clinic.id)} variant='default'>
					<CheckCircle2 className='mr-2 h-4 w-4' />
					Ingresar
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
							{isPlatformAdmin ? 'Panel de Plataforma' : 'Espacio activo'}
						</h1>
					</div>
					<Button variant='ghost' onClick={logout}>
						Cerrar sesión
					</Button>
				</div>

				{isFullyLoading ? (
					<div className='flex flex-col items-center justify-center py-12 text-muted-foreground'>
						<Loader2 className='h-8 w-8 animate-spin mb-4 text-primary' />
						<p>Cargando tus espacios disponibles...</p>
					</div>
				) : (
					<>
						<div className='space-y-8'>
							{individualPractices.length ? (
								<section className='space-y-3'>
									<div>
										<h2 className='text-lg font-semibold text-primary'>
											Mi consultorio
										</h2>
										<p className='text-sm text-muted-foreground'>
											Espacio individual para pacientes propios.
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
										<h2 className='text-lg font-semibold text-primary'>Clinicas</h2>
										<p className='text-sm text-muted-foreground'>
											Espacios institucionales donde tenes una membresia.
										</p>
									</div>
									<div className='grid gap-6 md:grid-cols-2'>
										{clinicTenants.map(renderClinicCard)}
									</div>
								</section>
							) : null}
						</div>

						{/* ACÁ ESTÁ EL ARREGLO MAGISTRAL */}
						{/* Solo mostramos el cartel de vacío si YA terminó de cargar y NO hay clínicas */}
						{!clinics?.length && !isFullyLoading ? (
							<div className='mt-8 rounded-xl border border-dashed p-6 text-center text-muted-foreground'>
								No encontramos espacios disponibles para tu usuario.
							</div>
						) : null}
					</>
				)}

				{canCreateIndividualPractice && !isFullyLoading ? (
					<Card className='mt-8 border-primary/10 shadow-lg'>
						<CardHeader>
							<CardTitle className='flex items-center gap-2 text-lg'>
								<Stethoscope className='h-4 w-4' />
								Crear mi consultorio individual
							</CardTitle>
							<CardDescription>
								Usa este espacio para gestionar pacientes propios. Mas adelante
								podes sumar staff sin migrar datos.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form
								onSubmit={handlePracticeSubmit((data) =>
									createIndividualPracticeMutation.mutate(data),
								)}
								className='grid gap-4 md:grid-cols-[1fr_auto]'
							>
								<div className='space-y-1'>
									<Label>Nombre del consultorio</Label>
									<Input
										placeholder='Consultorio Dra. Perez'
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
											? 'Creando...'
											: 'Crear consultorio'}
									</Button>
								</div>
							</form>
						</CardContent>
					</Card>
				) : null}

				{/* El formulario de superadmin se queda igual */}
				{isPlatformAdmin && !isFullyLoading ? (
					<Card className='mt-8 border-primary/10 shadow-lg'>
						<CardHeader>
							<CardTitle className='flex items-center gap-2 text-lg'>
								<Hospital className='h-4 w-4' />
								Crear clínica y admin
							</CardTitle>
							<CardDescription>
								Registrá una nueva clínica y asigná su clinic_admin.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form
								onSubmit={handleSubmit((data) =>
									createClinicMutation.mutate(data),
								)}
								className='grid gap-4 md:grid-cols-2'
							>
								<div className='space-y-1 md:col-span-2'>
									<Label>Nombre de la clínica</Label>
									<Input placeholder='Clínica Central' {...register('name')} />
									{errors.name && (
										<p className='text-xs text-red-500'>
											{errors.name.message}
										</p>
									)}
								</div>
								<div className='space-y-1'>
									<Label>Nombre del admin</Label>
									<Input
										placeholder='Nombre y apellido'
										{...register('adminName')}
									/>
									{errors.adminName && (
										<p className='text-xs text-red-500'>
											{errors.adminName.message}
										</p>
									)}
								</div>
								<div className='space-y-1'>
									<Label>Email del admin</Label>
									<Input
										type='email'
										placeholder='admin@clinica.com'
										{...register('adminEmail')}
									/>
									{errors.adminEmail && (
										<p className='text-xs text-red-500'>
											{errors.adminEmail.message}
										</p>
									)}
								</div>
								<div className='space-y-1'>
									<Label>DNI del admin</Label>
									<Input placeholder='12345678' {...register('adminDni')} />
									{errors.adminDni && (
										<p className='text-xs text-red-500'>
											{errors.adminDni.message}
										</p>
									)}
								</div>
								<div className='flex items-end md:col-span-2'>
									<Button type='submit' disabled={isSubmitting}>
										{isSubmitting ? 'Creando...' : 'Crear clínica'}
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

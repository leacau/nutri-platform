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
import { Clinic, ClinicMembershipRole, UserAccount } from '../../../lib/types';
import { useAuth } from '../../../providers/auth-provider';
import { useClinic } from '../../../providers/clinic-provider';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const createClinicSchema = z.object({
	name: z.string().min(2, 'El nombre es obligatorio'),
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
	uid: z.string().min(1, 'El uid es obligatorio'),
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

function AdminClinicsContent() {
	const { clinics, isLoading, me, setActiveClinic } = useClinic();
	const { idToken, logout } = useAuth();
	const qc = useQueryClient();
	const router = useRouter();
	const isPlatformAdmin = me?.platformRole === 'platform_admin';
	const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
	const [deleteConfirm, setDeleteConfirm] = useState('');

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
		mutationFn: async (data: { clinicId: string; name?: string; isActive?: boolean }) =>
			apiClient.updateClinic(
				data.clinicId,
				{ name: data.name, isActive: data.isActive },
				idToken || undefined,
			),
		onSuccess: refreshAdminClinics,
	});

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
		mutationFn: async (data: AssignMemberForm) =>
			apiClient.addAdminClinicMember(selectedClinicId!, data, idToken || undefined),
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

	if (isLoading || !me) {
		return (
			<div className='flex min-h-screen items-center justify-center text-muted-foreground'>
				<Loader2 className='mr-2 h-5 w-5 animate-spin' />
				Cargando clinicas...
			</div>
		);
	}

	if (!isPlatformAdmin) return null;

	return (
		<main className='mx-auto max-w-7xl px-6 py-8'>
			<div className='mb-6 flex flex-wrap items-center justify-between gap-4'>
				<div>
					<p className='text-sm text-muted-foreground'>Administracion de plataforma</p>
					<h1 className='text-3xl font-semibold text-primary'>Clinicas</h1>
				</div>
				<div className='flex gap-2'>
					<Button variant='outline' onClick={refreshAdminClinics}>
						<RefreshCw className='mr-2 h-4 w-4' />
						Actualizar
					</Button>
					<Button variant='outline' onClick={logout}>
						<LogOut className='mr-2 h-4 w-4' />
						Cerrar sesion
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
														{active ? 'Activa' : 'Inactiva'}
													</Badge>
												</div>
												<p className='truncate text-xs text-muted-foreground'>ID: {clinic.id}</p>
											</div>
										</button>
										<div className='flex flex-wrap justify-end gap-2'>
											<Button size='sm' variant='outline' onClick={() => setSelectedClinicId(clinic.id)}>
												<Pencil className='mr-2 h-4 w-4' />
												Editar
											</Button>
											<Button size='sm' onClick={() => enterClinic(clinic.id)} disabled={!active}>
												<CheckCircle2 className='mr-2 h-4 w-4' />
												Entrar
											</Button>
										</div>
									</CardContent>
								</Card>
							);
						})
					) : (
						<div className='rounded-lg border border-dashed p-8 text-center text-muted-foreground'>
							Todavia no hay clinicas creadas.
						</div>
					)}
				</section>

				<aside className='space-y-6'>
					<Card className='border-primary/10 shadow-sm'>
						<CardHeader>
							<CardTitle className='flex items-center gap-2 text-lg'>
								<Hospital className='h-4 w-4' />
								Crear clinica
							</CardTitle>
							<CardDescription>Alta con clinic_admin inicial.</CardDescription>
						</CardHeader>
						<CardContent>
							<form
								onSubmit={createForm.handleSubmit((data) => createClinicMutation.mutate(data))}
								className='grid gap-3 sm:grid-cols-2'
							>
								<div className='space-y-1 sm:col-span-2'>
									<Label>Nombre de la clinica</Label>
									<Input placeholder='Clinica Central' {...createForm.register('name')} />
								</div>
								<div className='space-y-1'>
									<Label>Admin</Label>
									<Input placeholder='Nombre y apellido' {...createForm.register('adminName')} />
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
									Crear
								</Button>
							</form>
							{createClinicMutation.error ? (
								<p className='mt-3 text-sm text-destructive'>No se pudo crear la clinica.</p>
							) : null}
						</CardContent>
					</Card>

					{selectedClinic ? (
						<Card className='border-primary/10 shadow-sm'>
							<CardHeader>
								<CardTitle className='flex items-center gap-2 text-lg'>
									<Shield className='h-4 w-4' />
									Mantenimiento
								</CardTitle>
								<CardDescription>{selectedClinic.id}</CardDescription>
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
										Guardar
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
										{selectedClinic.isActive === false ? 'Activar' : 'Desactivar'}
									</Button>
									<Button onClick={() => enterClinic(selectedClinic.id)} disabled={selectedClinic.isActive === false}>
										<CheckCircle2 className='mr-2 h-4 w-4' />
										Entrar
									</Button>
								</div>

								<div className='rounded-md border p-3'>
									<div className='mb-3 flex items-center gap-2 font-medium text-primary'>
										<Users className='h-4 w-4' />
										Usuarios asignados
									</div>
									<form
										onSubmit={assignForm.handleSubmit((data) => addMemberMutation.mutate(data))}
										className='mb-3 grid gap-2 sm:grid-cols-[1fr_150px_auto]'
									>
										<Input placeholder='UID de usuario existente' {...assignForm.register('uid')} />
										<Select {...assignForm.register('role')}>
											{roleOptions.map((role) => (
												<option key={role.value} value={role.value}>{role.label}</option>
											))}
										</Select>
										<Button type='submit' disabled={addMemberMutation.isPending}>
											<UserPlus className='mr-2 h-4 w-4' />
											Asignar
										</Button>
									</form>

									{membersQuery.isLoading ? (
										<p className='text-sm text-muted-foreground'>Cargando usuarios...</p>
									) : membersQuery.data?.length ? (
										<div className='space-y-2'>
											{membersQuery.data.map((member) => (
												<div key={member.id} className='grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_145px_auto] sm:items-center'>
													<div className='min-w-0'>
														<p className='truncate text-sm font-medium'>{member.name}</p>
														<p className='truncate text-xs text-muted-foreground'>{member.email} · {member.uid}</p>
													</div>
													<Select
														value={member.role as AdminRole}
														onChange={(event) =>
															updateMemberMutation.mutate({ member, role: event.target.value as AdminRole })
														}
													>
														{roleOptions.map((role) => (
															<option key={role.value} value={role.value}>{role.label}</option>
														))}
													</Select>
													<div className='flex justify-end gap-2'>
														<Button
															size='sm'
															variant='outline'
															onClick={() => updateMemberMutation.mutate({ member, isActive: !member.isActive })}
														>
															{member.isActive === false ? 'Activar' : 'Pausar'}
														</Button>
														<Button size='sm' variant='outline' onClick={() => deleteMemberMutation.mutate(member)}>
															<Trash2 className='h-4 w-4' />
														</Button>
													</div>
												</div>
											))}
										</div>
									) : (
										<p className='text-sm text-muted-foreground'>No hay usuarios asignados.</p>
									)}
								</div>

								<div className='rounded-md border border-destructive/30 p-3'>
									<Label>Archivar clinica</Label>
									<p className='mb-3 text-xs text-muted-foreground'>Escribi ARCHIVAR para desactivar la clinica. La historia clinica y auditoria se conservan por retencion legal.</p>
									<div className='flex gap-2'>
										<Input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} placeholder='ARCHIVAR' />
										<Button
											variant='destructive'
											disabled={deleteConfirm !== 'ARCHIVAR' || deleteClinicMutation.isPending}
											onClick={() => deleteClinicMutation.mutate(selectedClinic.id)}
										>
											<Trash2 className='mr-2 h-4 w-4' />
											Archivar
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

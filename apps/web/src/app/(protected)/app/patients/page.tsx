'use client';

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '../../../../components/ui/card';
import { Filter, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Select } from '../../../../components/ui/select';
import { Textarea } from '../../../../components/ui/textarea';
import { apiClient } from '../../../../lib/api-client';
import { useAuth } from '../../../../providers/auth-provider';
import { useAuthedQuery } from '../../../../hooks/use-authed-query';
import { useClinic } from '../../../../providers/clinic-provider';
import { useForm } from 'react-hook-form';
import { usePermissions } from '../../../../hooks/use-permissions';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

// Schema actualizado con DNI
const patientSchema = z.object({
	name: z.string().min(2, 'El nombre es requerido'),
	dni: z.string().min(6, 'El DNI es requerido (mínimo 6 caracteres)'),
	email: z.string().email().optional().or(z.literal('')),
	phone: z.string().optional().or(z.literal('')),
	sexo: z.enum(['male', 'female', 'other']),
	birthDate: z.string().optional(),
	assignedNutriId: z.string().optional(),
	notes: z.string().optional(),
});

type PatientForm = z.infer<typeof patientSchema>;

export default function PatientsPage() {
	const { activeClinicId } = useClinic();
	const { idToken } = useAuth();
	const perms = usePermissions();
	const qc = useQueryClient();
	const patientsQuery = useAuthedQuery({
		queryKey: ['patients', activeClinicId],
		queryFn: (token, clinicId) => apiClient.patients(clinicId, token),
	});
	const nutrisQuery = useAuthedQuery({
		queryKey: ['nutris', activeClinicId],
		queryFn: (token, clinicId) => apiClient.nutris(clinicId, token),
		enabled: perms.canAssignAnyPatient,
	});

	const [search, setSearch] = useState('');
	const [selectedNutri, setSelectedNutri] = useState('all');

	const mutation = useMutation({
		mutationFn: async (data: PatientForm) => {
			if (!activeClinicId) throw new Error('Sin clínica activa');
			return apiClient.createPatient(
				activeClinicId,
				data,
				idToken ?? undefined
			);
		},
		onSuccess: (data) => {
			// Invalida la lista para que aparezca el nuevo (o reasignado) paciente
			qc.invalidateQueries({ queryKey: ['patients', activeClinicId] });
			reset();
			// Opcional: mostrar toast de éxito o reasignación
		},
	});

	const {
		register,
		handleSubmit,
		reset,
		formState: { isSubmitting, errors },
	} = useForm<PatientForm>({
		resolver: zodResolver(patientSchema),
		defaultValues: { sexo: 'female' },
	});

	const patients = useMemo(() => {
		const list = patientsQuery.data || [];
		return list.filter((patient) => {
			const matchesSearch = patient.name
				.toLowerCase()
				.includes(search.toLowerCase());
			const matchesNutri =
				selectedNutri === 'all' || patient.assignedNutriId === selectedNutri;
			return matchesSearch && matchesNutri;
		});
	}, [patientsQuery.data, search, selectedNutri]);

	return (
		<div className='grid gap-6 lg:grid-cols-[1fr,400px]'>
			<div className='space-y-4'>
				<div className='flex flex-wrap items-center justify-between gap-3'>
					<div>
						<p className='text-sm text-muted-foreground'>
							Gestión de pacientes
						</p>
						<h1 className='text-2xl font-semibold text-primary'>Pacientes</h1>
					</div>
					<Badge variant='secondary'>
						{patientsQuery.data?.length ?? 0} registros
					</Badge>
				</div>

				<div className='flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-sm'>
					<div className='relative w-full md:w-72'>
						<Search className='absolute left-3 top-2.5 h-4 w-4 text-muted-foreground' />
						<Input
							placeholder='Buscar por nombre'
							className='pl-9'
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>
					<div className='flex items-center gap-2'>
						<Filter className='h-4 w-4 text-muted-foreground' />
						<Select
							value={selectedNutri}
							onChange={(e) => setSelectedNutri(e.target.value)}
							className='w-56'
						>
							<option value='all'>Todos los nutris</option>
							{nutrisQuery.data?.map((nutri) => (
								<option key={nutri.id} value={nutri.id}>
									{nutri.name}
								</option>
							))}
						</Select>
					</div>
				</div>

				<Card>
					<CardContent className='divide-y p-0'>
						{patients.map((patient) => (
							<div
								key={patient.id}
								className='flex items-center justify-between gap-4 p-4'
							>
								<div>
									<p className='font-semibold'>{patient.name}</p>
									<p className='text-xs text-muted-foreground'>
										{patient.email || 'sin email'} ·{' '}
										{patient.phone || 'sin teléfono'}
									</p>
									<Badge variant='outline' className='mt-1'>
										Asignado: {patient.assignedNutriId || 'N/D'}
									</Badge>
								</div>
								<Button variant='outline' size='sm' asChild>
									<a href={`/app/patients/${patient.id}`}>Ver ficha</a>
								</Button>
							</div>
						))}
						{!patients.length ? (
							<p className='p-4 text-sm text-muted-foreground'>
								No hay pacientes para los filtros aplicados.
							</p>
						) : null}
					</CardContent>
				</Card>
			</div>

			<Card className='self-start border-primary/10 shadow-lg'>
				<CardHeader>
					<CardTitle className='flex items-center gap-2 text-lg'>
						<Plus className='h-4 w-4' />
						Crear paciente
					</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						className='space-y-3'
						onSubmit={handleSubmit((data) => mutation.mutateAsync(data))}
					>
						{/* CAMPO DNI AGREGADO */}
						<div className='space-y-1'>
							<Label>DNI / Identificación</Label>
							<Input
								placeholder='Número de documento'
								{...register('dni')}
								required
							/>
							{errors.dni && (
								<span className='text-xs text-red-500'>
									{errors.dni.message}
								</span>
							)}
						</div>

						<div className='space-y-1'>
							<Label>Nombre</Label>
							<Input
								placeholder='Nombre y apellido'
								{...register('name')}
								required
							/>
							{errors.name && (
								<span className='text-xs text-red-500'>
									{errors.name.message}
								</span>
							)}
						</div>
						<div className='space-y-1'>
							<Label>Email</Label>
							<Input
								placeholder='paciente@correo.com'
								type='email'
								{...register('email')}
							/>
						</div>
						<div className='space-y-1'>
							<Label>Teléfono</Label>
							<Input placeholder='+54 9 ...' {...register('phone')} />
						</div>
						<div className='space-y-1'>
							<Label>Sexo</Label>
							<Select {...register('sexo')} defaultValue='female'>
								<option value='female'>Femenino</option>
								<option value='male'>Masculino</option>
								<option value='other'>Otro</option>
							</Select>
						</div>
						<div className='space-y-1'>
							<Label>Fecha de nacimiento</Label>
							<Input type='date' {...register('birthDate')} />
						</div>
						{perms.canAssignAnyPatient ? (
							<div className='space-y-1'>
								<Label>Asignar a nutri</Label>
								<Select {...register('assignedNutriId')}>
									<option value=''>Sin asignar</option>
									{nutrisQuery.data?.map((nutri) => (
										<option key={nutri.id} value={nutri.id}>
											{nutri.name}
										</option>
									))}
								</Select>
							</div>
						) : null}
						<div className='space-y-1'>
							<Label>Notas</Label>
							<Textarea
								rows={3}
								placeholder='Notas internas'
								{...register('notes')}
							/>
						</div>
						<Button type='submit' className='w-full' disabled={isSubmitting}>
							<Plus className='mr-2 h-4 w-4' />
							Guardar
						</Button>
						{mutation.error ? (
							<p className='text-sm text-destructive'>
								No pudimos crear el paciente.
							</p>
						) : null}
					</form>
				</CardContent>
			</Card>
		</div>
	);
}

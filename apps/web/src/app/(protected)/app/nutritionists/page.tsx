'use client';

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '../../../../components/ui/card';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { RoleGuard } from '../../../../components/guards';
import { UserAccount } from '../../../../lib/types'; // Import agregado
import { UserPlus2 } from 'lucide-react';
import { apiClient } from '../../../../lib/api-client';
import { useAuth } from '../../../../providers/auth-provider';
import { useAuthedQuery } from '../../../../hooks/use-authed-query';
import { useClinic } from '../../../../providers/clinic-provider';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const inviteSchema = z.object({
	name: z.string().min(2, 'El nombre es obligatorio'),
	email: z.string().email('Email inválido'),
	dni: z
		.string()
		.min(7, 'El DNI debe tener min 7 dígitos')
		.max(8, 'El DNI debe tener max 8 dígitos')
		.regex(/^\d+$/, 'Solo números'),
});

type InviteForm = z.infer<typeof inviteSchema>;

export default function NutritionistsPage() {
	const qc = useQueryClient();
	const { activeClinicId } = useClinic();
	const { idToken } = useAuth();

	const professionalsQuery = useAuthedQuery({
		queryKey: ['professionals', activeClinicId],
		queryFn: (token, clinicId) => apiClient.professionals(clinicId, token),
	});

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		formState: { errors, isSubmitting },
	} = useForm<InviteForm>({
		resolver: zodResolver(inviteSchema),
	});

	const inviteMutation = useMutation({
		mutationFn: async (data: InviteForm) => {
			if (!activeClinicId) return;
			return apiClient.inviteMember(
				activeClinicId,
				{ ...data, role: 'professional' },
				idToken || undefined
			);
		},
		onSuccess: (data: any) => {
			qc.invalidateQueries({ queryKey: ['professionals'] });
			reset();
			alert(data?.message || 'Profesional invitado/creado');
		},
		onError: () => alert('Error al invitar profesional'),
	});

	const handleDniBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
		const val = e.target.value;
		if (val.length < 7) return;
		try {
			const user = await apiClient.lookupUser(val, idToken || undefined);
			if (user) {
				setValue('name', user.name);
				setValue('email', user.email);
				alert(`Usuario encontrado: ${user.name}. Se asignará como profesional.`);
			}
		} catch (e) {
			console.error(e);
		}
	};

	return (
		<RoleGuard allowed={['clinic_admin', 'staff']}>
			<div className='space-y-6'>
				<div>
					<p className='text-sm text-muted-foreground'>
						Gestión de profesionales de la clínica
					</p>
					<h1 className='text-2xl font-semibold text-primary'>
						Profesionales
					</h1>
				</div>

				<div className='grid gap-6 lg:grid-cols-[1.3fr,1fr]'>
					<Card>
						<CardHeader>
							<CardTitle>Equipo de profesionales</CardTitle>
						</CardHeader>
						<CardContent className='divide-y p-0'>
							{professionalsQuery.data?.map((professional: UserAccount) => (
								<div
									key={professional.id}
									className='flex items-center justify-between p-4'
								>
									<div>
										<p className='font-semibold'>{professional.name}</p>
										<p className='text-xs text-muted-foreground'>
											{professional.email}
										</p>
									</div>
									<span className='text-xs text-muted-foreground capitalize'>
										{professional.role}
									</span>
								</div>
							))}
							{!professionalsQuery.data?.length ? (
								<p className='p-4 text-sm text-muted-foreground'>
									No hay profesionales cargados.
								</p>
							) : null}
						</CardContent>
					</Card>

					<Card className='self-start border-primary/10 shadow-lg'>
						<CardHeader>
							<CardTitle className='flex items-center gap-2 text-lg'>
								<UserPlus2 className='h-4 w-4' />
								Invitar profesional
							</CardTitle>
						</CardHeader>
						<CardContent>
							<form
								onSubmit={handleSubmit((d) => inviteMutation.mutate(d))}
								className='space-y-3'
							>
								<div className='space-y-1'>
									<Label>DNI</Label>
									<Input
										placeholder='12345678'
										{...register('dni')}
										onBlur={handleDniBlur}
									/>
									{errors.dni && (
										<p className='text-xs text-red-500'>{errors.dni.message}</p>
									)}
								</div>

								<div className='space-y-1'>
									<Label>Nombre</Label>
									<Input
										value={undefined}
										placeholder='Nombre'
										{...register('name')}
									/>
									{errors.name && (
										<p className='text-xs text-red-500'>
											{errors.name.message}
										</p>
									)}
								</div>
								<div className='space-y-1'>
									<Label>Email</Label>
									<Input
										type='email'
										value={undefined}
										placeholder='profesional@clinica.com'
										{...register('email')}
									/>
									{errors.email && (
										<p className='text-xs text-red-500'>
											{errors.email.message}
										</p>
									)}
								</div>
								<Button
									className='w-full'
									type='submit'
									disabled={isSubmitting}
								>
									Enviar invitación
								</Button>
							</form>
						</CardContent>
					</Card>
				</div>
			</div>
		</RoleGuard>
	);
}

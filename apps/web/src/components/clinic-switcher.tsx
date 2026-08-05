'use client';

import { Building2, ChevronsUpDown, Hospital, Stethoscope } from 'lucide-react';

import { Button } from './ui/button';
import { Select } from './ui/select';
import { useClinic } from '../providers/clinic-provider';
import { useRouter } from 'next/navigation';

export function ClinicSwitcher() {
	const { clinics, activeClinicId, setActiveClinic, me } = useClinic();
	const router = useRouter();

	const isPlatformAdmin = me?.platformRole === 'platform_admin';
	const activeClinic = clinics?.find((clinic) => clinic.id === activeClinicId);

	const handleChange = (id: string) => {
		setActiveClinic(id);
		router.refresh();
	};

	return (
		<div className='flex items-center gap-3'>
			<div className='flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary'>
				{activeClinic?.tenantType === 'individual_practice' ? (
					<Stethoscope className='h-5 w-5' />
				) : activeClinic ? (
					<Hospital className='h-5 w-5' />
				) : (
					<Building2 className='h-5 w-5' />
				)}
			</div>
			<div>
				<p className='text-xs uppercase text-muted-foreground'>
					Espacio activo
				</p>
				<div className='flex items-center gap-2'>
					<Select
						value={activeClinicId || ''}
						onChange={(e) => handleChange(e.target.value)}
						className='min-w-[200px]'
					>
						<option value='' disabled>
							Seleccionar espacio
						</option>
						{clinics?.map((clinic) => {
							const role = isPlatformAdmin
								? 'Superusuario'
								: me?.memberships.find((m) => m.clinicId === clinic.id)?.role;

							return (
								<option key={clinic.id} value={clinic.id}>
									{clinic.name} · {role}
								</option>
							);
						})}
					</Select>
					<Button
						variant='outline'
						size='sm'
						onClick={() => router.push('/select-clinic')}
					>
						<ChevronsUpDown className='mr-2 h-4 w-4' />
						Cambiar
					</Button>
				</div>
			</div>
		</div>
	);
}

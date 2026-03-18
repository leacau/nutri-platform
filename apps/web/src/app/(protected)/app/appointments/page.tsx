'use client';

import { Calendar, CheckCircle2, Clock3, PlusCircle } from 'lucide-react';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '../../../../components/ui/card';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Select } from '../../../../components/ui/select';
import { UserAccount } from '../../../../lib/types';
import { apiClient } from '../../../../lib/api-client';
import { formatDate } from '../../../../lib/utils';
import { useAuth } from '../../../../providers/auth-provider';
import { useAuthedQuery } from '../../../../hooks/use-authed-query';
import { useClinic } from '../../../../providers/clinic-provider';
import { usePermissions } from '../../../../hooks/use-permissions';

// FUNCIÓN ESCUDO: Ataja Firebase Timestamps, objetos Date, o strings
const parseSafeDate = (dateVal: any): Date | null => {
	if (!dateVal) return null;
	if (dateVal instanceof Date) return dateVal;

	// Si es un Timestamp nativo de Firebase en el cliente
	if (typeof dateVal.toDate === 'function') return dateVal.toDate();

	// Si es un Timestamp "crudo" que llega desde el backend (EL SALVAVIDAS)
	if (typeof dateVal === 'object' && '_seconds' in dateVal) {
		return new Date(dateVal._seconds * 1000);
	}

	// Si es un string o número normal
	const parsed = new Date(dateVal);
	return isNaN(parsed.getTime()) ? null : parsed;
};

export default function AppointmentsPage() {
	const qc = useQueryClient();
	const perms = usePermissions();
	const { activeClinicId, activeMembership } = useClinic();
	const { idToken, user } = useAuth();
	const [filterStatus, setFilterStatus] = useState('all');

	const isMeProfessional = activeMembership?.role === 'professional';

	const [newAppointment, setNewAppointment] = useState<{
		id?: string;
		patientId: string;
		professionalUid: string;
		scheduledFor: string;
	}>({
		patientId: '',
		professionalUid: isMeProfessional && user ? user.uid : '',
		scheduledFor: '',
	});

	const resetForm = () => {
		setNewAppointment({
			id: undefined,
			patientId: '',
			professionalUid: isMeProfessional && user ? user.uid : '',
			scheduledFor: '',
		});
	};

	useEffect(() => {
		if (
			isMeProfessional &&
			user?.uid &&
			newAppointment.professionalUid !== user.uid
		) {
			setNewAppointment((prev) => ({ ...prev, professionalUid: user.uid }));
		}
	}, [isMeProfessional, user?.uid]);

	const appointmentsQuery = useAuthedQuery({
		queryKey: ['appointments'],
		queryFn: (token, clinicId) => apiClient.appointments(clinicId, token),
	});
	const patientsQuery = useAuthedQuery({
		queryKey: ['patients'],
		queryFn: (token, clinicId) => apiClient.patients(clinicId, token),
	});
	const professionalsQuery = useAuthedQuery({
		queryKey: ['professionals'],
		queryFn: (token, clinicId) => apiClient.professionals(clinicId, token),
		enabled: perms.canScheduleForOthers || perms.canSeeAllAppointments,
	});

	const scheduleMutation = useMutation({
		mutationFn: async () => {
			if (
				!newAppointment.patientId ||
				!newAppointment.professionalUid ||
				!newAppointment.scheduledFor
			) {
				throw new Error('Faltan datos');
			}

			return apiClient.createAppointment(
				{
					patientId: newAppointment.patientId,
					professionalUid: newAppointment.professionalUid,
					// Guardamos la fecha correcta en formato ISO estándar UTC
					scheduledFor: new Date(newAppointment.scheduledFor).toISOString(),
				},
				activeClinicId || '',
				idToken || undefined,
			);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['appointments'] });
			resetForm();
		},
	});

	const updateMutation = useMutation({
		mutationFn: async () => {
			if (!newAppointment.id || !newAppointment.scheduledFor) {
				throw new Error('Faltan datos para actualizar');
			}

			return apiClient.updateAppointment(
				newAppointment.id,
				activeClinicId || '',
				{
					professionalUid: newAppointment.professionalUid,
					scheduledFor: new Date(newAppointment.scheduledFor).toISOString(),
				},
				idToken || undefined,
			);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['appointments'] });
			resetForm();
		},
	});

	const scheduleExistingMutation = useMutation({
		mutationFn: async (appt: {
			id: string;
			professionalUid: string | null;
		}) => {
			return apiClient.scheduleAppointment(
				{
					id: appt.id,
					professionalUid: appt.professionalUid || user?.uid || '',
					scheduledFor: new Date(
						newAppointment.scheduledFor || Date.now(),
					).toISOString(),
				},
				activeClinicId || '',
				idToken || undefined,
			);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['appointments'] });
		},
	});

	const completeMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.completeAppointment(
				id,
				activeClinicId || '',
				idToken || undefined,
			),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
	});

	const cancelMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.cancelAppointment(
				id,
				activeClinicId || '',
				idToken || undefined,
			),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
	});

	const appointments = useMemo(() => {
		const list = appointmentsQuery.data || [];
		if (filterStatus === 'all') return list;
		return list.filter((appt) => appt.status === filterStatus);
	}, [appointmentsQuery.data, filterStatus]);

	const isSubmitting = scheduleMutation.isPending || updateMutation.isPending;

	return (
		<div className='space-y-6'>
			<div className='flex flex-wrap items-center justify-between gap-3'>
				<div>
					<p className='text-sm text-muted-foreground'>Vista semanal</p>
					<h1 className='text-2xl font-semibold text-primary'>Turnos</h1>
				</div>
				<div className='flex items-center gap-2'>
					<Badge variant='outline'>
						Total: {appointmentsQuery.data?.length ?? 0}
					</Badge>
					<Select
						value={filterStatus}
						onChange={(e) => setFilterStatus(e.target.value)}
						className='w-44'
					>
						<option value='all'>Todos</option>
						<option value='requested'>Pendientes</option>
						<option value='scheduled'>Programados</option>
						<option value='cancelled'>Cancelados</option>
					</Select>
				</div>
			</div>

			<div className='grid gap-6 lg:grid-cols-[1.4fr,1fr]'>
				<Card>
					<CardHeader className='flex items-center justify-between'>
						<CardTitle className='flex items-center gap-2 text-lg'>
							<Calendar className='h-4 w-4 text-primary' />
							Agenda
						</CardTitle>
						<Badge variant='secondary'>Vista rápida</Badge>
					</CardHeader>
					<CardContent className='space-y-3'>
						{appointments.map((appt) => {
							const safeDate = parseSafeDate(appt.scheduledFor);
							return (
								<div
									key={appt.id}
									className='flex items-center justify-between rounded-xl border p-3'
								>
									<div>
										<p className='font-semibold'>
											{patientsQuery.data?.find((p) => p.id === appt.patientId)
												?.name || `Paciente ${appt.patientId}`}
										</p>
										<p className='text-xs text-muted-foreground'>
											Profesional:{' '}
											{professionalsQuery.data?.find(
												(p: UserAccount) => p.id === appt.professionalUid,
											)?.name ||
												appt.professionalUid ||
												'N/A'}
										</p>
										<Badge
											variant={
												appt.status === 'requested'
													? 'warning'
													: appt.status === 'cancelled'
														? 'outline'
														: 'secondary'
											}
											className='mt-1'
										>
											{appt.status}
										</Badge>
									</div>
									<div className='text-right'>
										<p className='text-sm font-semibold'>
											{/* Usamos el safeDate para formatear sin que explote */}
											{safeDate
												? formatDate(safeDate.toISOString())
												: 'Por programar'}
										</p>
										<div className='mt-2 flex justify-end gap-2'>
											{appt.status === 'scheduled' ? (
												<Button
													size='sm'
													variant='secondary'
													onClick={() => {
														// Convertimos la fecha segura a formato local para el input datetime-local (YYYY-MM-DDThh:mm)
														let localDateTime = '';
														if (safeDate) {
															const offset =
																safeDate.getTimezoneOffset() * 60000;
															localDateTime = new Date(
																safeDate.getTime() - offset,
															)
																.toISOString()
																.slice(0, 16);
														}

														setNewAppointment({
															id: appt.id,
															patientId: appt.patientId,
															professionalUid: appt.professionalUid || '',
															scheduledFor: localDateTime,
														});
														window.scrollTo({ top: 0, behavior: 'smooth' });
													}}
												>
													Modificar
												</Button>
											) : null}

											{appt.status === 'scheduled' ? (
												<Button
													size='sm'
													variant='default'
													className='bg-emerald-600 hover:bg-emerald-700 text-white'
													onClick={() => completeMutation.mutate(appt.id)}
													disabled={completeMutation.isPending}
												>
													<CheckCircle2 className='mr-1.5 h-4 w-4' />
													Atendido
												</Button>
											) : null}

											{appt.status !== 'cancelled' ? (
												<Button
													size='sm'
													variant='ghost'
													onClick={() => cancelMutation.mutate(appt.id)}
												>
													Cancelar
												</Button>
											) : null}

											{appt.status === 'requested' &&
											(perms.canScheduleForOthers || isMeProfessional) ? (
												<Button
													size='sm'
													variant='secondary'
													onClick={() =>
														scheduleExistingMutation.mutate(appt as any)
													}
													disabled={scheduleExistingMutation.isPending}
												>
													Programar ahora
												</Button>
											) : null}
										</div>
									</div>
								</div>
							);
						})}
						{!appointments.length ? (
							<p className='text-sm text-muted-foreground'>
								No hay turnos para el filtro.
							</p>
						) : null}
					</CardContent>
				</Card>

				<Card className='self-start border-primary/10 shadow-lg'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2 text-lg'>
							<PlusCircle className='h-4 w-4' />
							{newAppointment.id ? 'Modificar turno' : 'Programar turno'}
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-3'>
						<div className='space-y-1'>
							<Label>Paciente</Label>
							<Select
								value={newAppointment.patientId}
								disabled={!!newAppointment.id}
								onChange={(e) =>
									setNewAppointment({
										...newAppointment,
										patientId: e.target.value,
									})
								}
							>
								<option value=''>Elegí paciente</option>
								{patientsQuery.data?.map((patient) => (
									<option key={patient.id} value={patient.id}>
										{patient.name}
									</option>
								))}
							</Select>
						</div>
						<div className='space-y-1'>
							<Label>Profesional</Label>
							<Select
								value={newAppointment.professionalUid}
								onChange={(e) =>
									setNewAppointment({
										...newAppointment,
										professionalUid: e.target.value,
									})
								}
								disabled={isMeProfessional}
							>
								<option value=''>Elegí profesional</option>
								{isMeProfessional && user ? (
									<option value={user.uid}>Yo</option>
								) : (
									professionalsQuery.data?.map((professional: UserAccount) => (
										<option key={professional.id} value={professional.id}>
											{professional.name}
										</option>
									))
								)}
							</Select>
						</div>
						<div className='space-y-1'>
							<Label>Fecha y hora</Label>
							<Input
								type='datetime-local'
								value={newAppointment.scheduledFor}
								onChange={(e) =>
									setNewAppointment({
										...newAppointment,
										scheduledFor: e.target.value,
									})
								}
							/>
						</div>
						<Button
							className='w-full'
							onClick={() =>
								newAppointment.id
									? updateMutation.mutate()
									: scheduleMutation.mutate()
							}
							disabled={
								isSubmitting ||
								(!perms.canScheduleForOthers && !isMeProfessional)
							}
						>
							<Clock3 className='mr-2 h-4 w-4' />
							{newAppointment.id ? 'Guardar cambios' : 'Guardar turno'}
						</Button>

						{newAppointment.id && (
							<Button
								variant='ghost'
								onClick={resetForm}
								className='mt-2 w-full'
							>
								Cancelar edición
							</Button>
						)}

						{!perms.canScheduleForOthers && !isMeProfessional ? (
							<p className='text-xs text-muted-foreground'>
								No tenés permisos para agendar turnos.
							</p>
						) : null}
						{scheduleMutation.error || updateMutation.error ? (
							<p className='text-sm text-destructive'>
								No pudimos procesar el turno.
							</p>
						) : null}
						{cancelMutation.error ? (
							<p className='text-sm text-destructive'>Error al cancelar.</p>
						) : null}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

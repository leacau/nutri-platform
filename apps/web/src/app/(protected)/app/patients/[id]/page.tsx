'use client';

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '../../../../../components/ui/card';
import { CheckCircle2, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { NewRecordDialog } from './components/new-record-dialog';
import { RecordTimeline } from './components/record-timeline';
import { apiClient } from '../../../../../lib/api-client';
import { formatDate } from '../../../../../lib/utils';
import { useAuth } from '../../../../../providers/auth-provider';
import { useAuthedQuery } from '../../../../../hooks/use-authed-query';
import { useClinic } from '../../../../../providers/clinic-provider';
import { useParams } from 'next/navigation';

// Función escudo para fechas (igual a la que usamos en el Dashboard)
const parseSafeDate = (dateVal: any): Date | null => {
	if (!dateVal) return null;
	if (dateVal instanceof Date) return dateVal;
	if (typeof dateVal.toDate === 'function') return dateVal.toDate();
	if (typeof dateVal === 'object' && '_seconds' in dateVal)
		return new Date(dateVal._seconds * 1000);
	const parsed = new Date(dateVal);
	return isNaN(parsed.getTime()) ? null : parsed;
};

const isSameDay = (apptDateVal: any, todayStr: string) => {
	const d = parseSafeDate(apptDateVal);
	if (!d) return false;
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}` === todayStr;
};

export default function PatientDetailPage() {
	const params = useParams<{ id: string }>();
	const { idToken, user } = useAuth();
	const { activeClinicId } = useClinic();
	const qc = useQueryClient();

	// Estado para la fecha de hoy (evita error de hidratación)
	const [isMounted, setIsMounted] = useState(false);
	const [todayDateString, setTodayDateString] = useState('');

	useEffect(() => {
		setIsMounted(true);
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		setTodayDateString(`${year}-${month}-${day}`);
	}, []);

	// 1. Traemos los datos del paciente
	const patientQuery = useAuthedQuery({
		queryKey: ['patient', params.id],
		queryFn: (token, clinicId) => apiClient.patient(params.id, clinicId, token),
	});

	// 2. Traemos los turnos
	const appointmentsQuery = useAuthedQuery({
		queryKey: ['patient-appointments', params.id],
		queryFn: (token, clinicId) => apiClient.appointments(clinicId, token),
	});

	// 3. Traemos el historial clínico (El Muro)
	const recordsQuery = useAuthedQuery({
		queryKey: ['clinical-records', params.id],
		queryFn: (token, clinicId) =>
			apiClient.getClinicalRecords(params.id, clinicId, token),
	});

	// Mutación para completar el turno directamente desde la ficha
	const completeMutation = useMutation({
		mutationFn: async (apptId: string) =>
			apiClient.completeAppointment(
				apptId,
				activeClinicId || '',
				idToken || undefined,
			),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['patient-appointments', params.id] });
			// También invalidamos los turnos globales para que el Dashboard se entere
			qc.invalidateQueries({ queryKey: ['appointments'] });
		},
	});

	const patient = patientQuery.data;

	// Todos los turnos de este paciente
	const appointments = (appointmentsQuery.data || []).filter(
		(appt) => appt.patientId === params.id,
	);

	// Buscamos si el paciente tiene un turno ACTIVO para EL DÍA DE HOY (programado o en sala de espera)
	const activeAppointmentToday = isMounted
		? appointments.find(
				(appt) =>
					(appt.status === 'scheduled' || appt.status === 'arrived') &&
					isSameDay(appt.scheduledFor, todayDateString),
			)
		: null;

	const records = recordsQuery.data || [];

	if (patientQuery.isLoading || !isMounted) {
		return <p className='text-sm text-muted-foreground'>Cargando ficha...</p>;
	}

	if (!patient) {
		return (
			<p className='text-sm text-destructive'>
				No encontramos este paciente en la clínica activa.
			</p>
		);
	}

	return (
		<div className='space-y-6'>
			{/* Cabecera del Paciente */}
			<div className='flex flex-wrap items-center justify-between gap-3 bg-white p-6 rounded-xl border shadow-sm'>
				<div>
					<div className='flex items-center gap-3'>
						<h1 className='text-3xl font-bold text-slate-900 tracking-tight'>
							{patient.name}
						</h1>
						{/* BOTÓN INTELIGENTE: Solo aparece si hay turno hoy */}
						{activeAppointmentToday && (
							<Button
								size='sm'
								className='bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm ml-2'
								onClick={() =>
									completeMutation.mutate(activeAppointmentToday.id)
								}
								disabled={completeMutation.isPending}
							>
								<CheckCircle2 className='mr-2 h-4 w-4' />
								{completeMutation.isPending
									? 'Finalizando...'
									: 'Finalizar Turno Actual'}
							</Button>
						)}
					</div>
					<div className='flex items-center gap-3 mt-2'>
						<p className='text-sm text-slate-500 font-medium'>
							{patient.email || 'Sin email registrado'}
						</p>
						<span className='text-slate-300'>•</span>
						<Badge
							variant='secondary'
							className='text-xs font-normal bg-slate-100 text-slate-600'
						>
							Asignado a:{' '}
							{patient.assignedProfessionalUids?.join(', ') ??
								'Clínica General'}
						</Badge>
					</div>
				</div>
			</div>

			{/* Contenedor Principal: 2 Columnas */}
			<div className='grid grid-cols-1 items-start gap-6 lg:grid-cols-[350px_1fr]'>
				{/* COLUMNA IZQUIERDA: Datos Estáticos del Paciente */}
				<div className='space-y-6'>
					<Card className='shadow-sm border-slate-200'>
						<CardHeader className='bg-slate-50/50 border-b border-slate-100 pb-4'>
							<CardTitle className='text-lg'>Datos personales</CardTitle>
						</CardHeader>
						<CardContent className='space-y-4 pt-4'>
							<div>
								<p className='text-xs text-muted-foreground uppercase tracking-wider font-semibold'>
									DNI
								</p>
								<p className='font-medium text-slate-900'>
									{(patient as any).dni || '—'}
								</p>
							</div>
							<div>
								<p className='text-xs text-muted-foreground uppercase tracking-wider font-semibold'>
									Teléfono
								</p>
								<p className='font-medium text-slate-900'>
									{patient.phone || '—'}
								</p>
							</div>
							<div>
								<p className='text-xs text-muted-foreground uppercase tracking-wider font-semibold'>
									Sexo
								</p>
								<p className='font-medium capitalize text-slate-900'>
									{patient.sexo}
								</p>
							</div>
							<div>
								<p className='text-xs text-muted-foreground uppercase tracking-wider font-semibold'>
									Fecha de nacimiento
								</p>
								<p className='font-medium text-slate-900'>
									{patient.birthDate ? formatDate(patient.birthDate) : '—'}
								</p>
							</div>
							{patient.notes && (
								<div className='pt-2 border-t border-slate-100'>
									<p className='text-xs text-muted-foreground uppercase tracking-wider font-semibold'>
										Notas de admisión
									</p>
									<p className='text-sm mt-1 whitespace-pre-line text-slate-700 bg-amber-50 p-3 rounded-lg border border-amber-100'>
										{patient.notes}
									</p>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Tarjeta de Turnos Históricos */}
					<Card className='shadow-sm border-slate-200'>
						<CardHeader className='bg-slate-50/50 border-b border-slate-100 pb-4'>
							<CardTitle className='text-lg'>Historial de Turnos</CardTitle>
						</CardHeader>
						<CardContent className='space-y-3 pt-4 max-h-[300px] overflow-y-auto pr-2'>
							{appointments.map((appt) => {
								const safeDate = parseSafeDate(appt.scheduledFor);
								return (
									<div
										key={appt.id}
										className='flex items-center justify-between rounded-lg border border-slate-100 p-3 hover:bg-slate-50 transition-colors'
									>
										<div>
											<Badge
												variant={
													appt.status === 'completed'
														? 'default'
														: appt.status === 'cancelled'
															? 'outline'
															: 'secondary'
												}
												className='mb-1'
											>
												{appt.status}
											</Badge>
											<p className='text-xs text-muted-foreground'>
												Prof: {appt.professionalUid}
											</p>
										</div>
										<div className='text-right'>
											<p className='text-sm font-semibold text-slate-700'>
												{safeDate ? formatDate(safeDate.toISOString()) : '—'}
											</p>
										</div>
									</div>
								);
							})}
							{!appointments.length ? (
								<p className='text-sm text-center text-muted-foreground py-4'>
									El paciente no tiene turnos registrados.
								</p>
							) : null}
						</CardContent>
					</Card>
				</div>

				{/* COLUMNA DERECHA: El Muro de Historia Clínica */}
				<div className='space-y-4'>
					<div className='flex items-center justify-between bg-white p-4 rounded-xl border shadow-sm border-slate-200'>
						<div>
							<h2 className='text-xl font-semibold text-slate-900'>
								Evolución Clínica
							</h2>
							<p className='text-sm text-slate-500'>
								{records.length} registros en total
							</p>
						</div>

						{/* Llamamos al Modal que creamos arriba */}
						<NewRecordDialog patientId={patient.id} />
					</div>

					{/* Contenedor del Timeline */}
					{recordsQuery.isLoading ? (
						<p className='text-sm text-muted-foreground py-4'>
							Cargando historial...
						</p>
					) : records.length === 0 ? (
						<Card className='border-dashed border-2 bg-slate-50/50 shadow-none border-slate-200'>
							<CardContent className='flex flex-col items-center justify-center py-16 text-center'>
								<div className='bg-white p-4 rounded-full shadow-sm mb-4 border border-slate-100'>
									<FileText className='h-8 w-8 text-slate-300' />
								</div>
								<p className='text-lg font-medium text-slate-700'>
									Sin registros clínicos
								</p>
								<p className='text-sm text-slate-500 max-w-[400px] mt-2'>
									Todavía no hay notas, mediciones ni estudios para este
									paciente. Presioná "Nuevo Registro" para comenzar la atención.
								</p>
							</CardContent>
						</Card>
					) : (
						<RecordTimeline records={records} patient={patient} />
					)}
				</div>
			</div>
		</div>
	);
}

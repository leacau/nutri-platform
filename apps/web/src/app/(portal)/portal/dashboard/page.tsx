'use client';

import { CalendarClock, HeartPulse, NotebookText } from 'lucide-react';
import { useMemo } from 'react';

import { Badge } from '../../../../components/ui/badge';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '../../../../components/ui/card';
import { RecordTimeline } from '../../../(protected)/app/patients/[id]/components/record-timeline';
import { apiClient } from '../../../../lib/api-client';
import { formatDate } from '../../../../lib/utils';
import { useAuthedQuery } from '../../../../hooks/use-authed-query';
import { useClinic } from '../../../../providers/clinic-provider';

const parseSafeDate = (dateVal: any): Date | null => {
	if (!dateVal) return null;
	if (dateVal instanceof Date) return dateVal;
	if (typeof dateVal.toDate === 'function') return dateVal.toDate();
	if (typeof dateVal === 'object' && '_seconds' in dateVal) {
		return new Date(dateVal._seconds * 1000);
	}
	if (typeof dateVal === 'object' && 'seconds' in dateVal) {
		return new Date(dateVal.seconds * 1000);
	}
	const parsed = new Date(dateVal);
	return isNaN(parsed.getTime()) ? null : parsed;
};

const formatSafeDate = (dateVal: any, fallback = 'Sin fecha') => {
	const date = parseSafeDate(dateVal);
	return date ? formatDate(date.toISOString()) : fallback;
};

export default function PortalDashboardPage() {
	const { activeMembership } = useClinic();
	const patientId = activeMembership?.patientId;

	const patientQuery = useAuthedQuery({
		queryKey: ['portal-patient', patientId],
		queryFn: (token, clinicId) => apiClient.patient(patientId!, clinicId, token),
		enabled: Boolean(patientId),
	});

	const appointmentsQuery = useAuthedQuery({
		queryKey: ['portal-appointments'],
		queryFn: (token, clinicId) => apiClient.appointments(clinicId, token),
		enabled: Boolean(patientId),
	});

	const recordsQuery = useAuthedQuery({
		queryKey: ['portal-clinical-records', patientId],
		queryFn: (token, clinicId) =>
			apiClient.getClinicalRecords(patientId!, clinicId, token),
		enabled: Boolean(patientId),
		retry: false,
	});

	const patient = patientQuery.data;

	const myAppointments = useMemo(() => {
		const all = appointmentsQuery.data || [];
		return all
			.filter((appt) => appt.patientId === patientId)
			.sort(
				(a, b) =>
					(parseSafeDate(b.scheduledFor || b.requestedAt)?.getTime() || 0) -
					(parseSafeDate(a.scheduledFor || a.requestedAt)?.getTime() || 0),
			);
	}, [appointmentsQuery.data, patientId]);

	const nextAppointment = useMemo(() => {
		const now = Date.now();
		return myAppointments
			.filter((appt) => appt.status === 'scheduled' && appt.scheduledFor)
			.map((appt) => ({ appt, date: parseSafeDate(appt.scheduledFor) }))
			.filter((item) => item.date && item.date.getTime() >= now)
			.sort((a, b) => a.date!.getTime() - b.date!.getTime())[0]?.appt;
	}, [myAppointments]);

	const records = recordsQuery.data || [];
	const recordsBlocked =
		recordsQuery.isError || patient?.medicalRecordAccessEnabled === false;

	return (
		<div className='space-y-6'>
			<div className='grid gap-6 md:grid-cols-2'>
				<Card className='border-primary/10 shadow-lg'>
					<CardHeader className='flex items-center justify-between'>
						<CardTitle className='flex items-center gap-2 text-lg'>
							<HeartPulse className='h-4 w-4' />
							Próximo turno
						</CardTitle>
						<Badge variant='secondary'>Paciente</Badge>
					</CardHeader>
					<CardContent>
						{nextAppointment ? (
							<div className='space-y-2'>
								<p className='text-sm text-muted-foreground'>Fecha</p>
								<p className='text-xl font-semibold'>
									{formatSafeDate(nextAppointment.scheduledFor)}
								</p>
								<p className='text-sm text-muted-foreground'>
									Profesional asignado: {nextAppointment.professionalUid}
								</p>
							</div>
						) : (
							<p className='text-sm text-muted-foreground'>
								No tenés turnos programados.
							</p>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='flex items-center justify-between'>
						<CardTitle className='flex items-center gap-2 text-lg'>
							<NotebookText className='h-4 w-4' />
							Tu perfil
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-2'>
						<p className='text-sm'>Nombre: {patient?.name ?? '—'}</p>
						<p className='text-sm'>Email: {patient?.email ?? '—'}</p>
						<p className='text-sm'>
							Profesionales:{' '}
							{patient?.assignedProfessionalUids?.join(', ') ?? '—'}
						</p>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2 text-lg'>
						<CalendarClock className='h-4 w-4' />
						Historial de turnos
					</CardTitle>
				</CardHeader>
				<CardContent className='space-y-3'>
					{myAppointments.map((appt) => (
						<div
							key={appt.id}
							className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'
						>
							<div>
								<Badge variant={appt.status === 'cancelled' ? 'outline' : 'secondary'}>
									{appt.status}
								</Badge>
								<p className='mt-1 text-xs text-muted-foreground'>
									Profesional: {appt.professionalUid || 'A definir'}
								</p>
							</div>
							<p className='text-sm font-semibold'>
								{formatSafeDate(appt.scheduledFor || appt.requestedAt)}
							</p>
						</div>
					))}
					{!myAppointments.length ? (
						<p className='text-sm text-muted-foreground'>
							Todavía no tenés turnos registrados.
						</p>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2 text-lg'>
						<NotebookText className='h-4 w-4' />
						Historia clínica
					</CardTitle>
				</CardHeader>
				<CardContent>
					{recordsBlocked ? (
						<p className='text-sm text-muted-foreground'>
							La clínica todavía no habilitó la visualización de tu historia
							clínica.
						</p>
					) : records.length ? (
						<RecordTimeline records={records} patient={patient} readOnly />
					) : (
						<p className='text-sm text-muted-foreground'>
							Todavía no hay registros visibles.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

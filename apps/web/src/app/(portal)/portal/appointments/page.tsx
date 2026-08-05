'use client';

import { CalendarPlus, XCircle } from 'lucide-react';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '../../../../components/ui/card';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Select } from '../../../../components/ui/select';
import { apiClient } from '../../../../lib/api-client';
import { formatDate } from '../../../../lib/utils';
import { useAuth } from '../../../../providers/auth-provider';
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

const formatSafeDate = (dateVal: any, fallback = 'Esperando fecha') => {
	const date = parseSafeDate(dateVal);
	return date ? formatDate(date.toISOString()) : fallback;
};

export default function PortalAppointmentsPage() {
	const qc = useQueryClient();
	const { activeClinicId, activeMembership } = useClinic();
	const patientId = activeMembership?.patientId;
	const appointmentsQuery = useAuthedQuery({
		queryKey: ['portal-appointments'],
		queryFn: (token, clinicId) => apiClient.appointments(clinicId, token),
	});
	const patientsQuery = useAuthedQuery({
		queryKey: ['portal-patient', patientId],
		queryFn: (token, clinicId) =>
			apiClient.patient(patientId!, clinicId, token),
		enabled: Boolean(patientId),
	});
	const professionalsQuery = useAuthedQuery({
		queryKey: ['portal-professionals'],
		queryFn: (token, clinicId) => apiClient.professionals(clinicId, token),
	});

	const [request, setRequest] = useState({
		professionalUid: '',
		preferredDate: '',
	});

	const resolvedPatientId = patientsQuery.data?.id ?? patientId;
	const { idToken } = useAuth();

	const myAppointments = useMemo(() => {
		const all = appointmentsQuery.data || [];
		return all
			.filter((appt) => appt.patientId === resolvedPatientId)
			.sort(
				(a, b) =>
					(parseSafeDate(b.scheduledFor || b.requestedAt)?.getTime() || 0) -
					(parseSafeDate(a.scheduledFor || a.requestedAt)?.getTime() || 0),
			);
	}, [appointmentsQuery.data, resolvedPatientId]);

	const requestMutation = useMutation({
		mutationFn: async () => {
			if (!resolvedPatientId) throw new Error('Sin paciente vinculado');
			return apiClient.requestAppointment(
				{
					professionalUid: request.professionalUid || undefined,
				},
				activeClinicId || '',
				idToken || undefined,
			);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['portal-appointments'] });
			setRequest({ professionalUid: '', preferredDate: '' });
		},
	});

	const cancelMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.cancelAppointment(
				id,
				activeClinicId || '',
				idToken || undefined,
			),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ['portal-appointments'] }),
	});

	return (
		<div className='space-y-6'>
			<div>
				<p className='text-sm text-muted-foreground'>Portal paciente</p>
				<h1 className='text-2xl font-semibold text-primary'>Turnos</h1>
			</div>

			<Card className='border-primary/10 shadow-lg'>
				<CardHeader className='flex items-center justify-between'>
					<CardTitle className='flex items-center gap-2 text-lg'>
						<CalendarPlus className='h-4 w-4' />
						Solicitar turno
					</CardTitle>
					<Badge variant='secondary'>Idempotente</Badge>
				</CardHeader>
				<CardContent className='grid gap-4 sm:grid-cols-3'>
					<div className='space-y-1'>
						<Label>Profesional</Label>
						<Select
							value={request.professionalUid}
							onChange={(e) =>
								setRequest((prev) => ({
									...prev,
									professionalUid: e.target.value,
								}))
							}
						>
							<option value=''>Cualquiera</option>
							{professionalsQuery.data?.map((professional: any) => (
								<option
									key={professional.id}
									value={professional.uid || professional.id}
								>
									{professional.name}
								</option>
							))}
						</Select>
					</div>
					<div className='space-y-1'>
						<Label>Fecha preferida</Label>
						<Input
							type='date'
							value={request.preferredDate}
							onChange={(e) =>
								setRequest((prev) => ({
									...prev,
									preferredDate: e.target.value,
								}))
							}
						/>
					</div>
					<div className='flex items-end'>
						<Button
							className='w-full'
							onClick={() => requestMutation.mutate()}
							disabled={requestMutation.isPending}
						>
							Enviar solicitud
						</Button>
					</div>
					{requestMutation.error ? (
						<p className='text-sm text-destructive'>
							No pudimos enviar la solicitud.
						</p>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Mis turnos</CardTitle>
				</CardHeader>
				<CardContent className='space-y-3'>
					{myAppointments.map((appt) => (
						<div
							key={appt.id}
							className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3'
						>
							<div>
								<p className='font-semibold capitalize'>{appt.status}</p>
								<p className='text-xs text-muted-foreground'>
									Profesional: {appt.professionalUid}
								</p>
							</div>
							<div className='text-right'>
								<p className='text-sm font-semibold'>
									{formatSafeDate(appt.scheduledFor || appt.requestedAt)}
								</p>
								<div className='mt-2 flex justify-end gap-2'>
									{appt.status !== 'cancelled' ? (
										<Button
											size='sm'
											variant='ghost'
											onClick={() => cancelMutation.mutate(appt.id)}
										>
											<XCircle className='mr-1 h-4 w-4' />
											Cancelar
										</Button>
									) : null}
								</div>
							</div>
						</div>
					))}
					{!myAppointments.length ? (
						<p className='text-sm text-muted-foreground'>
							Todavía no solicitaste turnos.
						</p>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}

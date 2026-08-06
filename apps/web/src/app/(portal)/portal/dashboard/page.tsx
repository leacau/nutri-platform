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
import { UserAccount } from '../../../../lib/types';
import { apiClient } from '../../../../lib/api-client';
import { formatDate } from '../../../../lib/utils';
import { useAuthedQuery } from '../../../../hooks/use-authed-query';
import { useClinic } from '../../../../providers/clinic-provider';
import { useI18n } from '../../../../providers/i18n-provider';

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

const formatSafeDate = (dateVal: any, fallback: string) => {
	const date = parseSafeDate(dateVal);
	return date ? formatDate(date.toISOString()) : fallback;
};

const accountUid = (account: UserAccount) => account.uid || account.id;

export default function PortalDashboardPage() {
	const { activeMembership } = useClinic();
	const { t } = useI18n();
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
	const professionalsQuery = useAuthedQuery({
		queryKey: ['portal-professionals'],
		queryFn: (token, clinicId) => apiClient.professionals(clinicId, token),
		enabled: Boolean(patientId),
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
	const professionalNameByUid = (uid?: string | null) => {
		if (!uid) return t('common.noProfessional');
		return (
			professionalsQuery.data?.find(
				(professional: UserAccount) => accountUid(professional) === uid,
			)?.name ?? t('common.workspaceProfessional')
		);
	};
	const assignedProfessionalNames = (patient?.assignedProfessionalUids ?? [])
		.map(professionalNameByUid)
		.join(', ');

	return (
		<div className='space-y-6'>
			<div className='grid gap-6 md:grid-cols-2'>
				<Card className='border-primary/10 shadow-lg'>
					<CardHeader className='flex items-center justify-between'>
						<CardTitle className='flex items-center gap-2 text-lg'>
							<HeartPulse className='h-4 w-4' />
							{t('portal.nextAppointment')}
						</CardTitle>
						<Badge variant='secondary'>{t('role.patient')}</Badge>
					</CardHeader>
					<CardContent>
						{nextAppointment ? (
							<div className='space-y-2'>
								<p className='text-sm text-muted-foreground'>{t('common.date')}</p>
								<p className='text-xl font-semibold'>
									{formatSafeDate(nextAppointment.scheduledFor, t('common.noDate'))}
								</p>
								<p className='text-sm text-muted-foreground'>
									{t('portal.assignedProfessional', {
										name: professionalNameByUid(nextAppointment.professionalUid),
									})}
								</p>
							</div>
						) : (
							<p className='text-sm text-muted-foreground'>
								{t('portal.noScheduledAppointments')}
							</p>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='flex items-center justify-between'>
						<CardTitle className='flex items-center gap-2 text-lg'>
							<NotebookText className='h-4 w-4' />
							{t('portal.yourProfile')}
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-2'>
						<p className='text-sm'>{t('common.name')}: {patient?.name ?? '—'}</p>
						<p className='text-sm'>Email: {patient?.email ?? '—'}</p>
						<p className='text-sm'>
							{t('nav.nutritionists')}: {assignedProfessionalNames || '—'}
						</p>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2 text-lg'>
						<CalendarClock className='h-4 w-4' />
						{t('portal.appointmentHistory')}
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
									{t(`status.${appt.status}`)}
								</Badge>
								<p className='mt-1 text-xs text-muted-foreground'>
									{t('role.professional')}: {professionalNameByUid(appt.professionalUid)}
								</p>
							</div>
							<p className='text-sm font-semibold'>
								{formatSafeDate(appt.scheduledFor || appt.requestedAt, t('common.noDate'))}
							</p>
						</div>
					))}
					{!myAppointments.length ? (
						<p className='text-sm text-muted-foreground'>
							{t('portal.noAppointmentHistory')}
						</p>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2 text-lg'>
						<NotebookText className='h-4 w-4' />
						{t('portal.medicalHistory')}
					</CardTitle>
				</CardHeader>
				<CardContent>
					{recordsBlocked ? (
						<p className='text-sm text-muted-foreground'>
							{t('portal.historyNotEnabled')}
						</p>
					) : records.length ? (
						<RecordTimeline
							records={records}
							patient={patient}
							readOnly
							professionalNameByUid={professionalNameByUid}
						/>
					) : (
						<p className='text-sm text-muted-foreground'>
							{t('portal.noVisibleRecords')}
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

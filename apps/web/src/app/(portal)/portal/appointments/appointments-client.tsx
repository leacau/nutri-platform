'use client';

import { CalendarPlus, ChevronLeft, ChevronRight, XCircle } from 'lucide-react';
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
import { UserAccount } from '../../../../lib/types';
import { apiClient } from '../../../../lib/api-client';
import { formatDateTime } from '../../../../lib/utils';
import { useAuth } from '../../../../providers/auth-provider';
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
	return date ? formatDateTime(date.toISOString()) : fallback;
};

const accountUid = (account: UserAccount) => account.uid || account.id;

const toIsoDate = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

const monthBounds = (monthKey: string) => {
	const [year = '0', month = '1'] = monthKey.split('-');
	const first = new Date(Number(year), Number(month) - 1, 1);
	const last = new Date(Number(year), Number(month), 0);
	return { first, last, from: toIsoDate(first), to: toIsoDate(last) };
};

const addMonths = (monthKey: string, amount: number) => {
	const [year = '0', month = '1'] = monthKey.split('-');
	const next = new Date(Number(year), Number(month) - 1 + amount, 1);
	return toIsoDate(next).slice(0, 7);
};

const calendarCells = (monthKey: string) => {
	const { first, last } = monthBounds(monthKey);
	const cells: Array<{ date: string; inMonth: boolean }> = [];
	const start = new Date(first);
	const startOffset = start.getDay() === 0 ? 6 : start.getDay() - 1;
	start.setDate(start.getDate() - startOffset);
	for (let index = 0; index < 42; index += 1) {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		cells.push({
			date: toIsoDate(date),
			inMonth: date.getMonth() === first.getMonth() && date <= last,
		});
	}
	return cells;
};

export default function PortalAppointmentsClientPage() {
	const qc = useQueryClient();
	const { activeClinicId, me } = useClinic();
	const { t } = useI18n();
	const patientMembership = me?.memberships.find(
		(membership) =>
			membership.clinicId === activeClinicId && membership.role === 'patient',
	);
	const patientId = patientMembership?.patientId;
	const appointmentsQuery = useAuthedQuery({
		queryKey: ['portal-appointments'],
		queryFn: (token, clinicId) =>
			apiClient.appointments(clinicId, token, 'patient'),
	});
	const patientsQuery = useAuthedQuery({
		queryKey: ['portal-patient', patientId],
		queryFn: (token, clinicId) =>
			apiClient.patient(patientId!, clinicId, token, 'patient'),
		enabled: Boolean(patientId),
	});
	const professionalsQuery = useAuthedQuery({
		queryKey: ['portal-professionals'],
		queryFn: (token, clinicId) =>
			apiClient.professionals(clinicId, token, 'patient'),
	});

	const [request, setRequest] = useState({
		professionalUid: '',
		preferredDate: '',
		scheduledFor: '',
	});
	const [visibleMonth, setVisibleMonth] = useState(() =>
		toIsoDate(new Date()).slice(0, 7),
	);

	const resolvedPatientId = patientsQuery.data?.id ?? patientId;
	const { idToken } = useAuth();
	const assignedProfessionalUids = new Set(
		patientsQuery.data?.assignedProfessionalUids ?? [],
	);
	const assignedProfessionals =
		professionalsQuery.data?.filter((professional: UserAccount) =>
			assignedProfessionalUids.has(accountUid(professional)),
		) ?? [];

	const slotsQuery = useAuthedQuery({
		queryKey: [
			'portal-appointment-slots',
			request.professionalUid,
			request.preferredDate,
		],
		queryFn: (token, clinicId) =>
			apiClient.appointmentSlots(
				clinicId,
				request.professionalUid,
				request.preferredDate,
				token,
				'patient',
			),
		enabled: Boolean(request.professionalUid && request.preferredDate),
	});
	const month = monthBounds(visibleMonth);
	const availableDaysQuery = useAuthedQuery({
		queryKey: [
			'portal-appointment-available-days',
			request.professionalUid,
			month.from,
			month.to,
		],
		queryFn: (token, clinicId) =>
			apiClient.appointmentAvailableDays(
				clinicId,
				request.professionalUid,
				month.from,
				month.to,
				token,
				'patient',
			),
		enabled: Boolean(request.professionalUid),
	});
	const availableDaysByDate = useMemo(() => {
		return new Map(
			(availableDaysQuery.data?.days ?? []).map((day) => [day.date, day]),
		);
	}, [availableDaysQuery.data?.days]);

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

	const professionalNameByUid = (uid?: string | null) => {
		if (!uid) return t('common.toBeDefined');
		return (
			professionalsQuery.data?.find(
				(professional: UserAccount) => accountUid(professional) === uid,
			)?.name ?? t('common.workspaceProfessional')
		);
	};

	const requestMutation = useMutation({
		mutationFn: async () => {
			if (!resolvedPatientId) throw new Error('Sin paciente vinculado');
			if (!request.professionalUid || !request.scheduledFor) {
				throw new Error(t('portal.slotRequired'));
			}
			return apiClient.requestAppointment(
				{
					professionalUid: request.professionalUid,
					scheduledFor: request.scheduledFor,
				},
				activeClinicId || '',
				idToken || undefined,
			);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['portal-appointments'] });
			setRequest({ professionalUid: '', preferredDate: '', scheduledFor: '' });
		},
	});

	const cancelMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.cancelAppointment(
				id,
				activeClinicId || '',
				idToken || undefined,
				'patient',
			),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ['portal-appointments'] }),
	});

	return (
		<div className='space-y-6'>
			<div>
				<p className='text-sm text-muted-foreground'>{t('portal.title')}</p>
				<h1 className='text-2xl font-semibold text-primary'>{t('portal.appointments')}</h1>
			</div>

			<Card className='border-primary/10 shadow-lg'>
				<CardHeader className='flex items-center justify-between'>
					<CardTitle className='flex items-center gap-2 text-lg'>
						<CalendarPlus className='h-4 w-4' />
						{t('portal.requestAppointment')}
					</CardTitle>
				</CardHeader>
				<CardContent className='grid gap-4 sm:grid-cols-3'>
					<div className='space-y-1'>
						<Label>{t('role.professional')}</Label>
						<Select
							value={request.professionalUid}
							onChange={(e) =>
								setRequest((prev) => ({
									...prev,
									professionalUid: e.target.value,
									preferredDate: '',
									scheduledFor: '',
								}))
							}
						>
							<option value=''>{t('appointments.chooseProfessional')}</option>
							{assignedProfessionals.map((professional: UserAccount) => (
								<option
									key={professional.id}
									value={accountUid(professional)}
								>
									{professional.name}
								</option>
							))}
						</Select>
					</div>
					<div className='flex items-end sm:col-span-2'>
						<Button
							className='w-full'
							onClick={() => requestMutation.mutate()}
							disabled={requestMutation.isPending || !request.scheduledFor}
						>
							{t('portal.sendRequest')}
						</Button>
					</div>
					<div className='space-y-2 sm:col-span-3'>
						{request.professionalUid ? (
							<div className='rounded-xl border bg-slate-50/60 p-3'>
								<div className='mb-3 flex items-center justify-between gap-3'>
									<div>
										<p className='text-sm font-semibold text-slate-900'>
											{t('portal.availableDays')}
										</p>
										<p className='text-xs text-muted-foreground'>
											{t('portal.chooseDateAndProfessional')}
										</p>
									</div>
									<div className='flex items-center gap-2'>
										<Button
											type='button'
											size='icon'
											variant='outline'
											aria-label={t('portal.previousMonth')}
											onClick={() => {
												setVisibleMonth((current) => addMonths(current, -1));
												setRequest((prev) => ({
													...prev,
													preferredDate: '',
													scheduledFor: '',
												}));
											}}
										>
											<ChevronLeft className='h-4 w-4' />
										</Button>
										<span className='min-w-32 text-center text-sm font-semibold'>
											{month.first.toLocaleDateString(undefined, {
												month: 'long',
												year: 'numeric',
											})}
										</span>
										<Button
											type='button'
											size='icon'
											variant='outline'
											aria-label={t('portal.nextMonth')}
											onClick={() => {
												setVisibleMonth((current) => addMonths(current, 1));
												setRequest((prev) => ({
													...prev,
													preferredDate: '',
													scheduledFor: '',
												}));
											}}
										>
											<ChevronRight className='h-4 w-4' />
										</Button>
									</div>
								</div>
								<div className='grid grid-cols-7 gap-1'>
									{calendarCells(visibleMonth).map((cell) => {
										const day = availableDaysByDate.get(cell.date);
										const selected = request.preferredDate === cell.date;
										return (
											<button
												key={cell.date}
												type='button'
												disabled={!cell.inMonth || !day}
												onClick={() =>
													setRequest((prev) => ({
														...prev,
														preferredDate: cell.date,
														scheduledFor: '',
													}))
												}
												className={[
													'min-h-16 rounded-lg border p-2 text-left text-sm transition',
													selected
														? 'border-primary bg-primary text-primary-foreground'
														: day
															? 'border-emerald-200 bg-white hover:bg-emerald-50'
															: 'border-transparent bg-transparent text-muted-foreground/40',
													!cell.inMonth ? 'opacity-0' : '',
												].join(' ')}
											>
												<span className='block font-semibold'>
													{Number(cell.date.slice(8, 10))}
												</span>
												{day ? (
													<span className='mt-1 block text-[11px] leading-tight'>
														{t('portal.freeSlotsCount', {
															count: day.freeCount,
														})}
													</span>
												) : null}
											</button>
										);
									})}
								</div>
								{availableDaysQuery.isLoading ? (
									<p className='mt-2 text-sm text-muted-foreground'>
										{t('common.loading')}
									</p>
								) : null}
							</div>
						) : null}
					</div>
					{request.professionalUid && request.preferredDate ? (
						<div className='space-y-2 sm:col-span-3'>
							<p className='text-sm font-semibold'>{t('portal.selectSlot')}</p>
							{slotsQuery.isLoading ? (
								<p className='text-sm text-muted-foreground'>
									{t('common.loading')}
								</p>
							) : slotsQuery.data?.slots.length ? (
								<div className='grid grid-cols-3 gap-2 sm:grid-cols-6'>
									{slotsQuery.data.slots.map((slot) => {
										const selected = request.scheduledFor === slot.startsAt;
										return (
											<Button
												key={slot.startsAt}
												type='button'
												size='sm'
												variant={selected ? 'default' : 'outline'}
												disabled={!slot.available}
												className='font-mono'
												onClick={() =>
													setRequest((prev) => ({
														...prev,
														scheduledFor: slot.startsAt,
													}))
												}
											>
												{slot.time}
											</Button>
										);
									})}
								</div>
							) : (
								<p className='text-sm text-muted-foreground'>
									{t('portal.noSlotsForDate')}
								</p>
							)}
						</div>
					) : null}
					{requestMutation.error ? (
						<p className='text-sm text-destructive'>
							{requestMutation.error instanceof Error
								? requestMutation.error.message
								: t('portal.requestError')}
						</p>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('portal.myAppointments')}</CardTitle>
				</CardHeader>
				<CardContent className='space-y-3'>
					{myAppointments.map((appt) => (
						<div
							key={appt.id}
							className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3'
						>
							<div>
								<p className='font-semibold capitalize'>{t(`status.${appt.status}`)}</p>
								<p className='text-xs text-muted-foreground'>
									{t('role.professional')}: {professionalNameByUid(appt.professionalUid)}
								</p>
							</div>
							<div className='text-right'>
								<p className='text-sm font-semibold'>
									{formatSafeDate(appt.scheduledFor || appt.requestedAt, t('common.waitingDate'))}
								</p>
								<div className='mt-2 flex justify-end gap-2'>
									{appt.status !== 'cancelled' ? (
										<Button
											size='sm'
											variant='ghost'
											onClick={() => cancelMutation.mutate(appt.id)}
										>
											<XCircle className='mr-1 h-4 w-4' />
											{t('action.cancel')}
										</Button>
									) : null}
								</div>
							</div>
						</div>
					))}
					{!myAppointments.length ? (
						<p className='text-sm text-muted-foreground'>
							{t('portal.noRequestedAppointments')}
						</p>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}

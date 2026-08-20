'use client';

import {
	Calendar,
	CheckCircle2,
	Clock3,
	PlusCircle,
	Trash2,
	UserPlus,
} from 'lucide-react';
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
import { AvailabilityDay, UserAccount } from '../../../../lib/types';
import { apiClient } from '../../../../lib/api-client';
import { formatDateTime } from '../../../../lib/utils';
import { useAuth } from '../../../../providers/auth-provider';
import { useAuthedQuery } from '../../../../hooks/use-authed-query';
import { useClinic } from '../../../../providers/clinic-provider';
import { useI18n } from '../../../../providers/i18n-provider';
import { usePermissions } from '../../../../hooks/use-permissions';

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

const toDateTimeLocal = (date: Date | null) => {
	if (!date) return '';
	const offset = date.getTimezoneOffset() * 60000;
	return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const dateTimeDatePart = (value: string) => value.slice(0, 10);
const dateTimeTimePart = (value: string) => value.slice(11, 16);
const combineDateTimeLocal = (value: string, part: 'date' | 'time', next: string) => {
	const date = part === 'date' ? next : dateTimeDatePart(value);
	const time = part === 'time' ? next : dateTimeTimePart(value);
	if (!date && !time) return '';
	return `${date || new Date().toISOString().slice(0, 10)}T${time || '08:00'}`;
};

const isValidLocalDateTime = (value: string) =>
	/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value);

const accountUid = (account: UserAccount) => account.uid || account.id;
const weekDays = [
	{ dayOfWeek: 1, labelKey: 'appointments.day.monday' },
	{ dayOfWeek: 2, labelKey: 'appointments.day.tuesday' },
	{ dayOfWeek: 3, labelKey: 'appointments.day.wednesday' },
	{ dayOfWeek: 4, labelKey: 'appointments.day.thursday' },
	{ dayOfWeek: 5, labelKey: 'appointments.day.friday' },
	{ dayOfWeek: 6, labelKey: 'appointments.day.saturday' },
	{ dayOfWeek: 0, labelKey: 'appointments.day.sunday' },
];

const defaultAvailabilityRange = { start: '08:00', end: '18:00' };

function normalizeAvailabilityFormDay(
	day: Partial<AvailabilityDay> & { dayOfWeek: number },
) {
	const ranges =
		day.ranges?.length
			? day.ranges
			: day.start && day.end
				? [{ start: day.start, end: day.end }]
				: [defaultAvailabilityRange];
	const cleanRanges = ranges.map((range) => ({
		start: range.start || defaultAvailabilityRange.start,
		end: range.end || defaultAvailabilityRange.end,
	}));
	return {
		dayOfWeek: day.dayOfWeek,
		enabled: day.enabled ?? false,
		start: cleanRanges[0]?.start ?? defaultAvailabilityRange.start,
		end: cleanRanges[0]?.end ?? defaultAvailabilityRange.end,
		ranges: cleanRanges,
	};
}

function formTimeToMinutes(value: string) {
	const [hours = '0', minutes = '0'] = value.split(':');
	return Number(hours) * 60 + Number(minutes);
}

function minutesToFormTime(value: number) {
	const minutes = Math.max(0, Math.min(value, 23 * 60 + 59));
	const hoursPart = Math.floor(minutes / 60);
	const minutesPart = minutes % 60;
	return `${String(hoursPart).padStart(2, '0')}:${String(minutesPart).padStart(2, '0')}`;
}

function nextAvailabilityRange(ranges: AvailabilityDay['ranges']) {
	const lastRange = [...ranges].sort(
		(a, b) => formTimeToMinutes(a.end) - formTimeToMinutes(b.end),
	).at(-1);
	const start = lastRange ? formTimeToMinutes(lastRange.end) : 14 * 60;
	const end = Math.min(start + 4 * 60, 23 * 60 + 59);
	return {
		start: minutesToFormTime(start),
		end: minutesToFormTime(end > start ? end : start + 30),
	};
}

export default function AppointmentsPage() {
	const qc = useQueryClient();
	const perms = usePermissions();
	const { activeClinicId, activeClinic, activeMembership, platformRole } =
		useClinic();
	const { idToken, user } = useAuth();
	const { t } = useI18n();
	const [filterStatus, setFilterStatus] = useState('all');
	const [isQuickPatientOpen, setIsQuickPatientOpen] = useState(false);
	const [quickPatient, setQuickPatient] = useState({
		name: '',
		dni: '',
		email: '',
		phone: '',
		healthInsuranceName: '',
	});
	const [availabilityForm, setAvailabilityForm] = useState({
		slotMinutes: 30,
		days: weekDays.map((day) => normalizeAvailabilityFormDay({
			dayOfWeek: day.dayOfWeek,
			enabled: day.dayOfWeek >= 1 && day.dayOfWeek <= 5,
			ranges: [defaultAvailabilityRange],
		})),
	});

	const isMeProfessional = activeMembership?.role === 'professional';
	const canManageDefaultAvailability =
		activeClinic?.tenantType !== 'individual_practice' &&
		(platformRole === 'platform_admin' ||
			activeMembership?.role === 'clinic_admin' ||
			activeMembership?.role === 'staff');
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
	}, [isMeProfessional, newAppointment.professionalUid, user?.uid]);

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
	const healthInsurancesQuery = useAuthedQuery({
		queryKey: ['health-insurances', activeClinicId],
		queryFn: (token, clinicId) => apiClient.healthInsurances(clinicId, token),
	});
	const selectedProfessionalUid =
		newAppointment.professionalUid || (isMeProfessional ? user?.uid || '' : '');
	const selectedDate = dateTimeDatePart(newAppointment.scheduledFor);
	const slotsQuery = useAuthedQuery({
		queryKey: ['appointment-slots', selectedProfessionalUid, selectedDate],
		queryFn: (token, clinicId) =>
			apiClient.appointmentSlots(
				clinicId,
				selectedProfessionalUid,
				selectedDate,
				token,
			),
		enabled: Boolean(selectedProfessionalUid && selectedDate),
	});
	const availabilityQuery = useAuthedQuery({
		queryKey: ['professional-availability', selectedProfessionalUid],
		queryFn: (token, clinicId) =>
			apiClient.professionalAvailability(
				clinicId,
				selectedProfessionalUid,
				token,
			),
		enabled: Boolean(selectedProfessionalUid),
	});

	useEffect(() => {
		if (!availabilityQuery.data) return;
		setAvailabilityForm({
			slotMinutes: availabilityQuery.data.slotMinutes,
			days: weekDays.map((day) => {
				const saved = availabilityQuery.data.days.find(
					(item) => item.dayOfWeek === day.dayOfWeek,
				);
				return (
					normalizeAvailabilityFormDay(saved ?? {
						dayOfWeek: day.dayOfWeek,
						enabled: false,
						ranges: [defaultAvailabilityRange],
					})
				);
			}),
		});
	}, [availabilityQuery.data]);

	const scheduleMutation = useMutation({
		mutationFn: async () => {
			if (
				!newAppointment.patientId ||
				!newAppointment.professionalUid ||
				!isValidLocalDateTime(newAppointment.scheduledFor)
			) {
				throw new Error('Missing appointment data');
			}

			return apiClient.createAppointment(
				{
					patientId: newAppointment.patientId,
					professionalUid: newAppointment.professionalUid,
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

	const createPatientMutation = useMutation({
		mutationFn: async () => {
			if (!activeClinicId) throw new Error('Missing active workspace');
			if (!quickPatient.name.trim() || !quickPatient.dni.trim()) {
				throw new Error('Missing patient data');
			}

			const professionalUid =
				newAppointment.professionalUid ||
				(isMeProfessional ? user?.uid || '' : '');
			const assignedProfessionalUids = professionalUid
				? [professionalUid]
				: [];

			return apiClient.createPatient(
				activeClinicId,
				{
					name: quickPatient.name.trim(),
					dni: quickPatient.dni.trim(),
					email: quickPatient.email.trim(),
					phone: quickPatient.phone.trim(),
					healthInsuranceName: quickPatient.healthInsuranceName.trim(),
					assignedProfessionalUids,
				},
				idToken || undefined,
			);
		},
		onSuccess: (patient) => {
			qc.invalidateQueries({ queryKey: ['patients'] });
			qc.invalidateQueries({ queryKey: ['health-insurances', activeClinicId] });
			setNewAppointment((prev) => ({ ...prev, patientId: patient.id }));
			setQuickPatient({
				name: '',
				dni: '',
				email: '',
				phone: '',
				healthInsuranceName: '',
			});
			setIsQuickPatientOpen(false);
		},
	});

	const updateMutation = useMutation({
		mutationFn: async () => {
			if (!newAppointment.id || !isValidLocalDateTime(newAppointment.scheduledFor)) {
				throw new Error('Missing update data');
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
			if (!isValidLocalDateTime(newAppointment.scheduledFor)) {
				throw new Error('Missing schedule date');
			}
			return apiClient.scheduleAppointment(
				{
					id: appt.id,
					professionalUid: appt.professionalUid || user?.uid || '',
					scheduledFor: new Date(newAppointment.scheduledFor).toISOString(),
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

	const saveAvailabilityMutation = useMutation({
		mutationFn: async () => {
			if (!selectedProfessionalUid || !activeClinicId) {
				throw new Error('Missing professional');
			}
			return apiClient.saveProfessionalAvailability(
				activeClinicId,
				selectedProfessionalUid,
				availabilityForm,
				idToken || undefined,
			);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['professional-availability'] });
			qc.invalidateQueries({ queryKey: ['appointment-slots'] });
		},
	});

	const saveDefaultAvailabilityMutation = useMutation({
		mutationFn: async () => {
			if (!activeClinicId) throw new Error('Missing active workspace');
			return apiClient.saveClinicAvailability(
				activeClinicId,
				availabilityForm,
				idToken || undefined,
			);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['professional-availability'] });
			qc.invalidateQueries({ queryKey: ['appointment-slots'] });
		},
	});

	const appointments = useMemo(() => {
		const list = appointmentsQuery.data || [];
		if (filterStatus === 'all') return list;
		return list.filter((appt) => appt.status === filterStatus);
	}, [appointmentsQuery.data, filterStatus]);

	const isSubmitting = scheduleMutation.isPending || updateMutation.isPending;
	const professionals = professionalsQuery.data || [];
	const professionalName = (uid?: string | null) => {
		if (!uid) return 'N/A';
		if (uid === user?.uid) return t('common.me');
		return (
			professionals.find(
				(professional: UserAccount) => accountUid(professional) === uid,
			)?.name || t('common.workspaceProfessionalUnavailable')
		);
	};

	return (
		<div className='space-y-6'>
			<div className='flex flex-wrap items-center justify-between gap-3'>
				<div>
					<p className='text-sm text-muted-foreground'>{t('appointments.weeklyView')}</p>
					<h1 className='text-2xl font-semibold text-primary'>{t('nav.appointments')}</h1>
				</div>
				<div className='flex items-center gap-2'>
					<Badge variant='outline'>
						{t('common.total')}: {appointmentsQuery.data?.length ?? 0}
					</Badge>
					<Select
						value={filterStatus}
						onChange={(e) => setFilterStatus(e.target.value)}
						className='w-44'
					>
						<option value='all'>{t('common.all')}</option>
						<option value='requested'>{t('status.requested')}</option>
						<option value='scheduled'>{t('status.scheduled')}</option>
						<option value='cancelled'>{t('status.cancelled')}</option>
					</Select>
				</div>
			</div>

			<div className='grid gap-6 lg:grid-cols-[1.4fr,1fr]'>
				<Card>
					<CardHeader className='flex items-center justify-between'>
						<CardTitle className='flex items-center gap-2 text-lg'>
							<Calendar className='h-4 w-4 text-primary' />
							{t('appointments.agenda')}
						</CardTitle>
						<Badge variant='secondary'>{t('appointments.quickView')}</Badge>
					</CardHeader>
					<CardContent className='space-y-3'>
						{appointments.map((appt) => {
							const safeDate = parseSafeDate(appt.scheduledFor);
							const patientName =
								patientsQuery.data?.find((p) => p.id === appt.patientId)
									?.name || t('appointments.patientUnavailable');
							return (
								<div
									key={appt.id}
									className='flex items-center justify-between rounded-xl border p-3'
								>
									<div>
										<p className='font-semibold'>{patientName}</p>
										<p className='text-xs text-muted-foreground'>
											{t('role.professional')}: {professionalName(appt.professionalUid)}
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
											{t(`status.${appt.status}`)}
										</Badge>
									</div>
									<div className='text-right'>
										<p className='text-sm font-semibold'>
											{safeDate
												? formatDateTime(safeDate.toISOString())
												: t('appointments.toSchedule')}
										</p>
										<div className='mt-2 flex justify-end gap-2'>
											{appt.status === 'scheduled' ? (
												<Button
													size='sm'
													variant='secondary'
													onClick={() => {
														setNewAppointment({
															id: appt.id,
															patientId: appt.patientId,
															professionalUid: appt.professionalUid || '',
															scheduledFor: toDateTimeLocal(safeDate),
														});
														window.scrollTo({ top: 0, behavior: 'smooth' });
													}}
												>
													{t('action.edit')}
												</Button>
											) : null}

											{appt.status === 'scheduled' ? (
												<Button
													size='sm'
													variant='default'
													className='bg-emerald-600 text-white hover:bg-emerald-700'
													onClick={() => completeMutation.mutate(appt.id)}
													disabled={completeMutation.isPending}
												>
													<CheckCircle2 className='mr-1.5 h-4 w-4' />
													{t('dashboard.completed')}
												</Button>
											) : null}

											{appt.status !== 'cancelled' ? (
												<Button
													size='sm'
													variant='ghost'
													onClick={() => cancelMutation.mutate(appt.id)}
												>
													{t('action.cancel')}
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
													{t('appointments.scheduleNow')}
												</Button>
											) : null}
										</div>
									</div>
								</div>
							);
						})}
						{!appointments.length ? (
							<p className='text-sm text-muted-foreground'>
								{t('appointments.emptyFilter')}
							</p>
						) : null}
					</CardContent>
				</Card>

				<Card className='self-start border-primary/10 shadow-lg'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2 text-lg'>
							<PlusCircle className='h-4 w-4' />
							{newAppointment.id
								? t('appointments.editAppointment')
								: t('appointments.scheduleAppointment')}
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-3'>
						<div className='space-y-1'>
							<Label>{t('role.patient')}</Label>
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
								<option value=''>{t('appointments.choosePatient')}</option>
								{patientsQuery.data?.map((patient) => (
									<option key={patient.id} value={patient.id}>
										{patient.name}
									</option>
								))}
							</Select>
							{!newAppointment.id ? (
								<Button
									type='button'
									variant='ghost'
									size='sm'
									className='px-0 text-primary'
									onClick={() => setIsQuickPatientOpen((open) => !open)}
								>
									<UserPlus className='mr-1.5 h-4 w-4' />
									{isQuickPatientOpen
										? t('appointments.hideQuickPatient')
										: t('appointments.addQuickPatient')}
								</Button>
							) : null}
						</div>
						{isQuickPatientOpen && !newAppointment.id ? (
							<div className='space-y-3 rounded-lg border bg-muted/20 p-3'>
								<div className='grid gap-3 sm:grid-cols-2'>
									<div className='space-y-1 sm:col-span-2'>
										<Label>{t('common.name')}</Label>
										<Input
											placeholder={t('common.fullNamePlaceholder')}
											value={quickPatient.name}
											onChange={(e) =>
												setQuickPatient((prev) => ({
													...prev,
													name: e.target.value,
												}))
											}
										/>
									</div>
									<div className='space-y-1'>
										<Label>DNI</Label>
										<Input
											placeholder={t('common.dniPlaceholder')}
											value={quickPatient.dni}
											onChange={(e) =>
												setQuickPatient((prev) => ({
													...prev,
													dni: e.target.value,
												}))
											}
										/>
									</div>
									<div className='space-y-1'>
										<Label>{t('common.phone')}</Label>
										<Input
											placeholder={t('common.phonePlaceholder')}
											value={quickPatient.phone}
											onChange={(e) =>
												setQuickPatient((prev) => ({
													...prev,
													phone: e.target.value,
												}))
											}
										/>
									</div>
									<div className='space-y-1 sm:col-span-2'>
										<Label>Email</Label>
										<Input
											type='email'
											placeholder={t('common.patientEmailPlaceholder')}
											value={quickPatient.email}
											onChange={(e) =>
												setQuickPatient((prev) => ({
													...prev,
													email: e.target.value,
												}))
											}
										/>
									</div>
									<div className='space-y-1 sm:col-span-2'>
										<Label>{t('patients.healthInsurance')}</Label>
										<Input
											list='quick-patient-health-insurances'
											placeholder={t('patients.healthInsurancePlaceholder')}
											value={quickPatient.healthInsuranceName}
											onChange={(e) =>
												setQuickPatient((prev) => ({
													...prev,
													healthInsuranceName: e.target.value,
												}))
											}
										/>
										<datalist id='quick-patient-health-insurances'>
											{healthInsurancesQuery.data?.map((item) => (
												<option key={item.id} value={item.name} />
											))}
										</datalist>
									</div>
								</div>
								<Button
									type='button'
									variant='secondary'
									className='w-full'
									onClick={() => createPatientMutation.mutate()}
									disabled={createPatientMutation.isPending}
								>
									<UserPlus className='mr-2 h-4 w-4' />
									{createPatientMutation.isPending
										? t('appointments.creatingPatient')
										: t('appointments.createAndUsePatient')}
								</Button>
								{createPatientMutation.error ? (
									<p className='text-sm text-destructive'>
										{t('appointments.createPatientError')}
									</p>
								) : null}
							</div>
						) : null}
						<div className='space-y-1'>
							<Label>{t('role.professional')}</Label>
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
								<option value=''>{t('appointments.chooseProfessional')}</option>
								{isMeProfessional && user ? (
									<option value={user.uid}>{t('common.me')}</option>
								) : (
									professionalsQuery.data?.map((professional: UserAccount) => (
										<option
											key={professional.id}
											value={accountUid(professional)}
										>
											{professional.name}
										</option>
									))
								)}
							</Select>
						</div>
						<div className='space-y-1'>
							<Label>{t('common.dateTime')}</Label>
							<div className='grid grid-cols-[1.2fr,0.8fr] gap-2'>
								<Input
									type='date'
									value={dateTimeDatePart(newAppointment.scheduledFor)}
									onChange={(e) =>
										setNewAppointment({
											...newAppointment,
											scheduledFor: combineDateTimeLocal(
												newAppointment.scheduledFor,
												'date',
												e.target.value,
											),
										})
									}
								/>
								<Input
									type='text'
									inputMode='numeric'
									pattern='[0-2][0-9]:[0-5][0-9]'
									placeholder='HH:mm'
									value={dateTimeTimePart(newAppointment.scheduledFor)}
									onChange={(e) =>
										setNewAppointment({
											...newAppointment,
											scheduledFor: combineDateTimeLocal(
												newAppointment.scheduledFor,
												'time',
												e.target.value,
											),
										})
									}
								/>
							</div>
						</div>
						{selectedProfessionalUid && selectedDate ? (
							<div className='space-y-2 rounded-lg border bg-slate-50/60 p-3'>
								<div className='flex items-center justify-between gap-2'>
									<p className='text-sm font-semibold text-slate-800'>
										{t('appointments.availableSlots')}
									</p>
									<p className='text-xs text-muted-foreground'>
										{slotsQuery.data?.slotMinutes ?? availabilityForm.slotMinutes} min
									</p>
								</div>
								{slotsQuery.isLoading ? (
									<p className='text-xs text-muted-foreground'>
										{t('common.loading')}
									</p>
								) : slotsQuery.data?.slots.length ? (
									<div className='grid grid-cols-3 gap-2'>
										{slotsQuery.data.slots.map((slot) => {
											const selected =
												dateTimeTimePart(newAppointment.scheduledFor) ===
												slot.time;
											return (
												<Button
													key={slot.startsAt}
													type='button'
													size='sm'
													variant={selected ? 'default' : 'outline'}
													disabled={!slot.available}
													className='font-mono'
													onClick={() =>
														setNewAppointment({
															...newAppointment,
															scheduledFor: toDateTimeLocal(
																new Date(slot.startsAt),
															),
														})
													}
												>
													{slot.time}
												</Button>
											);
										})}
									</div>
								) : (
									<p className='text-xs text-muted-foreground'>
										{t('appointments.noSlotsForDate')}
									</p>
								)}
							</div>
						) : null}
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
							{newAppointment.id
								? t('appointments.saveChanges')
								: t('appointments.saveAppointment')}
						</Button>

						{newAppointment.id ? (
							<Button
								variant='ghost'
								onClick={resetForm}
								className='mt-2 w-full'
							>
								{t('appointments.cancelEdit')}
							</Button>
						) : null}

						{!perms.canScheduleForOthers && !isMeProfessional ? (
							<p className='text-xs text-muted-foreground'>
								{t('appointments.noSchedulePermission')}
							</p>
						) : null}
						{scheduleMutation.error || updateMutation.error ? (
							<p className='text-sm text-destructive'>
								{t('appointments.processError')}
							</p>
						) : null}
						{cancelMutation.error ? (
							<p className='text-sm text-destructive'>
								{t('appointments.cancelError')}
							</p>
						) : null}
					</CardContent>
				</Card>

				<Card className='self-start'>
					<CardHeader>
						<CardTitle className='text-lg'>
							{t('appointments.availabilityTitle')}
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							{t('appointments.availabilityDetail')}
						</p>
						<div className='rounded-lg border bg-slate-50/70 p-3 text-xs text-muted-foreground'>
							<p>{t('appointments.saveAvailabilityHelp')}</p>
							{canManageDefaultAvailability ? (
								<p className='mt-1'>
									{t('appointments.saveDefaultAvailabilityHelp')}
								</p>
							) : null}
						</div>
						<div className='space-y-1'>
							<Label>{t('appointments.slotDuration')}</Label>
							<Select
								value={String(availabilityForm.slotMinutes)}
								onChange={(e) =>
									setAvailabilityForm((prev) => ({
										...prev,
										slotMinutes: Number(e.target.value),
									}))
								}
								disabled={!selectedProfessionalUid}
							>
								<option value='15'>15 min</option>
								<option value='20'>20 min</option>
								<option value='30'>30 min</option>
								<option value='45'>45 min</option>
								<option value='60'>60 min</option>
							</Select>
						</div>
						<div className='space-y-3'>
							{availabilityForm.days.map((day) => {
								const label =
									weekDays.find((item) => item.dayOfWeek === day.dayOfWeek)
										?.labelKey ?? String(day.dayOfWeek);
								return (
									<div
										key={day.dayOfWeek}
										className='space-y-3 rounded-lg border p-3'
									>
										<div className='flex flex-wrap items-center justify-between gap-2'>
											<label className='flex items-center gap-2 text-sm font-medium'>
												<input
													type='checkbox'
													checked={day.enabled}
													disabled={!selectedProfessionalUid}
													onChange={(e) =>
														setAvailabilityForm((prev) => ({
															...prev,
															days: prev.days.map((item) =>
																item.dayOfWeek === day.dayOfWeek
																	? { ...item, enabled: e.target.checked }
																	: item,
															),
														}))
													}
												/>
												{label.startsWith('appointments.')
													? t(label)
													: label}
											</label>
											<Button
												type='button'
												size='sm'
												variant='ghost'
												disabled={!selectedProfessionalUid || !day.enabled}
												onClick={() =>
													setAvailabilityForm((prev) => ({
														...prev,
														days: prev.days.map((item) =>
															item.dayOfWeek === day.dayOfWeek
																? {
																		...item,
																		ranges: [
																			...item.ranges,
																			nextAvailabilityRange(item.ranges),
																		],
																	}
																: item,
														),
													}))
												}
											>
												<PlusCircle className='mr-1.5 h-4 w-4' />
												{t('appointments.addRange')}
											</Button>
										</div>
										<div className='space-y-2'>
											{day.ranges.map((range, rangeIndex) => (
												<div
													key={`${day.dayOfWeek}-${rangeIndex}`}
													className='grid grid-cols-[1fr,1fr,auto] items-end gap-2'
												>
													<div className='space-y-1'>
														<Label className='text-xs'>
															{t('appointments.rangeStart')}
														</Label>
														<Input
															type='text'
															inputMode='numeric'
															pattern='[0-2][0-9]:[0-5][0-9]'
															placeholder='HH:mm'
															value={range.start}
															disabled={!selectedProfessionalUid || !day.enabled}
															onChange={(e) =>
																setAvailabilityForm((prev) => ({
																	...prev,
																	days: prev.days.map((item) =>
																		item.dayOfWeek === day.dayOfWeek
																			? {
																					...item,
																					ranges: item.ranges.map((currentRange, index) =>
																						index === rangeIndex
																							? {
																									...currentRange,
																									start: e.target.value,
																								}
																							: currentRange,
																					),
																				}
																			: item,
																	),
																}))
															}
														/>
													</div>
													<div className='space-y-1'>
														<Label className='text-xs'>
															{t('appointments.rangeEnd')}
														</Label>
														<Input
															type='text'
															inputMode='numeric'
															pattern='[0-2][0-9]:[0-5][0-9]'
															placeholder='HH:mm'
															value={range.end}
															disabled={!selectedProfessionalUid || !day.enabled}
															onChange={(e) =>
																setAvailabilityForm((prev) => ({
																	...prev,
																	days: prev.days.map((item) =>
																		item.dayOfWeek === day.dayOfWeek
																			? {
																					...item,
																					ranges: item.ranges.map((currentRange, index) =>
																						index === rangeIndex
																							? {
																									...currentRange,
																									end: e.target.value,
																								}
																							: currentRange,
																					),
																				}
																			: item,
																	),
																}))
															}
														/>
													</div>
													<Button
														type='button'
														size='icon-sm'
														variant='ghost'
														aria-label={t('appointments.removeRange')}
														disabled={
															!selectedProfessionalUid ||
															!day.enabled ||
															day.ranges.length <= 1
														}
														onClick={() =>
															setAvailabilityForm((prev) => ({
																...prev,
																days: prev.days.map((item) =>
																	item.dayOfWeek === day.dayOfWeek
																		? {
																				...item,
																				ranges: item.ranges.filter(
																					(_range, index) => index !== rangeIndex,
																				),
																			}
																		: item,
																),
															}))
														}
													>
														<Trash2 className='h-4 w-4' />
													</Button>
												</div>
											))}
										</div>
									</div>
								);
							})}
						</div>
						<Button
							type='button'
							className='w-full'
							onClick={() => saveAvailabilityMutation.mutate()}
							disabled={!selectedProfessionalUid || saveAvailabilityMutation.isPending}
						>
							{saveAvailabilityMutation.isPending
								? t('common.processing')
								: t('appointments.saveAvailability')}
						</Button>
						{canManageDefaultAvailability ? (
							<Button
								type='button'
								variant='secondary'
								className='w-full'
								onClick={() => saveDefaultAvailabilityMutation.mutate()}
								disabled={saveDefaultAvailabilityMutation.isPending}
							>
								{saveDefaultAvailabilityMutation.isPending
									? t('common.processing')
									: t('appointments.saveDefaultAvailability')}
							</Button>
						) : null}
						{saveAvailabilityMutation.error || saveDefaultAvailabilityMutation.error ? (
							<p className='text-sm text-destructive'>
								{t('appointments.availabilityError')}
							</p>
						) : null}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

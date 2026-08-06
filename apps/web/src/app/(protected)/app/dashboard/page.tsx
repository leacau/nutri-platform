'use client';

import {
	Calendar as CalendarIcon,
	CalendarPlus,
	CheckCheck,
	CheckCircle2,
	ChevronRight,
	Clock,
	Loader2,
	UserCheck,
	UserPlus,
	Users,
} from 'lucide-react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../../../components/ui/card';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import Link from 'next/link';
import { apiClient } from '../../../../lib/api-client';
import { formatDate } from '../../../../lib/utils';
import { useAuth } from '../../../../providers/auth-provider';
import { useClinic } from '../../../../providers/clinic-provider';
import { useI18n } from '../../../../providers/i18n-provider';
import { useRouter } from 'next/navigation';

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

const isSameDay = (apptDateVal: any, todayStr: string) => {
	const d = parseSafeDate(apptDateVal);
	if (!d) return false;
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}` === todayStr;
};

function firstName(value: string | null | undefined) {
	return value?.trim().split(/\s+/)[0] || null;
}

export default function DashboardPage() {
	const { activeClinicId, activeClinic, activeMembership, platformRole } =
		useClinic();
	const { idToken, user } = useAuth();
	const router = useRouter();
	const qc = useQueryClient();
	const { locale, t } = useI18n();

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

	const { data: patients, isLoading: isLoadingPatients } = useQuery({
		queryKey: [
			'patients',
			activeClinicId,
			user?.uid,
			activeMembership?.role ?? platformRole,
		],
		queryFn: () => apiClient.patients(activeClinicId!, idToken ?? undefined),
		enabled: Boolean(activeClinicId && idToken),
	});

	const { data: appointments, isLoading: isLoadingAppts } = useQuery({
		queryKey: [
			'appointments',
			activeClinicId,
			user?.uid,
			activeMembership?.role ?? platformRole,
		],
		queryFn: () =>
			apiClient.appointments(activeClinicId!, idToken ?? undefined),
		enabled: Boolean(activeClinicId && idToken),
	});

	const { data: professionals } = useQuery({
		queryKey: ['dashboard-professionals', activeClinicId, user?.uid],
		queryFn: () => apiClient.professionals(activeClinicId!, idToken ?? undefined),
		enabled: Boolean(
			activeClinicId &&
				idToken &&
				activeClinic?.tenantType === 'individual_practice',
		),
	});

	const arriveMutation = useMutation({
		mutationFn: async (apptId: string) =>
			apiClient.arriveAppointment(
				apptId,
				activeClinicId || '',
				idToken || undefined,
			),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
	});

	const todayAppointments =
		isMounted && appointments
			? appointments.filter(
					(appt) =>
						appt.status !== 'cancelled' &&
						isSameDay(appt.scheduledFor, todayDateString),
				)
			: [];

	const arrivedAppointments = todayAppointments
		.filter((appt) => appt.status === 'arrived')
		.sort((a, b) => {
			const dateA = parseSafeDate(a.arrivedAt || a.scheduledFor);
			const dateB = parseSafeDate(b.arrivedAt || b.scheduledFor);
			return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
		});

	const scheduledAppointments = todayAppointments
		.filter((appt) => appt.status === 'scheduled')
		.sort((a, b) => {
			const dateA = parseSafeDate(a.scheduledFor);
			const dateB = parseSafeDate(b.scheduledFor);
			return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
		});

	const completedAppointments = todayAppointments
		.filter((appt) => appt.status === 'completed')
		.sort((a, b) => {
			const dateA = parseSafeDate(a.completedAt || a.scheduledFor);
			const dateB = parseSafeDate(b.completedAt || b.scheduledFor);
			return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
		});

	const totalPatients = patients?.length || 0;
	const isLoading = isLoadingPatients || isLoadingAppts || !isMounted;
	const isIndividualPractice = activeClinic?.tenantType === 'individual_practice';
	const ownerProfessional = professionals?.find((professional) => {
		const ownerUid = activeClinic?.ownerProfessionalUid;
		if (!ownerUid) return false;
		return professional.uid === ownerUid || professional.id === ownerUid;
	});
	const displayName =
		(isIndividualPractice ? firstName(ownerProfessional?.name) : null) ||
		firstName(user?.displayName) ||
		firstName(user?.email?.split('@')[0]) ||
		(isIndividualPractice ? t('role.professional') : t('role.doctor'));

	if (!isMounted) return null;

	return (
		<main className='mx-auto max-w-6xl px-6 py-8'>
			<div className='mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center'>
				<div>
					<h1 className='text-3xl font-bold tracking-tight text-slate-900'>
						{t('dashboard.greeting', { name: displayName })}
					</h1>
					<p className='mt-1 text-slate-500'>
						{isIndividualPractice
							? t('dashboard.summaryIndividual')
							: t('dashboard.summaryClinic', {
									clinicName: activeClinic?.name ?? '',
								})}
					</p>
				</div>
			</div>

			{isLoading ? (
				<div className='flex flex-col items-center justify-center py-20 text-slate-500'>
					<Loader2 className='mb-4 h-8 w-8 animate-spin text-primary' />
					<p>{t('dashboard.loading')}</p>
				</div>
			) : (
				<div className='grid grid-cols-1 gap-6 md:grid-cols-12'>
					<div className='space-y-6 md:col-span-8'>
						<div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
							<Card className='border-slate-200 bg-white shadow-sm transition-colors hover:border-blue-200'>
								<CardContent className='flex items-center gap-4 p-6'>
									<div className='rounded-full bg-blue-50 p-4 text-blue-600'>
										<Users className='h-6 w-6' />
									</div>
									<div>
										<p className='text-sm font-medium text-slate-500'>
											{t('dashboard.totalPatients')}
										</p>
										<h3 className='text-3xl font-bold text-slate-900'>
											{totalPatients}
										</h3>
									</div>
								</CardContent>
							</Card>

							<Card className='border-slate-200 bg-white shadow-sm transition-colors hover:border-emerald-200'>
								<CardContent className='flex items-center gap-4 p-6'>
									<div className='rounded-full bg-emerald-50 p-4 text-emerald-600'>
										<CalendarIcon className='h-6 w-6' />
									</div>
									<div>
										<p className='text-sm font-medium text-slate-500'>
											{t('dashboard.todayAppointments')}
										</p>
										<h3 className='text-3xl font-bold text-slate-900'>
											{todayAppointments.length}
										</h3>
									</div>
								</CardContent>
							</Card>

							<Card className='border-slate-200 bg-white shadow-sm transition-colors hover:border-amber-200'>
								<CardContent className='flex items-center gap-4 p-6'>
									<div className='rounded-full bg-amber-50 p-4 text-amber-600'>
										<UserCheck className='h-6 w-6' />
									</div>
									<div>
										<p className='text-sm font-medium text-slate-500'>
											{t('dashboard.waiting')}
										</p>
										<h3 className='text-3xl font-bold text-slate-900'>
											{arrivedAppointments.length}
										</h3>
									</div>
								</CardContent>
							</Card>
						</div>

						<Card className='border-slate-200 shadow-sm'>
							<CardHeader className='pb-3'>
								<CardTitle className='text-lg'>
									{t('dashboard.quickAccess')}
								</CardTitle>
								<CardDescription>
									{isIndividualPractice
										? t('dashboard.quickAccessDetailIndividual')
										: t('dashboard.quickAccessDetailClinic')}
								</CardDescription>
							</CardHeader>
							<CardContent className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
								<Button
									size='lg'
									className='h-20 justify-start border border-slate-200 bg-slate-50 px-6 text-slate-700 transition-all hover:border-blue-200 hover:bg-blue-50'
									onClick={() => router.push('/app/patients')}
								>
									<div className='flex items-center gap-4'>
										<div className='rounded-full bg-white p-2 shadow-sm'>
											<UserPlus className='h-5 w-5 text-blue-600' />
										</div>
										<div className='text-left'>
											<p className='text-base font-semibold'>
												{t('dashboard.newPatient')}
											</p>
											<p className='text-xs font-normal text-slate-500'>
												{t('dashboard.addToBase')}
											</p>
										</div>
									</div>
								</Button>

								<Button
									size='lg'
									className='h-20 justify-start border border-slate-200 bg-slate-50 px-6 text-slate-700 transition-all hover:border-emerald-200 hover:bg-emerald-50'
									onClick={() => router.push('/app/appointments')}
								>
									<div className='flex items-center gap-4'>
										<div className='rounded-full bg-white p-2 shadow-sm'>
											<CalendarPlus className='h-5 w-5 text-emerald-600' />
										</div>
										<div className='text-left'>
											<p className='text-base font-semibold'>
												{t('dashboard.newAppointment')}
											</p>
											<p className='text-xs font-normal text-slate-500'>
												{t('dashboard.scheduleVisit')}
											</p>
										</div>
									</div>
								</Button>
							</CardContent>
						</Card>
					</div>

					<div className='md:col-span-4'>
						<Card className='flex h-full flex-col border-slate-200 shadow-sm'>
							<CardHeader className='border-b border-slate-100 bg-slate-50/50 pb-3'>
								<CardTitle className='flex items-center justify-between text-lg'>
									<span>{t('dashboard.todayAgenda')}</span>
									<Badge
										variant='secondary'
										className='bg-blue-100 text-blue-800 hover:bg-blue-100'
									>
										{formatDate(new Date().toISOString())}
									</Badge>
								</CardTitle>
							</CardHeader>

							<CardContent className='max-h-[500px] flex-1 overflow-y-auto p-0'>
								{todayAppointments.length === 0 ? (
									<div className='flex h-full flex-col items-center justify-center p-8 text-center text-slate-500'>
										<div className='mb-3 rounded-full border border-slate-100 bg-slate-50 p-4'>
											<CalendarIcon className='h-8 w-8 text-slate-300' />
										</div>
										<p className='font-medium text-slate-600'>
											{t('dashboard.noAppointmentsToday')}
										</p>
										<p className='mt-1 text-sm'>{t('dashboard.freeDay')}</p>
									</div>
								) : (
									<div className='flex flex-col'>
										{arrivedAppointments.length > 0 && (
											<div className='border-b border-slate-100 bg-emerald-50/50'>
												<div className='flex items-center justify-between border-b border-emerald-100/50 px-4 py-2'>
													<span className='text-xs font-bold uppercase tracking-wider text-emerald-800'>
														{t('dashboard.waitingRoom')}
													</span>
													<span className='rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-800'>
														{arrivedAppointments.length}
													</span>
												</div>
												<div className='divide-y divide-emerald-100/50'>
													{arrivedAppointments.map((appt) => {
														const apptDate = parseSafeDate(appt.scheduledFor);
														const timeString = apptDate
															? apptDate.toLocaleTimeString(locale, {
																	hour: '2-digit',
																	minute: '2-digit',
																})
															: '--:--';
														const patient = patients?.find(
															(p) => p.id === appt.patientId,
														);

														return (
															<Link
																key={appt.id}
																href={`/app/patients/${appt.patientId}`}
																className='group relative flex items-center justify-between overflow-hidden p-4 transition-colors hover:bg-emerald-50'
															>
																<div className='absolute bottom-0 left-0 top-0 w-1 bg-emerald-500' />
																<div className='flex items-center gap-4 pl-2'>
																	<div className='flex h-12 w-12 flex-col items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-700 shadow-sm'>
																		<UserCheck className='mb-0.5 h-4 w-4 text-emerald-600' />
																		<span className='text-xs font-bold'>
																			{timeString}
																		</span>
																	</div>
																	<div>
																		<p className='font-bold text-slate-900 transition-colors group-hover:text-emerald-700'>
																			{patient?.name || t('dashboard.unknownPatient')}
																		</p>
																		<p className='text-xs font-medium text-emerald-600'>
																			{t('dashboard.ready')}
																		</p>
																	</div>
																</div>
																<ChevronRight className='h-5 w-5 text-emerald-300 transition-colors group-hover:text-emerald-600' />
															</Link>
														);
													})}
												</div>
											</div>
										)}

										{scheduledAppointments.length > 0 && (
											<div>
												<div className='flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2'>
													<span className='text-xs font-bold uppercase tracking-wider text-slate-500'>
														{t('dashboard.notArrived')}
													</span>
												</div>
												<div className='divide-y divide-slate-100'>
													{scheduledAppointments.map((appt) => {
														const apptDate = parseSafeDate(appt.scheduledFor);
														const timeString = apptDate
															? apptDate.toLocaleTimeString(locale, {
																	hour: '2-digit',
																	minute: '2-digit',
																})
															: '--:--';
														const patient = patients?.find(
															(p) => p.id === appt.patientId,
														);

														return (
															<div
																key={appt.id}
																className='group flex items-center justify-between p-4 transition-colors hover:bg-slate-50'
															>
																<Link
																	href={`/app/patients/${appt.patientId}`}
																	className='flex flex-1 items-center gap-4'
																>
																	<div className='flex h-12 w-12 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors group-hover:border-primary/30'>
																		<Clock className='mb-0.5 h-4 w-4 text-slate-400 transition-colors group-hover:text-primary' />
																		<span className='text-xs font-bold'>
																			{timeString}
																		</span>
																	</div>
																	<div>
																		<p className='font-semibold text-slate-900 transition-colors group-hover:text-primary'>
																			{patient?.name || t('dashboard.unknownPatient')}
																		</p>
																		<p className='text-xs text-slate-500'>
																			{t('dashboard.generalVisit')}
																		</p>
																	</div>
																</Link>
																<Button
																	size='sm'
																	variant='outline'
																	className='h-8 text-xs font-medium text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 border-emerald-200'
																	onClick={(e) => {
																		e.preventDefault();
																		arriveMutation.mutate(appt.id);
																	}}
																	disabled={arriveMutation.isPending}
																>
																	<CheckCircle2 className='mr-1 h-3.5 w-3.5' />
																	{t('dashboard.arrived')}
																</Button>
															</div>
														);
													})}
												</div>
											</div>
										)}

										{completedAppointments.length > 0 && (
											<div className='opacity-75'>
												<div className='flex items-center justify-between border-b border-slate-200 bg-slate-100 px-4 py-2'>
													<span className='text-xs font-bold uppercase tracking-wider text-slate-400'>
														{t('dashboard.completed')}
													</span>
													<span className='text-xs font-bold text-slate-400'>
														{completedAppointments.length}
													</span>
												</div>
												<div className='divide-y divide-slate-100 bg-slate-50/50'>
													{completedAppointments.map((appt) => {
														const apptDate = parseSafeDate(appt.scheduledFor);
														const timeString = apptDate
															? apptDate.toLocaleTimeString(locale, {
																	hour: '2-digit',
																	minute: '2-digit',
																})
															: '--:--';
														const patient = patients?.find(
															(p) => p.id === appt.patientId,
														);

														return (
															<Link
																key={appt.id}
																href={`/app/patients/${appt.patientId}`}
																className='group flex items-center justify-between p-4 transition-colors hover:bg-slate-100'
															>
																<div className='flex items-center gap-4'>
																	<div className='flex h-12 w-12 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400 shadow-sm'>
																		<CheckCheck className='mb-0.5 h-4 w-4 text-slate-400' />
																		<span className='text-xs font-bold line-through'>
																			{timeString}
																		</span>
																	</div>
																	<div>
																		<p className='font-medium text-slate-500 line-through'>
																			{patient?.name || t('dashboard.unknownPatient')}
																		</p>
																		<p className='text-xs text-slate-400'>
																			{t('dashboard.finished')}
																		</p>
																	</div>
																</div>
																<ChevronRight className='h-5 w-5 text-slate-300' />
															</Link>
														);
													})}
												</div>
											</div>
										)}
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			)}
		</main>
	);
}

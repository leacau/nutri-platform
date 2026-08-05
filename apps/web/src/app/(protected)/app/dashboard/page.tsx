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

export default function DashboardPage() {
	const { activeClinicId, activeClinic, activeMembership, platformRole } =
		useClinic();
	const { idToken, user } = useAuth();
	const router = useRouter();
	const qc = useQueryClient();

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

	const arriveMutation = useMutation({
		mutationFn: async (apptId: string) =>
			apiClient.arriveAppointment(
				apptId,
				activeClinicId || '',
				idToken || undefined,
			),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
	});

	// Filtramos TODOS los turnos de hoy que NO estén cancelados
	const todayAppointments =
		isMounted && appointments
			? appointments.filter(
					(appt) =>
						appt.status !== 'cancelled' &&
						isSameDay(appt.scheduledFor, todayDateString),
				)
			: [];

	// 1. En Sala de Espera
	const arrivedAppointments = todayAppointments
		.filter((appt) => appt.status === 'arrived')
		.sort((a, b) => {
			const dateA = parseSafeDate(a.arrivedAt || a.scheduledFor);
			const dateB = parseSafeDate(b.arrivedAt || b.scheduledFor);
			return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
		});

	// 2. Próximos
	const scheduledAppointments = todayAppointments
		.filter((appt) => appt.status === 'scheduled')
		.sort((a, b) => {
			const dateA = parseSafeDate(a.scheduledFor);
			const dateB = parseSafeDate(b.scheduledFor);
			return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
		});

	// 3. Atendidos (NUEVO)
	const completedAppointments = todayAppointments
		.filter((appt) => appt.status === 'completed')
		.sort((a, b) => {
			const dateA = parseSafeDate(a.completedAt || a.scheduledFor);
			const dateB = parseSafeDate(b.completedAt || b.scheduledFor);
			// Ordenamos descendentemente (el último atendido aparece primero en esta sub-lista)
			return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
		});

	const totalPatients = patients?.length || 0;
	const isLoading = isLoadingPatients || isLoadingAppts || !isMounted;

	if (!isMounted) return null;

	return (
		<main className='mx-auto max-w-6xl px-6 py-8'>
			<div className='mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4'>
				<div>
					<h1 className='text-3xl font-bold text-slate-900 tracking-tight'>
						¡Hola, {user?.displayName?.split(' ')[0] || 'Doc'}! 👋
					</h1>
					<p className='text-slate-500 mt-1'>
						Acá tenés el resumen de tu día en{' '}
						<span className='font-semibold text-slate-700'>
							{activeClinic?.name}
						</span>
						.
					</p>
				</div>
			</div>

			{isLoading ? (
				<div className='flex flex-col items-center justify-center py-20 text-slate-500'>
					<Loader2 className='h-8 w-8 animate-spin mb-4 text-primary' />
					<p>Cargando tu información...</p>
				</div>
			) : (
				<div className='grid grid-cols-1 md:grid-cols-12 gap-6'>
					<div className='md:col-span-8 space-y-6'>
						<div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
							<Card className='border-slate-200 shadow-sm bg-white hover:border-blue-200 transition-colors'>
								<CardContent className='p-6 flex items-center gap-4'>
									<div className='p-4 bg-blue-50 text-blue-600 rounded-full'>
										<Users className='h-6 w-6' />
									</div>
									<div>
										<p className='text-sm font-medium text-slate-500'>
											Total Pacientes
										</p>
										<h3 className='text-3xl font-bold text-slate-900'>
											{totalPatients}
										</h3>
									</div>
								</CardContent>
							</Card>

							<Card className='border-slate-200 shadow-sm bg-white hover:border-emerald-200 transition-colors'>
								<CardContent className='p-6 flex items-center gap-4'>
									<div className='p-4 bg-emerald-50 text-emerald-600 rounded-full'>
										<CalendarIcon className='h-6 w-6' />
									</div>
									<div>
										<p className='text-sm font-medium text-slate-500'>
											Turnos Hoy
										</p>
										<h3 className='text-3xl font-bold text-slate-900'>
											{todayAppointments.length}
										</h3>
									</div>
								</CardContent>
							</Card>

							<Card className='border-slate-200 shadow-sm bg-white hover:border-amber-200 transition-colors'>
								<CardContent className='p-6 flex items-center gap-4'>
									<div className='p-4 bg-amber-50 text-amber-600 rounded-full'>
										<UserCheck className='h-6 w-6' />
									</div>
									<div>
										<p className='text-sm font-medium text-slate-500'>
											En espera
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
								<CardTitle className='text-lg'>Accesos Rápidos</CardTitle>
								<CardDescription>
									Acciones frecuentes para gestionar tu clínica.
								</CardDescription>
							</CardHeader>
							<CardContent className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
								<Button
									size='lg'
									className='h-20 bg-slate-50 hover:bg-blue-50 text-slate-700 border border-slate-200 hover:border-blue-200 justify-start px-6 transition-all'
									onClick={() => router.push('/app/patients')}
								>
									<div className='flex items-center gap-4'>
										<div className='bg-white p-2 rounded-full shadow-sm'>
											<UserPlus className='h-5 w-5 text-blue-600' />
										</div>
										<div className='text-left'>
											<p className='font-semibold text-base'>Nuevo Paciente</p>
											<p className='text-xs font-normal text-slate-500'>
												Agregar a la base
											</p>
										</div>
									</div>
								</Button>

								<Button
									size='lg'
									className='h-20 bg-slate-50 hover:bg-emerald-50 text-slate-700 border border-slate-200 hover:border-emerald-200 justify-start px-6 transition-all'
									onClick={() => router.push('/app/appointments')}
								>
									<div className='flex items-center gap-4'>
										<div className='bg-white p-2 rounded-full shadow-sm'>
											<CalendarPlus className='h-5 w-5 text-emerald-600' />
										</div>
										<div className='text-left'>
											<p className='font-semibold text-base'>Nuevo Turno</p>
											<p className='text-xs font-normal text-slate-500'>
												Agendar consulta
											</p>
										</div>
									</div>
								</Button>
							</CardContent>
						</Card>
					</div>

					<div className='md:col-span-4'>
						<Card className='border-slate-200 shadow-sm h-full flex flex-col'>
							<CardHeader className='pb-3 border-b border-slate-100 bg-slate-50/50'>
								<CardTitle className='text-lg flex items-center justify-between'>
									<span>Agenda de Hoy</span>
									<Badge
										variant='secondary'
										className='bg-blue-100 text-blue-800 hover:bg-blue-100'
									>
										{formatDate(new Date().toISOString())}
									</Badge>
								</CardTitle>
							</CardHeader>

							<CardContent className='p-0 flex-1 overflow-y-auto max-h-[500px]'>
								{todayAppointments.length === 0 ? (
									<div className='p-8 text-center flex flex-col items-center justify-center h-full text-slate-500'>
										<div className='bg-slate-50 p-4 rounded-full mb-3 border border-slate-100'>
											<CalendarIcon className='h-8 w-8 text-slate-300' />
										</div>
										<p className='font-medium text-slate-600'>
											No hay turnos para hoy
										</p>
										<p className='text-sm mt-1'>
											¡Tenés el día libre o para adelantar pendientes!
										</p>
									</div>
								) : (
									<div className='flex flex-col'>
										{/* SECCIÓN 1: SALA DE ESPERA */}
										{arrivedAppointments.length > 0 && (
											<div className='bg-emerald-50/50 border-b border-slate-100'>
												<div className='px-4 py-2 border-b border-emerald-100/50 flex justify-between items-center'>
													<span className='text-xs font-bold text-emerald-800 uppercase tracking-wider'>
														En Sala de Espera
													</span>
													<span className='text-xs font-bold bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full'>
														{arrivedAppointments.length}
													</span>
												</div>
												<div className='divide-y divide-emerald-100/50'>
													{arrivedAppointments.map((appt) => {
														const apptDate = parseSafeDate(appt.scheduledFor);
														const timeString = apptDate
															? apptDate.toLocaleTimeString('es-AR', {
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
																className='flex items-center justify-between p-4 hover:bg-emerald-50 transition-colors group relative overflow-hidden'
															>
																<div className='absolute left-0 top-0 bottom-0 w-1 bg-emerald-500'></div>
																<div className='flex items-center gap-4 pl-2'>
																	<div className='flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-white text-emerald-700 border border-emerald-200 shadow-sm'>
																		<UserCheck className='h-4 w-4 mb-0.5 text-emerald-600' />
																		<span className='text-xs font-bold'>
																			{timeString}
																		</span>
																	</div>
																	<div>
																		<p className='font-bold text-slate-900 group-hover:text-emerald-700 transition-colors'>
																			{patient?.name || 'Paciente Desconocido'}
																		</p>
																		<p className='text-xs text-emerald-600 font-medium'>
																			Listo para atender
																		</p>
																	</div>
																</div>
																<ChevronRight className='h-5 w-5 text-emerald-300 group-hover:text-emerald-600 transition-colors' />
															</Link>
														);
													})}
												</div>
											</div>
										)}

										{/* SECCIÓN 2: AUN NO LLEGARON */}
										{scheduledAppointments.length > 0 && (
											<div>
												<div className='px-4 py-2 bg-slate-50 border-b border-slate-100 flex justify-between items-center'>
													<span className='text-xs font-bold text-slate-500 uppercase tracking-wider'>
														Aun no llegaron
													</span>
												</div>
												<div className='divide-y divide-slate-100'>
													{scheduledAppointments.map((appt) => {
														const apptDate = parseSafeDate(appt.scheduledFor);
														const timeString = apptDate
															? apptDate.toLocaleTimeString('es-AR', {
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
																className='flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group'
															>
																<Link
																	href={`/app/patients/${appt.patientId}`}
																	className='flex-1 flex items-center gap-4'
																>
																	<div className='flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-white text-slate-700 border border-slate-200 shadow-sm group-hover:border-primary/30 transition-colors'>
																		<Clock className='h-4 w-4 mb-0.5 text-slate-400 group-hover:text-primary transition-colors' />
																		<span className='text-xs font-bold'>
																			{timeString}
																		</span>
																	</div>
																	<div>
																		<p className='font-semibold text-slate-900 group-hover:text-primary transition-colors'>
																			{patient?.name || 'Paciente Desconocido'}
																		</p>
																		<p className='text-xs text-slate-500'>
																			Consulta General
																		</p>
																	</div>
																</Link>
																<div className='flex items-center gap-2'>
																	<Button
																		size='sm'
																		variant='outline'
																		className='h-8 text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200'
																		onClick={(e) => {
																			e.preventDefault();
																			arriveMutation.mutate(appt.id);
																		}}
																		disabled={arriveMutation.isPending}
																	>
																		<CheckCircle2 className='h-3.5 w-3.5 mr-1' />{' '}
																		Llegó
																	</Button>
																</div>
															</div>
														);
													})}
												</div>
											</div>
										)}

										{/* SECCIÓN 3: ATENDIDOS */}
										{completedAppointments.length > 0 && (
											<div className='opacity-75'>
												<div className='px-4 py-2 bg-slate-100 border-b border-slate-200 flex justify-between items-center'>
													<span className='text-xs font-bold text-slate-400 uppercase tracking-wider'>
														Atendidos
													</span>
													<span className='text-xs font-bold text-slate-400'>
														{completedAppointments.length}
													</span>
												</div>
												<div className='divide-y divide-slate-100 bg-slate-50/50'>
													{completedAppointments.map((appt) => {
														const apptDate = parseSafeDate(appt.scheduledFor);
														const timeString = apptDate
															? apptDate.toLocaleTimeString('es-AR', {
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
																className='flex items-center justify-between p-4 hover:bg-slate-100 transition-colors group'
															>
																<div className='flex items-center gap-4'>
																	<div className='flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 shadow-sm'>
																		<CheckCheck className='h-4 w-4 mb-0.5 text-slate-400' />
																		<span className='text-xs font-bold line-through'>
																			{timeString}
																		</span>
																	</div>
																	<div>
																		<p className='font-medium text-slate-500 line-through'>
																			{patient?.name || 'Paciente Desconocido'}
																		</p>
																		<p className='text-xs text-slate-400'>
																			Finalizado
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

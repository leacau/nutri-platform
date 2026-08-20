import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
	ActivityIndicator,
	Linking,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
	getIdTokenResult,
	signInWithEmailAndPassword,
	signOut,
	updatePassword,
} from 'firebase/auth';

import { DEFAULT_API_BASE, parseDate, portalApi } from './src/api';
import { getFirebaseAuth } from './src/firebase';
import type {
	Appointment,
	AppointmentAvailableDay,
	AppointmentSlot,
	ClinicalRecord,
	FoodLogDayKey,
	FoodLogDays,
	FoodLogMealKey,
	Patient,
	SessionResponse,
	UserAccount,
} from './src/types';

type Tab = 'home' | 'appointments' | 'foodLog' | 'records' | 'profile';
type PatientClinic = SessionResponse['patientClinics'][number];

const dayKeys: FoodLogDayKey[] = [
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday',
	'sunday',
];

const mealKeys: FoodLogMealKey[] = [
	'breakfast',
	'morningSnack',
	'lunch',
	'afternoonSnack',
	'dinner',
];

const dayLabels: Record<FoodLogDayKey, string> = {
	monday: 'Lunes',
	tuesday: 'Martes',
	wednesday: 'Miércoles',
	thursday: 'Jueves',
	friday: 'Viernes',
	saturday: 'Sábado',
	sunday: 'Domingo',
};

const mealLabels: Record<FoodLogMealKey, string> = {
	breakfast: 'Desayuno',
	morningSnack: 'Colación',
	lunch: 'Almuerzo',
	afternoonSnack: 'Colación',
	dinner: 'Cena',
};

function createEmptyDays(): FoodLogDays {
	return Object.fromEntries(
		dayKeys.map((day) => [
			day,
			Object.fromEntries(
				mealKeys.map((meal) => [meal, { time: '', detail: '' }]),
			),
		]),
	) as FoodLogDays;
}

function toIsoDate(date: Date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function mondayFor(date: Date) {
	const next = new Date(date);
	const day = next.getDay();
	const diff = day === 0 ? -6 : 1 - day;
	next.setDate(next.getDate() + diff);
	next.setHours(0, 0, 0, 0);
	return next;
}

function monthKeyFor(date: Date) {
	return toIsoDate(new Date(date.getFullYear(), date.getMonth(), 1)).slice(0, 7);
}

function monthBounds(monthKey: string) {
	const [year = '0', month = '1'] = monthKey.split('-');
	const first = new Date(Number(year), Number(month) - 1, 1);
	const last = new Date(Number(year), Number(month), 0);
	return { first, last, from: toIsoDate(first), to: toIsoDate(last) };
}

function addMonths(monthKey: string, amount: number) {
	const [year = '0', month = '1'] = monthKey.split('-');
	const next = new Date(Number(year), Number(month) - 1 + amount, 1);
	return monthKeyFor(next);
}

function calendarCells(monthKey: string) {
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
}

function accountUid(account: UserAccount) {
	return account.uid || account.id;
}

function completedMealsForDay(days: FoodLogDays, day: FoodLogDayKey) {
	return mealKeys.filter((meal) => {
		const entry = days[day][meal];
		return entry.time.trim() || entry.detail.trim();
	}).length;
}

function formatDate(value: unknown) {
	const date = parseDate(value);
	if (!date) return 'Sin fecha';
	return new Intl.DateTimeFormat('es-AR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).format(date);
}

function cardTitleForRecord(record: ClinicalRecord) {
	if (record.type === 'meal_plan') return 'Plan de alimentacion';
	if (record.type === 'prescription') return 'Receta / indicaciones';
	if (record.type === 'dynamic_measurement') return 'Mediciones';
	return 'Evolucion clinica';
}

function PatientPortalApp() {
	const insets = useSafeAreaInsets();
	const apiBase = DEFAULT_API_BASE;
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [newPasswordRepeat, setNewPasswordRepeat] = useState('');
	const [tab, setTab] = useState<Tab>('home');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [authToken, setAuthToken] = useState<string | null>(null);
	const [pendingPasswordToken, setPendingPasswordToken] = useState<string | null>(
		null,
	);
	const [session, setSession] = useState<SessionResponse | null>(null);
	const [selectedPatientClinic, setSelectedPatientClinic] =
		useState<PatientClinic | null>(null);
	const [patient, setPatient] = useState<Patient | null>(null);
	const [appointments, setAppointments] = useState<Appointment[]>([]);
	const [records, setRecords] = useState<ClinicalRecord[]>([]);
	const [professionals, setProfessionals] = useState<UserAccount[]>([]);
	const [weekStart] = useState(() => toIsoDate(mondayFor(new Date())));
	const [foodLogDays, setFoodLogDays] = useState<FoodLogDays>(() =>
		createEmptyDays(),
	);
	const [sharedWithProfessionalUids, setSharedWithProfessionalUids] = useState<
		string[]
	>([]);
	const [saveMessage, setSaveMessage] = useState<string | null>(null);
	const [appointmentDate, setAppointmentDate] = useState(() => toIsoDate(new Date()));
	const [appointmentProfessionalUid, setAppointmentProfessionalUid] = useState('');
	const [appointmentVisibleMonth, setAppointmentVisibleMonth] = useState(() =>
		monthKeyFor(new Date()),
	);
	const [availableDays, setAvailableDays] = useState<AppointmentAvailableDay[]>([]);
	const [appointmentSlots, setAppointmentSlots] = useState<AppointmentSlot[]>([]);
	const [selectedSlotStartsAt, setSelectedSlotStartsAt] = useState('');
	const [expandedFoodDay, setExpandedFoodDay] =
		useState<FoodLogDayKey>('monday');

	const activePatientClinic =
		selectedPatientClinic ??
		(session?.patientClinics.length === 1 ? session.patientClinics[0] : null);
	const clinicId = activePatientClinic?.clinicId || null;
	const patientId = activePatientClinic?.patientId || null;
	const safeScreenStyle = [styles.screen, { paddingTop: insets.top }];
	const assignedProfessionals = useMemo(() => {
		const assigned = new Set(patient?.assignedProfessionalUids ?? []);
		return professionals.filter((professional) =>
			assigned.has(accountUid(professional)),
		);
	}, [patient?.assignedProfessionalUids, professionals]);
	const availableDaysByDate = useMemo(
		() => new Map(availableDays.map((day) => [day.date, day])),
		[availableDays],
	);

	const nextAppointment = useMemo(() => {
		const now = Date.now();
		return appointments
			.filter((item) => item.status === 'scheduled')
			.map((item) => ({ item, date: parseDate(item.scheduledFor) }))
			.filter((item) => item.date && item.date.getTime() >= now)
			.sort((a, b) => a.date!.getTime() - b.date!.getTime())[0]?.item;
	}, [appointments]);

	function professionalName(uid?: string | null) {
		if (!uid) return 'Profesional a confirmar';
		return (
			professionals.find((professional) => accountUid(professional) === uid)
				?.name ?? 'Profesional asignado'
		);
	}

	async function loadPortalData(
		nextToken: string,
		nextSession: SessionResponse,
		nextPatientClinic: PatientClinic,
	) {
		const nextClinic = nextPatientClinic.clinicId;
		const nextPatient = nextPatientClinic.patientId;

			const [nextPatientData, nextAppointments] = await Promise.all([
				portalApi.patient(apiBase, nextToken, nextClinic, nextPatient),
				portalApi.appointments(apiBase, nextToken, nextClinic),
			]);

			const [recordsResult, professionalsResult, foodLogsResult] =
				await Promise.allSettled([
					portalApi.records(apiBase, nextToken, nextClinic, nextPatient),
					portalApi.professionals(apiBase, nextToken, nextClinic),
					portalApi.foodLogs(apiBase, nextToken, nextClinic, nextPatient, weekStart),
				]);

			const nextRecords =
				recordsResult.status === 'fulfilled' ? recordsResult.value : [];
			const nextProfessionals =
				professionalsResult.status === 'fulfilled'
					? professionalsResult.value
					: [];
			const nextFoodLogs =
				foodLogsResult.status === 'fulfilled' ? foodLogsResult.value : [];

			setSession(nextSession);
			setSelectedPatientClinic(nextPatientClinic);
			setPatient(nextPatientData);
			setProfessionals(nextProfessionals);
			setAppointments(
				nextAppointments
					.filter((item) => item.patientId === nextPatient)
					.sort(
						(a, b) =>
							(parseDate(b.scheduledFor || b.requestedAt)?.getTime() || 0) -
							(parseDate(a.scheduledFor || a.requestedAt)?.getTime() || 0),
					),
			);
			const assignedProfessionalIds = new Set(
				nextPatientData.assignedProfessionalUids ?? [],
			);
			const availableAssignedProfessionalUids = nextProfessionals
				.filter((professional) => assignedProfessionalIds.has(accountUid(professional)))
				.map((professional) => accountUid(professional));
			const currentFoodLog = nextFoodLogs[0];

			setRecords(nextRecords);
			setFoodLogDays(currentFoodLog?.days ?? createEmptyDays());
			setSharedWithProfessionalUids(
				(currentFoodLog?.sharedWithProfessionalUids ?? availableAssignedProfessionalUids)
					.filter((uid) => availableAssignedProfessionalUids.includes(uid)),
			);
			setAppointmentProfessionalUid(availableAssignedProfessionalUids[0] ?? '');
			setAppointmentVisibleMonth(monthKeyFor(new Date()));
			setAppointmentDate('');
			setAvailableDays([]);
			setAppointmentSlots([]);
			setSelectedSlotStartsAt('');
			setSaveMessage(null);
			setTab('home');
	}

	async function loadPortal(nextToken: string) {
		setLoading(true);
		setError(null);
		try {
			const nextSession = await portalApi.session(apiBase, nextToken);
			const patientClinics = nextSession.patientClinics ?? [];

			if (patientClinics.length === 0) {
				throw new Error(
					'No encontramos un portal paciente habilitado para este usuario.',
				);
			}

			setAuthToken(nextToken);
			setSession(nextSession);

			if (patientClinics.length > 1) {
				setSelectedPatientClinic(null);
				setPatient(null);
				setAppointments([]);
				setRecords([]);
				return;
			}

			await loadPortalData(nextToken, nextSession, patientClinics[0]!);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'No se pudo cargar el portal.');
		} finally {
			setLoading(false);
		}
	}

	async function selectPatientClinic(nextPatientClinic: PatientClinic) {
		if (!authToken || !session) return;
		setLoading(true);
		setError(null);
		try {
			await loadPortalData(authToken, session, nextPatientClinic);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'No se pudo cargar el portal.');
		} finally {
			setLoading(false);
		}
	}

	async function loginPatient() {
		const cleanEmail = email.trim();

		if (!cleanEmail || !password) {
			setError('Ingresá tu email y contraseña.');
			return;
		}

		setLoading(true);
		setError(null);
		try {
			const credentials = await signInWithEmailAndPassword(
				getFirebaseAuth(),
				cleanEmail,
				password,
			);
			const tokenResult = await getIdTokenResult(credentials.user, true);
			const nextToken = tokenResult.token;
			if (tokenResult.claims.forcePasswordChange === true) {
				setAuthToken(nextToken);
				setPendingPasswordToken(nextToken);
				setLoading(false);
				return;
			}
			await loadPortal(nextToken);
		} catch {
			setError('No pudimos iniciar sesión. Revisá tus datos e intentá nuevamente.');
			setLoading(false);
		}
	}

	async function completeRequiredPasswordChange() {
		if (!pendingPasswordToken) return;
		if (newPassword.length < 8) {
			setError('La nueva contraseña debe tener al menos 8 caracteres.');
			return;
		}
		if (newPassword !== newPasswordRepeat) {
			setError('Las contraseñas no coinciden.');
			return;
		}

		setLoading(true);
		setError(null);
		try {
			const auth = getFirebaseAuth();
			if (!auth.currentUser) throw new Error('Sin usuario autenticado');
			await updatePassword(auth.currentUser, newPassword);
			await portalApi.completeRequiredPasswordChange(apiBase, pendingPasswordToken);
			const nextToken = await auth.currentUser.getIdToken(true);
			setPendingPasswordToken(null);
			setNewPassword('');
			setNewPasswordRepeat('');
			await loadPortal(nextToken);
		} catch {
			setError('No pudimos guardar la nueva contraseña. Volvé a ingresar e intentá nuevamente.');
			setLoading(false);
		}
	}

	function updateFoodLogEntry(
		day: FoodLogDayKey,
		meal: FoodLogMealKey,
		field: 'time' | 'detail',
		value: string,
	) {
		setFoodLogDays((current) => ({
			...current,
			[day]: {
				...current[day],
				[meal]: {
					...current[day][meal],
					[field]: value,
				},
			},
		}));
	}

	function toggleSharedProfessional(uid: string) {
		setSharedWithProfessionalUids((current) =>
			current.includes(uid)
				? current.filter((item) => item !== uid)
				: [...current, uid],
		);
	}

	async function saveFoodLog() {
		if (!authToken || !clinicId || !patientId) return;
		setLoading(true);
		setError(null);
		setSaveMessage(null);
		try {
			await portalApi.saveFoodLog(apiBase, authToken, clinicId, {
				patientId,
				weekStart,
				days: foodLogDays,
				sharedWithProfessionalUids,
			});
			setSaveMessage('Registro de comidas guardado.');
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: 'No pudimos guardar el registro de comidas.',
			);
		} finally {
			setLoading(false);
		}
	}

	async function loadAppointmentAvailableDays(
		nextProfessionalUid = appointmentProfessionalUid,
		nextMonth = appointmentVisibleMonth,
	) {
		if (!authToken || !clinicId || !nextProfessionalUid) {
			setAvailableDays([]);
			return;
		}
		const bounds = monthBounds(nextMonth);
		try {
			const response = await portalApi.availableDays(
				apiBase,
				authToken,
				clinicId,
				nextProfessionalUid,
				bounds.from,
				bounds.to,
			);
			setAvailableDays(response.days);
		} catch {
			setAvailableDays([]);
		}
	}

	async function loadAppointmentSlots() {
		if (!authToken || !clinicId || !appointmentProfessionalUid || !appointmentDate) {
			setError('Elegí profesional y fecha para ver horarios disponibles.');
			return;
		}
		setLoading(true);
		setError(null);
		setSelectedSlotStartsAt('');
		try {
			const response = await portalApi.slots(
				apiBase,
				authToken,
				clinicId,
				appointmentProfessionalUid,
				appointmentDate,
			);
			setAppointmentSlots(response.slots);
		} catch (err) {
			setAppointmentSlots([]);
			setError(
				err instanceof Error
					? err.message
					: 'No pudimos cargar los horarios disponibles.',
			);
		} finally {
			setLoading(false);
		}
	}

	async function loadAppointmentSlotsForDate(nextDate: string) {
		if (!authToken || !clinicId || !appointmentProfessionalUid || !nextDate) {
			setError('Elegí profesional y fecha para ver horarios disponibles.');
			return;
		}
		setLoading(true);
		setError(null);
		setSelectedSlotStartsAt('');
		try {
			const response = await portalApi.slots(
				apiBase,
				authToken,
				clinicId,
				appointmentProfessionalUid,
				nextDate,
			);
			setAppointmentSlots(response.slots);
		} catch (err) {
			setAppointmentSlots([]);
			setError(
				err instanceof Error
					? err.message
					: 'No pudimos cargar los horarios disponibles.',
			);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		if (tab !== 'appointments') return;
		void loadAppointmentAvailableDays();
	}, [tab, authToken, clinicId, appointmentProfessionalUid, appointmentVisibleMonth]);

	async function requestAppointment() {
		if (!authToken || !clinicId || !appointmentProfessionalUid || !selectedSlotStartsAt) {
			setError('Elegí un horario disponible antes de confirmar.');
			return;
		}
		setLoading(true);
		setError(null);
		try {
			await portalApi.requestAppointment(apiBase, authToken, clinicId, {
				professionalUid: appointmentProfessionalUid,
				scheduledFor: selectedSlotStartsAt,
			});
			if (session && activePatientClinic) {
				await loadPortalData(authToken, session, activePatientClinic);
			}
			setTab('appointments');
			setSaveMessage('Turno reservado.');
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'No pudimos reservar el turno.',
			);
		} finally {
			setLoading(false);
		}
	}

	async function cancelAppointment(appointmentId: string) {
		if (!authToken || !clinicId) return;
		setLoading(true);
		setError(null);
		setSaveMessage(null);
		try {
			await portalApi.cancelAppointment(
				apiBase,
				authToken,
				clinicId,
				appointmentId,
			);
			if (session && activePatientClinic) {
				await loadPortalData(authToken, session, activePatientClinic);
			}
			setSaveMessage('Turno cancelado.');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'No pudimos cancelar el turno.');
		} finally {
			setLoading(false);
		}
	}

	async function logoutPatient() {
		await signOut(getFirebaseAuth()).catch(() => undefined);
		setPassword('');
		setNewPassword('');
		setNewPasswordRepeat('');
		setAuthToken(null);
		setPendingPasswordToken(null);
		setSession(null);
		setSelectedPatientClinic(null);
		setPatient(null);
		setAppointments([]);
		setRecords([]);
		setProfessionals([]);
		setFoodLogDays(createEmptyDays());
		setSharedWithProfessionalUids([]);
		setSaveMessage(null);
		setAppointmentProfessionalUid('');
		setAppointmentVisibleMonth(monthKeyFor(new Date()));
		setAppointmentDate('');
		setAvailableDays([]);
		setAppointmentSlots([]);
		setSelectedSlotStartsAt('');
		setTab('home');
	}

	if (session && session.patientClinics.length > 1 && !selectedPatientClinic) {
		return (
			<View style={safeScreenStyle}>
				<ScrollView contentContainerStyle={styles.login}>
					<Text style={styles.eyebrow}>AMSA Core</Text>
					<Text style={styles.title}>Elegí tu portal</Text>
					<Text style={styles.subtitle}>
						Tu usuario tiene acceso como paciente en más de un espacio.
						Seleccioná dónde querés ingresar.
					</Text>
					{session.patientClinics.map((patientClinic) => (
						<Pressable
							key={`${patientClinic.clinicId}-${patientClinic.patientId}`}
							style={styles.selectorButton}
							onPress={() => selectPatientClinic(patientClinic)}
						>
							<View>
								<Text style={styles.selectorTitle}>
									{patientClinic.clinicName || 'Portal paciente'}
								</Text>
								<Text style={styles.muted}>Acceso paciente habilitado</Text>
							</View>
							<Ionicons
								name='chevron-forward-outline'
								size={20}
								color='#0f2f4f'
							/>
						</Pressable>
					))}
					{loading ? <ActivityIndicator color='#0f2f4f' /> : null}
					{error ? <Text style={styles.error}>{error}</Text> : null}
					<Pressable style={styles.secondaryButton} onPress={logoutPatient}>
						<Text style={styles.secondaryButtonText}>Salir</Text>
					</Pressable>
				</ScrollView>
			</View>
		);
	}

	if (!session || !clinicId || !patientId) {
		return (
			<View style={safeScreenStyle}>
				<ScrollView contentContainerStyle={styles.login}>
					<Text style={styles.eyebrow}>AMSA Core</Text>
					<Text style={styles.title}>Portal paciente</Text>
					{pendingPasswordToken ? (
						<>
							<Text style={styles.subtitle}>
								Por seguridad, reemplazá la contraseña provisoria por una contraseña personal.
							</Text>
							<Text style={styles.label}>Nueva contraseña</Text>
							<TextInput
								style={styles.input}
								value={newPassword}
								secureTextEntry
								textContentType='newPassword'
								onChangeText={setNewPassword}
							/>
							<Text style={styles.label}>Repetir contraseña</Text>
							<TextInput
								style={styles.input}
								value={newPasswordRepeat}
								secureTextEntry
								textContentType='newPassword'
								onChangeText={setNewPasswordRepeat}
							/>
							<Pressable
								style={styles.primaryButton}
								onPress={completeRequiredPasswordChange}
							>
								{loading ? (
									<ActivityIndicator color='#fff' />
								) : (
									<Text style={styles.primaryButtonText}>Guardar contraseña</Text>
								)}
							</Pressable>
						</>
					) : (
						<>
							<Text style={styles.subtitle}>
								Ingresá con el email y la contraseña que te dio tu clínica para ver
								tus turnos e historia clínica habilitada.
							</Text>
							<Text style={styles.label}>Email</Text>
							<TextInput
								style={styles.input}
								value={email}
								keyboardType='email-address'
								autoCapitalize='none'
								autoCorrect={false}
								textContentType='emailAddress'
								onChangeText={setEmail}
							/>
							<Text style={styles.label}>Contraseña</Text>
							<TextInput
								style={styles.input}
								value={password}
								secureTextEntry
								textContentType='password'
								onChangeText={setPassword}
							/>
							<Pressable style={styles.primaryButton} onPress={loginPatient}>
								{loading ? (
									<ActivityIndicator color='#fff' />
								) : (
									<Text style={styles.primaryButtonText}>Entrar</Text>
								)}
							</Pressable>
						</>
					)}
					{error ? <Text style={styles.error}>{error}</Text> : null}
				</ScrollView>
			</View>
		);
	}

	return (
			<View style={safeScreenStyle}>
				<View style={styles.header}>
					<View>
						<Text style={styles.eyebrow}>Espacio activo</Text>
						<Text style={styles.headerTitle}>
							{activePatientClinic?.clinicName || 'Portal paciente'}
						</Text>
					</View>
					<Pressable onPress={logoutPatient} style={styles.iconButton}>
						<Ionicons name='log-out-outline' size={20} color='#0f2f4f' />
					</Pressable>
				</View>

			<ScrollView contentContainerStyle={styles.content}>
				{tab === 'home' ? (
					<>
						<Text style={styles.title}>Hola, {patient?.name || 'paciente'}</Text>
						<View style={styles.card}>
							<Text style={styles.cardLabel}>Proximo turno</Text>
							<Text style={styles.cardTitle}>
								{nextAppointment
									? formatDate(nextAppointment.scheduledFor)
									: 'No tenes turnos programados'}
							</Text>
							<Text style={styles.muted}>
								{nextAppointment
									? professionalName(nextAppointment.professionalUid)
									: 'Cuando tengas un turno, lo vas a ver acá.'}
							</Text>
						</View>
						<View style={styles.metricsRow}>
							<Metric label='Turnos' value={appointments.length} />
							<Metric label='Historia' value={records.length} />
						</View>
					</>
				) : null}

				{tab === 'appointments'
					? (
						<>
							<View style={styles.card}>
								<Text style={styles.cardLabel}>Reservar turno</Text>
								<Text style={styles.muted}>
									Elegí un profesional asignado y un horario disponible.
								</Text>
								<Text style={styles.label}>Profesional</Text>
								<View style={styles.chips}>
									{assignedProfessionals.map((professional) => {
										const uid = accountUid(professional);
										const selected = appointmentProfessionalUid === uid;
										return (
											<Pressable
												key={uid}
												style={[styles.chip, selected ? styles.chipSelected : null]}
												onPress={() => {
													setAppointmentProfessionalUid(uid);
													setAppointmentSlots([]);
													setSelectedSlotStartsAt('');
												}}
											>
												<Text
													style={[
														styles.chipText,
														selected ? styles.chipTextSelected : null,
													]}
												>
													{professional.name}
												</Text>
											</Pressable>
										);
									})}
								</View>
								{!assignedProfessionals.length ? (
									<Text style={styles.muted}>
										Todavía no tenés profesionales asignados para solicitar turnos.
									</Text>
								) : null}
								<View style={styles.calendarHeader}>
									<Pressable
										style={styles.calendarNav}
										onPress={() => {
											const nextMonth = addMonths(appointmentVisibleMonth, -1);
											setAppointmentVisibleMonth(nextMonth);
											setAppointmentDate('');
											setAppointmentSlots([]);
											setSelectedSlotStartsAt('');
										}}
									>
										<Ionicons name='chevron-back' size={18} color='#0f2f4f' />
									</Pressable>
									<Text style={styles.calendarTitle}>
										{monthBounds(appointmentVisibleMonth).first.toLocaleDateString(
											'es-AR',
											{ month: 'long', year: 'numeric' },
										)}
									</Text>
									<Pressable
										style={styles.calendarNav}
										onPress={() => {
											const nextMonth = addMonths(appointmentVisibleMonth, 1);
											setAppointmentVisibleMonth(nextMonth);
											setAppointmentDate('');
											setAppointmentSlots([]);
											setSelectedSlotStartsAt('');
										}}
									>
										<Ionicons name='chevron-forward' size={18} color='#0f2f4f' />
									</Pressable>
								</View>
								<View style={styles.weekHeader}>
									{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, index) => (
										<Text key={`${label}-${index}`} style={styles.weekHeaderText}>
											{label}
										</Text>
									))}
								</View>
								<View style={styles.calendarGrid}>
									{calendarCells(appointmentVisibleMonth).map((cell) => {
										const day = availableDaysByDate.get(cell.date);
										const selected = appointmentDate === cell.date;
										return (
											<Pressable
												key={cell.date}
												disabled={!cell.inMonth || !day}
												style={[
													styles.calendarDay,
													selected ? styles.calendarDaySelected : null,
													day ? styles.calendarDayAvailable : null,
													!cell.inMonth ? styles.calendarDayOutside : null,
												]}
												onPress={() => {
													setAppointmentDate(cell.date);
													setAppointmentSlots([]);
													setSelectedSlotStartsAt('');
													void loadAppointmentSlotsForDate(cell.date);
												}}
											>
												<Text
													style={[
														styles.calendarDayText,
														selected ? styles.calendarDayTextSelected : null,
													]}
												>
													{Number(cell.date.slice(8, 10))}
												</Text>
												{day ? (
													<Text
														style={[
															styles.calendarDayMeta,
															selected ? styles.calendarDayTextSelected : null,
														]}
													>
														{day.freeCount}
													</Text>
												) : null}
											</Pressable>
										);
									})}
								</View>
								{appointmentSlots.length ? (
									<View style={styles.slotGrid}>
										{appointmentSlots.map((slot) => {
											const selected = selectedSlotStartsAt === slot.startsAt;
											return (
												<Pressable
													key={slot.startsAt}
													disabled={!slot.available}
													style={[
														styles.slotButton,
														selected ? styles.slotSelected : null,
														!slot.available ? styles.slotDisabled : null,
													]}
													onPress={() => setSelectedSlotStartsAt(slot.startsAt)}
												>
													<Text
														style={[
															styles.slotText,
															selected ? styles.slotSelectedText : null,
															!slot.available ? styles.slotDisabledText : null,
														]}
													>
														{slot.time}
													</Text>
												</Pressable>
											);
										})}
									</View>
								) : null}
								<Pressable
									style={[
										styles.primaryButton,
										!selectedSlotStartsAt ? styles.disabledButton : null,
									]}
									onPress={requestAppointment}
									disabled={!selectedSlotStartsAt || loading}
								>
									{loading ? (
										<ActivityIndicator color='#fff' />
									) : (
										<Text style={styles.primaryButtonText}>Confirmar turno</Text>
									)}
								</Pressable>
								{saveMessage ? <Text style={styles.success}>{saveMessage}</Text> : null}
								{error ? <Text style={styles.error}>{error}</Text> : null}
							</View>
							{appointments.length ? (
								appointments.map((appointment) => (
									<View key={appointment.id} style={styles.card}>
										<Text style={styles.badge}>{appointment.status}</Text>
										<Text style={styles.cardTitle}>
											{formatDate(appointment.scheduledFor || appointment.requestedAt)}
										</Text>
										<Text style={styles.muted}>
											{professionalName(appointment.professionalUid)}
										</Text>
										{appointment.status !== 'cancelled' &&
										appointment.status !== 'completed' ? (
											<Pressable
												style={styles.secondaryButton}
												onPress={() => cancelAppointment(appointment.id)}
												disabled={loading}
											>
												<Text style={styles.secondaryButtonText}>
													Cancelar turno
												</Text>
											</Pressable>
										) : null}
									</View>
								))
							) : (
								<EmptyState
									title='No tenés turnos para mostrar'
									body='Cuando reserves un turno o tu profesional agende uno, aparecerá en esta sección.'
								/>
							)}
						</>
					)
					: null}

				{tab === 'foodLog' ? (
					<View style={styles.foodLog}>
						<View style={styles.card}>
							<Text style={styles.cardLabel}>Registro de comidas</Text>
							<Text style={styles.cardTitle}>Semana del {weekStart}</Text>
							<Text style={styles.muted}>
								Completá hora y detalle. Podés compartirlo con uno o varios profesionales asignados.
							</Text>
						</View>

						<View style={styles.card}>
							<Text style={styles.cardLabel}>Compartir con</Text>
							{assignedProfessionals.length ? (
								<View style={styles.chips}>
									{assignedProfessionals.map((professional) => {
										const uid = accountUid(professional);
										const selected = sharedWithProfessionalUids.includes(uid);
										return (
											<Pressable
												key={uid}
												style={[styles.chip, selected ? styles.chipSelected : null]}
												onPress={() => toggleSharedProfessional(uid)}
											>
												<Text
													style={[
														styles.chipText,
														selected ? styles.chipTextSelected : null,
													]}
												>
													{professional.name}
												</Text>
											</Pressable>
										);
									})}
								</View>
							) : (
								<Text style={styles.muted}>
									Todavía no hay profesionales asignados a tu paciente.
								</Text>
							)}
						</View>

						{dayKeys.map((day) => {
							const completedMeals = completedMealsForDay(foodLogDays, day);
							const isComplete = completedMeals === mealKeys.length;
							const isPartial = completedMeals > 0 && !isComplete;
							const isOpen = expandedFoodDay === day;
							return (
							<View key={day} style={styles.card}>
								<Pressable
									style={styles.foodDayHeader}
									onPress={() => setExpandedFoodDay(day)}
								>
									<View style={styles.foodDayTitleWrap}>
										<Ionicons
											name={isOpen ? 'chevron-down' : 'chevron-forward'}
											size={18}
											color='#0f2f4f'
										/>
										<Text style={styles.dayTitle}>{dayLabels[day]}</Text>
									</View>
									{isComplete ? (
										<View style={[styles.dayStatus, styles.dayStatusComplete]}>
											<Ionicons name='checkmark-circle' size={16} color='#047857' />
											<Text style={styles.dayStatusCompleteText}>
												{completedMeals}/{mealKeys.length}
											</Text>
										</View>
									) : isPartial ? (
										<View style={[styles.dayStatus, styles.dayStatusPartial]}>
											<Ionicons name='alert-circle' size={16} color='#b45309' />
											<Text style={styles.dayStatusPartialText}>
												{completedMeals}/{mealKeys.length}
											</Text>
										</View>
									) : null}
								</Pressable>
								{isOpen ? mealKeys.map((meal) => (
									<View key={meal} style={styles.mealBlock}>
										<Text style={styles.label}>{mealLabels[meal]}</Text>
										<TextInput
											style={styles.input}
											value={foodLogDays[day][meal].time}
											placeholder='HH:mm'
											keyboardType='numbers-and-punctuation'
											onChangeText={(value) =>
												updateFoodLogEntry(day, meal, 'time', value)
											}
										/>
										<TextInput
											style={[styles.input, styles.textArea]}
											value={foodLogDays[day][meal].detail}
											placeholder='Detalle de la comida'
											multiline
											onChangeText={(value) =>
												updateFoodLogEntry(day, meal, 'detail', value)
											}
										/>
									</View>
								)) : null}
							</View>
						);
						})}

						<Pressable style={styles.primaryButton} onPress={saveFoodLog}>
							{loading ? (
								<ActivityIndicator color='#fff' />
							) : (
								<Text style={styles.primaryButtonText}>Guardar registro</Text>
							)}
						</Pressable>
						{saveMessage ? <Text style={styles.success}>{saveMessage}</Text> : null}
						{error ? <Text style={styles.error}>{error}</Text> : null}
					</View>
				) : null}

				{tab === 'records'
					? records.length
						? records.map((record) => (
							<View key={record.id} style={styles.card}>
								<Text style={styles.badge}>{cardTitleForRecord(record)}</Text>
								<Text style={styles.cardTitle}>{formatDate(record.date)}</Text>
								<Text style={styles.bodyText}>
									{record.data?.content ||
										record.data?.freeTextContent ||
										record.data?.note ||
										'Registro disponible'}
								</Text>
								{record.data?.pdf?.fileUrl ? (
									<Pressable
										style={styles.secondaryButton}
										onPress={() => Linking.openURL(record.data!.pdf!.fileUrl!)}
									>
										<Text style={styles.secondaryButtonText}>
											Ver PDF del plan
										</Text>
									</Pressable>
								) : null}
							</View>
						))
						: (
							<EmptyState
								title='No hay historia visible'
								body='Tu profesional puede habilitar registros clínicos para que los veas desde el portal.'
							/>
						)
					: null}

				{tab === 'profile' ? (
					<View style={styles.card}>
						<Text style={styles.cardLabel}>Tu perfil</Text>
						<Text style={styles.cardTitle}>{patient?.name || '-'}</Text>
						<Text style={styles.bodyText}>Email: {patient?.email || '-'}</Text>
						<Text style={styles.bodyText}>Telefono: {patient?.phone || '-'}</Text>
						<Text style={styles.bodyText}>
							Obra social: {patient?.healthInsuranceName || '-'}
						</Text>
						<Text style={styles.bodyText}>DNI: {patient?.dni || '-'}</Text>
					</View>
				) : null}
			</ScrollView>

			<View style={styles.tabs}>
				<TabButton tab='home' current={tab} label='Inicio' icon='home-outline' onPress={setTab} />
				<TabButton tab='appointments' current={tab} label='Turnos' icon='calendar-outline' onPress={setTab} />
				<TabButton tab='foodLog' current={tab} label='Comidas' icon='restaurant-outline' onPress={setTab} />
				<TabButton tab='records' current={tab} label='Historia' icon='document-text-outline' onPress={setTab} />
				<TabButton tab='profile' current={tab} label='Perfil' icon='person-outline' onPress={setTab} />
			</View>
			</View>
	);
}

export default function App() {
	return (
		<SafeAreaProvider>
			<PatientPortalApp />
		</SafeAreaProvider>
	);
}

function Metric({ label, value }: { label: string; value: number }) {
	return (
		<View style={styles.metric}>
			<Text style={styles.cardLabel}>{label}</Text>
			<Text style={styles.metricValue}>{value}</Text>
		</View>
	);
}

function EmptyState({ title, body }: { title: string; body: string }) {
	return (
		<View style={styles.emptyState}>
			<Text style={styles.emptyTitle}>{title}</Text>
			<Text style={styles.muted}>{body}</Text>
		</View>
	);
}

function TabButton({
	tab,
	current,
	label,
	icon,
	onPress,
}: {
	tab: Tab;
	current: Tab;
	label: string;
	icon: keyof typeof Ionicons.glyphMap;
	onPress: (tab: Tab) => void;
}) {
	const active = tab === current;
	return (
		<Pressable style={styles.tabButton} onPress={() => onPress(tab)}>
			<Ionicons name={icon} size={20} color={active ? '#0f766e' : '#64748b'} />
			<Text style={[styles.tabText, active ? styles.activeTabText : null]}>
				{label}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: '#f8fafc',
	},
	login: {
		flexGrow: 1,
		justifyContent: 'center',
		padding: 24,
	},
	header: {
		padding: 20,
		borderBottomWidth: 1,
		borderBottomColor: '#e2e8f0',
		backgroundColor: '#fff',
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	content: {
		padding: 20,
		paddingBottom: 110,
		gap: 14,
	},
	eyebrow: {
		color: '#64748b',
		fontSize: 12,
		textTransform: 'uppercase',
		fontWeight: '700',
	},
	title: {
		color: '#0f2f4f',
		fontSize: 28,
		fontWeight: '800',
		marginTop: 4,
	},
	subtitle: {
		color: '#64748b',
		fontSize: 15,
		marginTop: 8,
		marginBottom: 24,
	},
	headerTitle: {
		color: '#0f2f4f',
		fontSize: 16,
		fontWeight: '700',
		marginTop: 3,
	},
	label: {
		color: '#0f172a',
		fontSize: 13,
		fontWeight: '700',
		marginBottom: 8,
		marginTop: 14,
	},
	input: {
		borderWidth: 1,
		borderColor: '#cbd5e1',
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 12,
		backgroundColor: '#fff',
		color: '#0f172a',
	},
	primaryButton: {
		marginTop: 20,
		borderRadius: 12,
		backgroundColor: '#0f2f4f',
		paddingVertical: 14,
		alignItems: 'center',
	},
	primaryButtonText: {
		color: '#fff',
		fontWeight: '800',
	},
	disabledButton: {
		opacity: 0.45,
	},
	secondaryButton: {
		marginTop: 12,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: '#0f766e',
		paddingVertical: 10,
		alignItems: 'center',
	},
	secondaryButtonText: {
		color: '#0f766e',
		fontWeight: '800',
	},
	selectorButton: {
		marginTop: 12,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: '#dbeafe',
		backgroundColor: '#fff',
		padding: 16,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	selectorTitle: {
		color: '#0f2f4f',
		fontSize: 16,
		fontWeight: '800',
	},
	error: {
		marginTop: 12,
		color: '#dc2626',
	},
	card: {
		backgroundColor: '#fff',
		borderRadius: 16,
		padding: 16,
		borderWidth: 1,
		borderColor: '#e2e8f0',
	},
	cardLabel: {
		color: '#64748b',
		fontSize: 12,
		fontWeight: '700',
		textTransform: 'uppercase',
	},
	cardTitle: {
		color: '#0f172a',
		fontSize: 18,
		fontWeight: '800',
		marginTop: 6,
	},
	bodyText: {
		color: '#334155',
		fontSize: 14,
		lineHeight: 20,
		marginTop: 8,
	},
	muted: {
		color: '#64748b',
		fontSize: 13,
		marginTop: 6,
	},
	badge: {
		alignSelf: 'flex-start',
		overflow: 'hidden',
		borderRadius: 999,
		backgroundColor: '#ecfdf5',
		color: '#0f766e',
		fontSize: 12,
		fontWeight: '800',
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	metricsRow: {
		flexDirection: 'row',
		gap: 12,
	},
	metric: {
		flex: 1,
		backgroundColor: '#fff',
		borderRadius: 16,
		padding: 16,
		borderWidth: 1,
		borderColor: '#e2e8f0',
	},
	metricValue: {
		color: '#0f2f4f',
		fontSize: 26,
		fontWeight: '900',
		marginTop: 4,
	},
	iconButton: {
		width: 42,
		height: 42,
		borderRadius: 21,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#f1f5f9',
	},
	tabs: {
		position: 'absolute',
		bottom: 0,
		left: 0,
		right: 0,
		flexDirection: 'row',
		backgroundColor: '#fff',
		borderTopWidth: 1,
		borderTopColor: '#e2e8f0',
		paddingTop: 8,
		paddingBottom: 20,
	},
	tabButton: {
		flex: 1,
		alignItems: 'center',
		gap: 4,
	},
	tabText: {
		fontSize: 11,
		color: '#64748b',
		fontWeight: '700',
	},
	activeTabText: {
		color: '#0f766e',
	},
	emptyState: {
		backgroundColor: '#fff',
		borderRadius: 16,
		padding: 18,
		borderWidth: 1,
		borderColor: '#e2e8f0',
	},
	emptyTitle: {
		color: '#0f172a',
		fontSize: 16,
		fontWeight: '800',
		marginBottom: 4,
	},
	foodLog: {
		gap: 14,
	},
	chips: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
		marginTop: 10,
	},
	chip: {
		borderWidth: 1,
		borderColor: '#cbd5e1',
		borderRadius: 999,
		paddingHorizontal: 12,
		paddingVertical: 8,
		backgroundColor: '#fff',
	},
	chipSelected: {
		borderColor: '#0f766e',
		backgroundColor: '#ecfdf5',
	},
	chipText: {
		color: '#475569',
		fontSize: 12,
		fontWeight: '700',
	},
	chipTextSelected: {
		color: '#0f766e',
	},
	calendarHeader: {
		marginTop: 14,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	calendarNav: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#f1f5f9',
	},
	calendarTitle: {
		color: '#0f2f4f',
		fontSize: 15,
		fontWeight: '800',
		textTransform: 'capitalize',
	},
	weekHeader: {
		marginTop: 12,
		flexDirection: 'row',
	},
	weekHeaderText: {
		flex: 1,
		textAlign: 'center',
		color: '#64748b',
		fontSize: 11,
		fontWeight: '800',
	},
	calendarGrid: {
		marginTop: 8,
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 4,
	},
	calendarDay: {
		width: '13.4%',
		minHeight: 48,
		borderRadius: 10,
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 1,
		borderColor: 'transparent',
	},
	calendarDayAvailable: {
		backgroundColor: '#ecfdf5',
		borderColor: '#99f6e4',
	},
	calendarDaySelected: {
		backgroundColor: '#0f2f4f',
		borderColor: '#0f2f4f',
	},
	calendarDayOutside: {
		opacity: 0,
	},
	calendarDayText: {
		color: '#0f172a',
		fontSize: 13,
		fontWeight: '800',
	},
	calendarDayMeta: {
		color: '#0f766e',
		fontSize: 10,
		fontWeight: '800',
		marginTop: 2,
	},
	calendarDayTextSelected: {
		color: '#fff',
	},
	slotGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
		marginTop: 14,
	},
	slotButton: {
		minWidth: 72,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: '#cbd5e1',
		backgroundColor: '#fff',
		paddingHorizontal: 12,
		paddingVertical: 10,
		alignItems: 'center',
	},
	slotSelected: {
		borderColor: '#0f2f4f',
		backgroundColor: '#0f2f4f',
	},
	slotDisabled: {
		backgroundColor: '#f1f5f9',
		borderColor: '#e2e8f0',
	},
	slotText: {
		color: '#0f172a',
		fontWeight: '800',
	},
	slotSelectedText: {
		color: '#fff',
	},
	slotDisabledText: {
		color: '#94a3b8',
	},
	dayTitle: {
		color: '#0f2f4f',
		fontSize: 20,
		fontWeight: '900',
	},
	foodDayHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 12,
	},
	foodDayTitleWrap: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	dayStatus: {
		borderRadius: 999,
		paddingHorizontal: 9,
		paddingVertical: 5,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
	},
	dayStatusComplete: {
		backgroundColor: '#ecfdf5',
	},
	dayStatusPartial: {
		backgroundColor: '#fffbeb',
	},
	dayStatusCompleteText: {
		color: '#047857',
		fontSize: 12,
		fontWeight: '800',
	},
	dayStatusPartialText: {
		color: '#b45309',
		fontSize: 12,
		fontWeight: '800',
	},
	mealBlock: {
		marginTop: 12,
		gap: 8,
		borderTopWidth: 1,
		borderTopColor: '#e2e8f0',
		paddingTop: 12,
	},
	textArea: {
		minHeight: 72,
		textAlignVertical: 'top',
	},
	success: {
		color: '#0f766e',
		fontWeight: '800',
		textAlign: 'center',
	},
});

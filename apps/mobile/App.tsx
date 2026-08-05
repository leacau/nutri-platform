import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
	ActivityIndicator,
	Linking,
	Pressable,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';

import { DEFAULT_API_BASE, parseDate, portalApi } from './src/api';
import type { Appointment, ClinicalRecord, Patient, SessionResponse } from './src/types';

type Tab = 'home' | 'appointments' | 'records' | 'profile';

function formatDate(value: unknown) {
	const date = parseDate(value);
	if (!date) return 'Sin fecha';
	return new Intl.DateTimeFormat('es-AR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(date);
}

function cardTitleForRecord(record: ClinicalRecord) {
	if (record.type === 'meal_plan') return 'Plan de alimentacion';
	if (record.type === 'prescription') return 'Receta / indicaciones';
	if (record.type === 'dynamic_measurement') return 'Mediciones';
	return 'Evolucion clinica';
}

export default function App() {
	const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
	const [token, setToken] = useState('qa:qa_cloud_c5_patient_01');
	const [tab, setTab] = useState<Tab>('home');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [session, setSession] = useState<SessionResponse | null>(null);
	const [patient, setPatient] = useState<Patient | null>(null);
	const [appointments, setAppointments] = useState<Appointment[]>([]);
	const [records, setRecords] = useState<ClinicalRecord[]>([]);

	const activePatientClinic = session?.patientClinics[0];
	const clinicId = session?.resolved.clinicId || activePatientClinic?.clinicId || null;
	const patientId =
		session?.resolved.patientId || activePatientClinic?.patientId || null;

	const nextAppointment = useMemo(() => {
		const now = Date.now();
		return appointments
			.filter((item) => item.status === 'scheduled')
			.map((item) => ({ item, date: parseDate(item.scheduledFor) }))
			.filter((item) => item.date && item.date.getTime() >= now)
			.sort((a, b) => a.date!.getTime() - b.date!.getTime())[0]?.item;
	}, [appointments]);

	async function loadPortal() {
		setLoading(true);
		setError(null);
		try {
			const nextSession = await portalApi.session(apiBase, token);
			const nextClinic =
				nextSession.resolved.clinicId || nextSession.patientClinics[0]?.clinicId;
			const nextPatient =
				nextSession.resolved.patientId || nextSession.patientClinics[0]?.patientId;

			if (!nextClinic || !nextPatient) {
				throw new Error('Este usuario no tiene portal paciente vinculado.');
			}

			const [nextPatientData, nextAppointments, nextRecords] = await Promise.all([
				portalApi.patient(apiBase, token, nextClinic, nextPatient),
				portalApi.appointments(apiBase, token, nextClinic),
				portalApi.records(apiBase, token, nextClinic, nextPatient),
			]);

			setSession(nextSession);
			setPatient(nextPatientData);
			setAppointments(
				nextAppointments
					.filter((item) => item.patientId === nextPatient)
					.sort(
						(a, b) =>
							(parseDate(b.scheduledFor || b.requestedAt)?.getTime() || 0) -
							(parseDate(a.scheduledFor || a.requestedAt)?.getTime() || 0),
					),
			);
			setRecords(nextRecords);
			setTab('home');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'No se pudo cargar el portal.');
		} finally {
			setLoading(false);
		}
	}

	if (!session || !clinicId || !patientId) {
		return (
			<SafeAreaView style={styles.screen}>
				<ScrollView contentContainerStyle={styles.login}>
					<Text style={styles.eyebrow}>AMSA Core</Text>
					<Text style={styles.title}>Portal paciente</Text>
					<Text style={styles.subtitle}>
						Version nativa inicial para probar el flujo real del paciente.
					</Text>
					<Text style={styles.label}>API base</Text>
					<TextInput
						style={styles.input}
						value={apiBase}
						autoCapitalize='none'
						onChangeText={setApiBase}
					/>
					<Text style={styles.label}>Token</Text>
					<TextInput
						style={styles.input}
						value={token}
						autoCapitalize='none'
						onChangeText={setToken}
					/>
					<Pressable style={styles.primaryButton} onPress={loadPortal}>
						{loading ? (
							<ActivityIndicator color='#fff' />
						) : (
							<Text style={styles.primaryButtonText}>Entrar</Text>
						)}
					</Pressable>
					{error ? <Text style={styles.error}>{error}</Text> : null}
				</ScrollView>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.screen}>
			<View style={styles.header}>
				<View>
					<Text style={styles.eyebrow}>Clinica activa</Text>
					<Text style={styles.headerTitle}>
						{activePatientClinic?.clinicName || clinicId}
					</Text>
				</View>
				<Pressable onPress={() => setSession(null)} style={styles.iconButton}>
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
								Profesional: {nextAppointment?.professionalUid || 'A definir'}
							</Text>
						</View>
						<View style={styles.metricsRow}>
							<Metric label='Turnos' value={appointments.length} />
							<Metric label='Historia' value={records.length} />
						</View>
					</>
				) : null}

				{tab === 'appointments'
					? appointments.map((appointment) => (
							<View key={appointment.id} style={styles.card}>
								<Text style={styles.badge}>{appointment.status}</Text>
								<Text style={styles.cardTitle}>
									{formatDate(appointment.scheduledFor || appointment.requestedAt)}
								</Text>
								<Text style={styles.muted}>
									Profesional: {appointment.professionalUid || 'A definir'}
								</Text>
							</View>
						))
					: null}

				{tab === 'records'
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
					: null}

				{tab === 'profile' ? (
					<View style={styles.card}>
						<Text style={styles.cardLabel}>Tu perfil</Text>
						<Text style={styles.cardTitle}>{patient?.name || '-'}</Text>
						<Text style={styles.bodyText}>Email: {patient?.email || '-'}</Text>
						<Text style={styles.bodyText}>Telefono: {patient?.phone || '-'}</Text>
						<Text style={styles.bodyText}>DNI: {patient?.dni || '-'}</Text>
					</View>
				) : null}
			</ScrollView>

			<View style={styles.tabs}>
				<TabButton tab='home' current={tab} label='Inicio' icon='home-outline' onPress={setTab} />
				<TabButton tab='appointments' current={tab} label='Turnos' icon='calendar-outline' onPress={setTab} />
				<TabButton tab='records' current={tab} label='Historia' icon='document-text-outline' onPress={setTab} />
				<TabButton tab='profile' current={tab} label='Perfil' icon='person-outline' onPress={setTab} />
			</View>
		</SafeAreaView>
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
});

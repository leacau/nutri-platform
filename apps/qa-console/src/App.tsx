import { useRef, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
	createUserWithEmailAndPassword,
	getIdToken,
	getIdTokenResult,
	onAuthStateChanged,
	signInWithEmailAndPassword,
	signOut,
	type User,
} from 'firebase/auth';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import './App.css';
import { auth } from './firebase';

type Claims = { role: string | null; clinicId: string | null };

type RoleTab = {
	key: 'patient' | 'nutri' | 'clinic_admin' | 'platform_admin';
	label: string;
	icon: string;
	description: string;
	tips: string[];
};

type Toast = {
	id: string;
	message: string;
	tone: 'success' | 'info' | 'warning' | 'error';
};

type ConfirmAction = { type: 'cancel' | 'complete'; apptId: string };

type LogEntry =
	| { ts: string; endpoint: string; payload?: unknown; ok: true; data: unknown }
	| {
			ts: string;
			endpoint: string;
			payload?: unknown;
			ok: false;
			error: string;
	  };

type ProtectedProps = {
	user: User | null;
	children: ReactElement;
};

function nowIso() {
	return new Date().toISOString();
}

function isoToDatetimeLocal(iso: string): string {
	const d = new Date(iso);
	if (!Number.isFinite(d.getTime())) return '';
	const tzOffsetMinutes = d.getTimezoneOffset();
	const localDate = new Date(d.getTime() - tzOffsetMinutes * 60 * 1000);
	return localDate.toISOString().slice(0, 16);
}

function toIsoFromDatetimeLocal(v: string): string | null {
	if (!v || !v.includes('T')) return null;
	const d = new Date(v);
	if (!Number.isFinite(d.getTime())) return null;
	return d.toISOString();
}

function toReadableDate(v: unknown): string {
	if (!v) return '—';
	if (typeof v === 'string') {
		const d = new Date(v);
		return Number.isFinite(d.getTime()) ? d.toLocaleString() : v;
	}
	if (typeof v === 'object' && v !== null) {
		const any = v as { _seconds?: number; _nanoseconds?: number };
		if (typeof any._seconds === 'number') {
			const ms = any._seconds * 1000 + Math.floor((any._nanoseconds ?? 0) / 1_000_000);
			return new Date(ms).toLocaleString();
		}
	}
	return String(v);
}

function defaultSlotWindow() {
	const start = new Date();
	const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
	return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

function formatSlotLabel(iso: string) {
	const d = new Date(iso);
	if (!Number.isFinite(d.getTime())) return iso;
	return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function ProtectedRoute({ user, children }: ProtectedProps) {
	if (!user) return <Navigate to='/login' replace />;
	return children;
}

export default function App() {
	const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

	const navigate = useNavigate();

	const [user, setUser] = useState<User | null>(null);
	const [claims, setClaims] = useState<Claims>({ role: null, clinicId: null });
	const [loading, setLoading] = useState(false);
	const [theme, setTheme] = useState<'light' | 'dark'>(() => {
		if (typeof window === 'undefined') return 'light';
		const stored = window.localStorage.getItem('qa-console-theme');
		if (stored === 'light' || stored === 'dark') return stored;
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	});

	const authFieldRefs = useRef<{ email: HTMLInputElement | null; password: HTMLInputElement | null }>(
		{ email: null, password: null }
	);
	const [stickyAuthField, setStickyAuthField] = useState<'email' | 'password' | null>(null);

	const [email, setEmail] = useState('qa1@test.com');
	const [password, setPassword] = useState('Passw0rd!');
	const [showPassword, setShowPassword] = useState(false);
	const [authPending, setAuthPending] = useState(false);
	const [authActionError, setAuthActionError] = useState<string | null>(null);
	const [emailError, setEmailError] = useState<string | null>(null);
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [authErrors, setAuthErrors] = useState<string[]>([]);
	const [toasts, setToasts] = useState<Toast[]>([]);
	const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

	const [logs, setLogs] = useState<LogEntry[]>([]);

	const roleTabs = useMemo<RoleTab[]>(
		() => [
			{
				key: 'patient',
				label: 'Paciente',
				icon: '🧍‍♀️',
				description: 'Solicitá turnos y seguí tu agenda vinculada.',
				tips: [
					'Elegí un nutri y pedí turno; si el perfil no está vinculado, crealo desde la alerta.',
					'Podés reprogramar o cancelar turnos que solicitaste.',
					'Usá el horario manual si no ves slots disponibles.',
				],
			},
			{
				key: 'nutri',
				label: 'Nutri',
				icon: '🥑',
				description: 'Programá y completá consultas con tus pacientes.',
				tips: [
					'Traé los slots disponibles del nutri antes de programar.',
					'Completá turnos finalizados para marcar el seguimiento.',
					'Podés ver disponibilidad rápida de la clínica en el panel inferior.',
				],
			},
			{
				key: 'clinic_admin',
				label: 'Clínica',
				icon: '🏥',
				description: 'Gestioná pacientes y agendas de toda la clínica.',
				tips: [
					'Cargá pacientes con clínica asignada y vinculá nutris.',
					'Programá o reprogramá turnos y mantené la disponibilidad al día.',
					'Usá la tarjeta de log para auditar llamados al backend.',
				],
			},
			{
				key: 'platform_admin',
				label: 'Platform',
				icon: '🛰️',
				description: 'Visión cross-clínica para auditar y destrabar flujos.',
				tips: [
					'Podés ver y completar turnos de todas las clínicas.',
					'Filtrá por clínica y nutri para validar aislamientos.',
					'Refrescá claims si cambiás permisos desde el emulador.',
				],
			},
		],
		[]
	);
	const [activeRoleTab, setActiveRoleTab] = useState<RoleTab['key']>('patient');

	// Pacientes
	const [pName, setPName] = useState('Juan Perez');
	const [pEmail, setPEmail] = useState('juan@test.com');
	const [pPhone, setPPhone] = useState('+549341000000');
	const [patientAssignSelections, setPatientAssignSelections] = useState<
		Record<string, string>
	>({});
	const [patients, setPatients] = useState<unknown[]>([]);

	// Turnos
	const defaultWindow = useMemo(() => defaultSlotWindow(), []);
	const [apptRequestNutriUid, setApptRequestNutriUid] = useState('');
	const [apptRequestSlot, setApptRequestSlot] = useState('');
	const [apptManualSlot, setApptManualSlot] = useState('');
	const [slotRangeFrom, setSlotRangeFrom] = useState(
		isoToDatetimeLocal(defaultWindow.fromIso)
	);
	const [slotRangeTo, setSlotRangeTo] = useState(
		isoToDatetimeLocal(defaultWindow.toIso)
	);
	const [apptSlots, setApptSlots] = useState<string[]>([]);
	const [apptBusySlots, setApptBusySlots] = useState<string[]>([]);
	const [loadingSlots, setLoadingSlots] = useState(false);
	const [currentSlotsNutri, setCurrentSlotsNutri] = useState<string>('');
	const [slotRangeError, setSlotRangeError] = useState<string | null>(null);
	const [scheduleSelections, setScheduleSelections] = useState<
		Record<string, { when: string; manualWhen?: string; nutri: string }>
	>({});
	const [appointments, setAppointments] = useState<unknown[]>([]);
	const [selectedClinicForNewPatient, setSelectedClinicForNewPatient] =
		useState<string>('');
	const [linkRequired, setLinkRequired] = useState<{ active: boolean; reason?: string }>({
		active: false,
		reason: '',
	});
	const [linkFlowMessage, setLinkFlowMessage] = useState<string | null>(null);
	const [linking, setLinking] = useState(false);

	const reversedLogs = useMemo(() => [...logs].reverse(), [logs]);
	const isDark = theme === 'dark';
	const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

	useEffect(() => {
		const ref = stickyAuthField ? authFieldRefs.current[stickyAuthField] : null;
		ref?.focus({ preventScroll: true });
	}, [stickyAuthField]);

	useEffect(() => {
		const inlineErrors: string[] = [];
		if (emailError) inlineErrors.push(emailError);
		if (passwordError) inlineErrors.push(passwordError);
		if (authActionError) inlineErrors.push(authActionError);
		setAuthErrors(inlineErrors);
	}, [emailError, passwordError, authActionError]);

	useEffect(() => {
		document.documentElement.setAttribute('data-theme', theme);
		window.localStorage.setItem('qa-console-theme', theme);
	}, [theme]);

	useEffect(() => {
		if (claims.role === 'patient') setActiveRoleTab('patient');
		else if (claims.role === 'nutri') setActiveRoleTab('nutri');
		else if (claims.role === 'clinic_admin') setActiveRoleTab('clinic_admin');
		else if (claims.role === 'platform_admin') setActiveRoleTab('platform_admin');
	}, [claims.role]);

	const activeRoleContent = useMemo(
		() => roleTabs.find((t) => t.key === activeRoleTab) ?? roleTabs[0],
		[activeRoleTab, roleTabs]
	);

	const knownNutris = useMemo(() => {
		const seed = new Set<string>(['nutri-demo-1', 'nutri-demo-2']);
		if (claims.role === 'nutri' && user?.uid) seed.add(user.uid);
		patients.forEach((p) => {
			const n = (p as any).assignedNutriUid;
			if (typeof n === 'string' && n) seed.add(n);
		});
		appointments.forEach((a) => {
			const n = (a as any).nutriUid;
			if (typeof n === 'string' && n) seed.add(n);
		});
		return Array.from(seed);
	}, [patients, appointments, claims.role, user?.uid]);

	useEffect(() => {
		if (!apptRequestNutriUid && knownNutris.length > 0) {
			setApptRequestNutriUid(knownNutris[0]);
		}
	}, [apptRequestNutriUid, knownNutris]);

	const clinicOptions = useMemo(() => {
		const seed = new Set<string>();
		if (claims.clinicId) seed.add(claims.clinicId);
		patients.forEach((p) => {
			const cid = (p as any).clinicId;
			if (typeof cid === 'string' && cid) seed.add(cid);
		});
	appointments.forEach((a) => {
		const cid = (a as any).clinicId;
		if (typeof cid === 'string' && cid) seed.add(cid);
	});
	return Array.from(seed);
	}, [claims.clinicId, patients, appointments]);

	useEffect(() => {
		const unsub = onAuthStateChanged(auth, async (u: User | null) => {
			setUser(u);
			if (!u) {
				setClaims({ role: null, clinicId: null });
				return;
			}
			const tokenRes = await getIdTokenResult(u, true);
			const role =
				typeof tokenRes.claims.role === 'string' ? tokenRes.claims.role : null;
			const clinicId =
				typeof tokenRes.claims.clinicId === 'string'
					? tokenRes.claims.clinicId
					: null;
			setClaims({ role, clinicId });
			setSelectedClinicForNewPatient((prev) => prev || clinicId || '');
		});
		return () => unsub();
	}, []);

	useEffect(() => {
		setLinkRequired({ active: false, reason: '' });
		setLinkFlowMessage(null);
		setLinking(false);
	}, [user?.uid]);

	useEffect(() => {
		if (!selectedClinicForNewPatient && clinicOptions.length > 0) {
			setSelectedClinicForNewPatient(clinicOptions[0]);
		}
	}, [clinicOptions, selectedClinicForNewPatient]);

	useEffect(() => {
		if (!apptRequestNutriUid && knownNutris.length > 0) {
			setApptRequestNutriUid(knownNutris[0]);
		}
	}, [knownNutris, apptRequestNutriUid]);

	useEffect(() => {
		if (!apptRequestNutriUid) return;
		handleLoadSlots(apptRequestNutriUid);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [apptRequestNutriUid]);

	function pushOk(endpoint: string, payload: unknown | undefined, data: unknown) {
		setLogs((prev) => [
			...prev,
			{ ts: nowIso(), endpoint, payload, ok: true, data },
		]);
	}

	function pushErr(endpoint: string, payload: unknown | undefined, error: string) {
		setLogs((prev) => [
			...prev,
			{ ts: nowIso(), endpoint, payload, ok: false, error },
		]);
	}

	function pushToast(message: string, tone: Toast['tone'] = 'info') {
		const id =
			typeof crypto !== 'undefined' && 'randomUUID' in crypto
				? crypto.randomUUID()
				: Math.random().toString(36).slice(2);
		setToasts((prev) => [...prev, { id, message, tone }]);
		window.setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== id));
		}, 3800);
	}

	type AuthedFetchResult =
		| { ok: true; status: number; data: unknown }
		| { ok: false; status: number; data: unknown; error: string };

	async function authedFetch(
		method: 'GET' | 'POST' | 'PATCH',
		endpoint: string,
		body?: unknown
	): Promise<AuthedFetchResult> {
		if (!user) {
			const error = 'Usuario no autenticado';
			pushErr(endpoint, body, error);
			return { ok: false, status: 401, data: null, error };
		}
		const token = await getIdToken(user, true);

		let res: Response;
		try {
			res = await fetch(`${API_BASE}${endpoint}`, {
				method,
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: body ? JSON.stringify(body) : undefined,
			});
		} catch (err) {
			const error =
				err instanceof Error ? err.message : 'Error de red al llamar al backend';
			pushErr(endpoint, body, error);
			return { ok: false, status: 0, data: null, error };
		}

		const data = await res.json().catch(() => null);
		if (!res.ok) {
			const errorMessage =
				(typeof data === 'object' && data && 'message' in data
					? (data as any).message
					: null) ??
				`HTTP ${res.status} ${res.statusText}`;
			pushErr(endpoint, body, `${errorMessage} :: ${JSON.stringify(data)}`);
			return { ok: false, status: res.status, data, error: errorMessage };
		}
		pushOk(endpoint, body, data);
		return { ok: true, status: res.status, data };
	}

	function getEmailError(value: string) {
		if (!value.trim()) return 'Ingresá un email';
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(value.trim())) return 'Ingresá un email válido';
		return null;
	}

	function getPasswordError(value: string) {
		if (!value) return 'Ingresá una contraseña';
		if (value.length < 6) return 'La contraseña debe tener al menos 6 caracteres';
		return null;
	}

	function validateAuthForm() {
		const emailIssue = getEmailError(email);
		const passwordIssue = getPasswordError(password);
		setEmailError(emailIssue);
		setPasswordError(passwordIssue);
		if (emailIssue) setStickyAuthField('email');
		else if (passwordIssue) setStickyAuthField('password');
		return !emailIssue && !passwordIssue;
	}

	async function handleLogin() {
		if (!validateAuthForm()) return;
		setLoading(true);
		setAuthPending(true);
		setAuthActionError(null);
		try {
			const cred = await signInWithEmailAndPassword(auth, email, password);
			pushOk('auth/login', { email }, { uid: cred.user.uid });
			pushToast('Sesión iniciada', 'success');
			navigate('/dashboard');
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Error desconocido';
			setAuthActionError(msg);
			pushErr('auth/login', { email }, msg);
			pushToast('No pudimos iniciar sesión', 'error');
			setStickyAuthField('email');
		} finally {
			setLoading(false);
			setAuthPending(false);
		}
	}

	async function handleRegister() {
		if (!validateAuthForm()) return;
		setLoading(true);
		setAuthPending(true);
		setAuthActionError(null);
		try {
			const cred = await createUserWithEmailAndPassword(auth, email, password);
			pushOk('auth/register', { email }, { uid: cred.user.uid });
			pushToast('Cuenta creada', 'success');
			navigate('/dashboard');
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Error desconocido';
			setAuthActionError(msg);
			pushErr('auth/register', { email }, msg);
			pushToast('No pudimos registrar el usuario', 'error');
			setStickyAuthField('email');
		} finally {
			setLoading(false);
			setAuthPending(false);
		}
	}

	async function handleLogout() {
		setLoading(true);
		try {
			await signOut(auth);
			pushOk('auth/logout', undefined, { ok: true });
			setPatients([]);
			setAppointments([]);
			pushToast('Sesión cerrada', 'info');
			navigate('/login');
		} catch (err) {
			pushErr(
				'auth/logout',
				undefined,
				err instanceof Error ? err.message : 'Error desconocido'
			);
			pushToast('No pudimos cerrar sesión', 'error');
		} finally {
			setLoading(false);
		}
	}

	async function handleRefreshClaims() {
		setLoading(true);
		try {
			if (!user) {
				pushErr('auth/refresh', undefined, 'Sin usuario logueado');
				return;
			}
			const tokenRes = await getIdTokenResult(user, true);
			const role =
				typeof tokenRes.claims.role === 'string' ? tokenRes.claims.role : null;
			const clinicId =
				typeof tokenRes.claims.clinicId === 'string'
					? tokenRes.claims.clinicId
					: null;
			setClaims({ role, clinicId });
			pushOk('auth/refresh', undefined, { role, clinicId });
			pushToast('Claims actualizadas', 'success');
		} catch (err) {
			pushErr(
				'auth/refresh',
				undefined,
				err instanceof Error ? err.message : 'Error desconocido'
			);
			pushToast('No pudimos refrescar claims', 'error');
		} finally {
			setLoading(false);
		}
	}

	async function handleGetMe() {
		setLoading(true);
		try {
			await authedFetch('GET', '/users/me');
		} finally {
			setLoading(false);
		}
	}

	async function handleCreatePatient() {
		setLoading(true);
		try {
			const created = await authedFetch('POST', '/patients', {
				name: pName,
				email: pEmail || null,
				phone: pPhone || null,
				clinicId: selectedClinicForNewPatient || undefined,
			});
			if (created.ok) {
				await handleListPatients();
				pushToast('Paciente creado', 'success');
			} else {
				pushToast('No se pudo crear el paciente', 'error');
			}
		} finally {
			setLoading(false);
		}
	}

	async function handleListPatients() {
		setLoading(true);
		try {
			const data = await authedFetch('GET', '/patients');
			if (
				data.ok &&
				data.data &&
				typeof data.data === 'object' &&
				'data' in (data.data as any)
			) {
				setPatients((data.data as any).data ?? []);
			}
		} finally {
			setLoading(false);
		}
	}

	async function handleAssignNutri(patientId: string) {
		setLoading(true);
		try {
			const chosenNutri = patientAssignSelections[patientId];
			if (!chosenNutri) {
				pushErr(
					'/patients/:id (assign)',
					{ patientId },
					'Seleccioná un nutri para asignar'
				);
				return;
			}
			const res = await authedFetch('PATCH', `/patients/${patientId}`, {
				assignedNutriUid: chosenNutri,
			});
			if (res.ok) {
				await handleListPatients();
				pushToast('Nutri asignado', 'success');
			} else {
				pushToast('No se pudo asignar el nutri', 'error');
			}
		} finally {
			setLoading(false);
		}
	}

	async function handleListAppointments() {
		setLoading(true);
		try {
			const data = await authedFetch('GET', '/appointments');
			if (
				data.ok &&
				data.data &&
				typeof data.data === 'object' &&
				'data' in (data.data as any)
			) {
				setAppointments((data.data as any).data ?? []);
				pushToast('Turnos actualizados', 'info');
			}
		} finally {
			setLoading(false);
		}
	}

	async function handleLoadSlots(
		nutriUid?: string,
		range?: { fromIso?: string | null; toIso?: string | null }
	) {
		if (!nutriUid) {
			setApptSlots([]);
			setApptBusySlots([]);
			setApptRequestSlot('');
			setCurrentSlotsNutri('');
			return;
		}
		if (!user) return;

		const fromIso = range?.fromIso ?? toIsoFromDatetimeLocal(slotRangeFrom);
		const toIso = range?.toIso ?? toIsoFromDatetimeLocal(slotRangeTo);

		if (!fromIso || !toIso) {
			setSlotRangeError('Ingresá un rango válido para buscar slots.');
			return;
		}

		if (Date.parse(toIso) <= Date.parse(fromIso)) {
			setSlotRangeError('La fecha “hasta” debe ser mayor a “desde”.');
			return;
		}

		setLoadingSlots(true);
		try {
			setSlotRangeError(null);
			const query = `/appointments/slots?nutriUid=${encodeURIComponent(
				nutriUid
			)}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
			const res = await authedFetch('GET', query);
			if (
				res.ok &&
				res.data &&
				typeof res.data === 'object' &&
				'data' in (res.data as any)
			) {
				const free = ((res.data as any).data?.free ?? []) as string[];
				const busy = ((res.data as any).data?.busy ?? []) as string[];
				setApptSlots(free);
				setApptBusySlots(busy);
				setCurrentSlotsNutri(nutriUid);
				setApptRequestSlot((prev) => (free.includes(prev) ? prev : free[0] || ''));
			}
		} finally {
			setLoadingSlots(false);
		}
	}

	useEffect(() => {
		if (!apptRequestNutriUid) {
			setApptSlots([]);
			setApptBusySlots([]);
			setCurrentSlotsNutri('');
			return;
		}
		const fromIso = toIsoFromDatetimeLocal(slotRangeFrom);
		const toIso = toIsoFromDatetimeLocal(slotRangeTo);
		if (!fromIso || !toIso) return;
		handleLoadSlots(apptRequestNutriUid, { fromIso, toIso });
	}, [apptRequestNutriUid, slotRangeFrom, slotRangeTo]);

	async function handleRequestAppointment() {
		setLoading(true);
		try {
			if (!apptRequestNutriUid) {
				pushErr(
					'/appointments/request',
					{ apptRequestNutriUid, apptRequestSlot },
					'Falta nutriUid para pedir turno'
				);
				return;
			}
			const manualIso = toIsoFromDatetimeLocal(apptManualSlot);
			const scheduledIso = apptRequestSlot || manualIso;
			if (!scheduledIso) {
				pushErr(
					'/appointments/request',
					{ apptRequestNutriUid, apptRequestSlot, manual: apptManualSlot },
					'Seleccioná un horario disponible o ingresá uno manual'
				);
				return;
			}
			const result = await authedFetch('POST', '/appointments/request', {
				nutriUid: apptRequestNutriUid,
				clinicId: claims.clinicId ?? undefined,
				scheduledForIso: scheduledIso,
			});
			if (result.ok) {
				setLinkRequired({ active: false, reason: '' });
				setLinkFlowMessage(null);
				await handleListAppointments();
				pushToast('Turno solicitado', 'success');
			} else if (result.status === 403 && claims.role === 'patient') {
				const reason =
					(typeof result.data === 'object' &&
						result.data &&
						'message' in (result.data as any) &&
						typeof (result.data as any).message === 'string'
						? (result.data as any).message
						: result.error) ??
					'Necesitás vincular tu perfil antes de pedir turno.';
				setLinkRequired({ active: true, reason });
				pushToast('Necesitás vincular tu paciente', 'warning');
			} else {
				pushToast('No se pudo solicitar el turno', 'error');
			}
		} finally {
			setLoading(false);
		}
	}

	async function handleLinkPatientAndRetry() {
		if (!user) {
			pushErr(
				'patients/link-and-retry',
				undefined,
				'Necesitás iniciar sesión para vincular tu paciente.'
			);
			return;
		}

		const clinicIdForPatient = claims.clinicId || selectedClinicForNewPatient;
		if (!clinicIdForPatient) {
			setLinkFlowMessage(
				'Asigná un clinicId en los claims para poder crear y vincular tu paciente.'
			);
			return;
		}

		setLinking(true);
		setLinkFlowMessage(null);

		try {
			let patientId: string | null = null;

			const created = await authedFetch('POST', '/patients', {
				name: pName || user.email || 'Paciente sin nombre',
				email: pEmail || user.email || null,
				phone: pPhone || null,
				clinicId: clinicIdForPatient,
			});
			if (
				created.ok &&
				created.data &&
				typeof created.data === 'object' &&
				'data' in (created.data as any) &&
				(created.data as any).data?.id
			) {
				patientId = (created.data as any).data.id as string;
			} else if (
				!created.ok &&
				created.status === 409 &&
				typeof created.data === 'object' &&
				created.data &&
				'data' in (created.data as any) &&
				(created.data as any).data?.id
			) {
				patientId = (created.data as any).data.id as string;
			}

			if (!patientId) {
				setLinkFlowMessage(
					'No se pudo crear ni ubicar un paciente para vincular. Revisá los datos e intentá de nuevo.'
				);
				return;
			}

			const linkRes = await authedFetch('PATCH', `/patients/${patientId}/link`, {
				linkedUid: user.uid,
			});
			if (!linkRes.ok) {
				setLinkFlowMessage(
					'No se pudo vincular el paciente. Revisá los claims y reintentá.'
				);
				return;
			}

			setLinkRequired({ active: false, reason: '' });
			setLinkFlowMessage('Paciente vinculado. Reintentando solicitud de turno...');
			pushToast('Paciente vinculado', 'success');
			await handleRequestAppointment();
		} finally {
			setLinking(false);
		}
	}

	async function handleScheduleAppointment(apptId: string) {
		setLoading(true);
		try {
			const sched = scheduleSelections[apptId];
			const iso =
				sched?.when || toIsoFromDatetimeLocal(sched?.manualWhen ?? '') || '';
			if (!iso) {
				pushErr(
					'/appointments/:id/schedule',
					{ apptId, when: sched?.when },
					'Falta fecha válida para programar'
				);
				return;
			}
			const res = await authedFetch('POST', `/appointments/${apptId}/schedule`, {
				scheduledForIso: iso,
				nutriUid: sched?.nutri || apptRequestNutriUid || '',
			});
			if (res.ok) {
				await handleListAppointments();
				pushToast('Turno programado', 'success');
			} else {
				pushToast('No se pudo programar el turno', 'error');
			}
		} finally {
			setLoading(false);
		}
	}

	async function handleCancelAppointment(apptId: string) {
		setLoading(true);
		try {
			const res = await authedFetch('POST', `/appointments/${apptId}/cancel`, {});
			if (res.ok) {
				await handleListAppointments();
				pushToast('Turno cancelado', 'info');
			} else {
				pushToast('No se pudo cancelar el turno', 'error');
			}
		} finally {
			setLoading(false);
		}
	}

	async function handleCompleteAppointment(apptId: string) {
		setLoading(true);
		try {
			const res = await authedFetch('POST', `/appointments/${apptId}/complete`, {});
			if (res.ok) {
				await handleListAppointments();
				pushToast('Turno completado', 'success');
			} else {
				pushToast('No se pudo completar el turno', 'error');
			}
		} finally {
			setLoading(false);
		}
	}

	async function handleConfirmAction() {
		if (!confirmAction) return;
		const { type, apptId } = confirmAction;
		setConfirmAction(null);
		if (type === 'cancel') {
			await handleCancelAppointment(apptId);
		} else if (type === 'complete') {
			await handleCompleteAppointment(apptId);
		}
	}

	const confirmCopy: Record<
		ConfirmAction['type'],
		{ title: string; body: string; confirmLabel: string; tone: 'warning' | 'success' }
	> = {
		cancel: {
			title: 'Cancelar turno',
			body: '¿Confirmás que querés cancelar este turno? Se notificará al paciente en la UI.',
			confirmLabel: 'Sí, cancelar',
			tone: 'warning',
		},
		complete: {
			title: 'Completar turno',
			body: 'Al completar, el turno quedará marcado como finalizado.',
			confirmLabel: 'Marcar como completado',
			tone: 'success',
		},
	};

	const toastIcons: Record<Toast['tone'], string> = {
		success: '✅',
		info: 'ℹ️',
		warning: '⚠️',
		error: '❌',
	};

	function Landing() {
		return (
			<div className='page'>
				<section className='hero'>
					<div>
						<p className='eyebrow'>Modo tester</p>
						<h1>Nutri Platform</h1>
						<p className='lead'>
							Pantalla real de onboarding con registro, login y navegación
							guiada por rol. Seguimos conectando contra emuladores locales.
						</p>
						<div className='actions'>
							<Link className='btn primary' to='/login'>
								Ingresar / Crear cuenta
							</Link>
							<Link className='btn ghost' to='/dashboard'>
								Ir al dashboard
							</Link>
						</div>
					</div>
					<div className='panel'>
						<h3>Cómo probar rápido</h3>
						<ol>
							<li>Creá un usuario en el emulador o logueate si ya existe.</li>
							<li>Usá el endpoint dev/set-claims con el secreto para setear rol y clinicId.</li>
							<li>Refrescá claims desde el dashboard y probá flujos según tu rol.</li>
						</ol>
					</div>
				</section>
			</div>
		);
	}

	function AuthPage() {
		return (
			<div className='page narrow'>
				<h2>Acceso</h2>
				<p className='muted'>
					Autenticamos contra el emulador de Firebase Auth. No se contacta
					producción.
				</p>
				<div className='card'>
					{authErrors.length > 0 && (
						<div className='error-summary' role='alert' aria-live='assertive'>
							<p><strong>Revisá los siguientes puntos:</strong></p>
							<ul>
								{authErrors.map((err, idx) => (
									<li key={idx}>{err}</li>
								))}
							</ul>
						</div>
					)}
					<label className='field'>
						<span>Email</span>
						<input
							ref={(el) => {
								authFieldRefs.current.email = el;
							}}
							value={email}
							onFocus={() => setStickyAuthField('email')}
							onChange={(e) => {
								setStickyAuthField('email');
								setEmail(e.target.value);
								setAuthActionError(null);
								setEmailError(getEmailError(e.target.value));
							}}
							placeholder='usuario@test.com'
						/>
						{emailError && <p className='error-text'>{emailError}</p>}
					</label>
					<label className='field'>
						<span>Password</span>
						<input
							type={showPassword ? 'text' : 'password'}
							ref={(el) => {
								authFieldRefs.current.password = el;
							}}
							value={password}
							onFocus={() => setStickyAuthField('password')}
							onChange={(e) => {
								setStickyAuthField('password');
								setPassword(e.target.value);
								setAuthActionError(null);
								setPasswordError(getPasswordError(e.target.value));
							}}
							placeholder='mínimo 6 caracteres'
						/>
						<div className='field-inline'>
							<label className='toggle'>
								<input
									type='checkbox'
									checked={showPassword}
									onChange={(e) => setShowPassword(e.target.checked)}
								/>
								<span>Mostrar contraseña</span>
							</label>
						</div>
						{passwordError && <p className='error-text'>{passwordError}</p>}
					</label>
					<div className='actions'>
						<button
							className={`btn primary ${authPending ? 'is-loading' : ''}`}
							disabled={loading || authPending}
							onClick={handleLogin}
						>
							{authPending ? 'Ingresando…' : 'Login'}
						</button>
						<button
							className={`btn ${authPending ? 'is-loading' : ''}`}
							disabled={loading || authPending}
							onClick={handleRegister}
						>
							{authPending ? 'Creando…' : 'Registrar'}
						</button>
						{user && (
							<button className='btn ghost' disabled={loading || authPending} onClick={handleLogout}>
								Logout
							</button>
						)}
					</div>
					<div className='inline-info'>
						<div>
							<strong>UID:</strong>{' '}
							<code>{user ? user.uid : 'no logueado'}</code>
						</div>
						<div>
							<strong>Claims:</strong>{' '}
							<code>{JSON.stringify(claims)}</code>
						</div>
					</div>
					<button className='link' disabled={loading} onClick={handleRefreshClaims}>
						Refrescar claims
					</button>
				</div>
			</div>
		);
	}

		function Dashboard() {
			const role = claims.role;
			const canClinic =
				role === 'clinic_admin' || role === 'nutri' || role === 'staff';
			const isPlatform = role === 'platform_admin';
			const isPatient = role === 'patient';

		return (
			<div className='page'>
				<header className='subheader'>
					<div>
						<p className='eyebrow'>Sesión activa</p>
						<div className='inline-heading'>
							<h2>{user?.email ?? 'Sin email'}</h2>
							<span className='pill subtle'>
								{activeRoleContent.icon} {activeRoleContent.label}
							</span>
						</div>
						<p className='muted'>
							Rol: <strong>{role ?? 'sin rol'}</strong> — Clínica:{' '}
							<strong>{claims.clinicId ?? 'n/a'}</strong>
						</p>
					</div>
					<div className='actions'>
						<button className='btn ghost' onClick={toggleTheme}>
							{isDark ? '🌙' : '☀️'} {isDark ? 'Modo oscuro' : 'Modo claro'}
						</button>
						<button className='btn ghost' disabled={loading} onClick={handleRefreshClaims}>
							Refrescar claims
						</button>
						<button className='btn' disabled={loading} onClick={handleLogout}>
							Cerrar sesión
						</button>
					</div>
				</header>

				<div className='card tabs-card'>
					<div className='tabs'>
						{roleTabs.map((tab) => (
							<button
								key={tab.key}
								className={`tab ${activeRoleTab === tab.key ? 'is-active' : ''}`}
								onClick={() => setActiveRoleTab(tab.key)}
							>
								<span className='tab-icon' aria-hidden>
									{tab.icon}
								</span>
								<span>{tab.label}</span>
							</button>
						))}
					</div>
					<div className='tab-panel'>
						<p className='muted'>{activeRoleContent.description}</p>
						<ul className='muted'>
							{activeRoleContent.tips.map((tip, idx) => (
								<li key={idx}>{tip}</li>
							))}
						</ul>
					</div>
				</div>

				<div className='grid two'>
					<div className='card'>
						<h3>Perfil</h3>
						<p className='muted'>
							Consultá tu perfil o hacé un ping al backend.
						</p>
						<div className='actions'>
								<button
									className='btn primary'
									disabled={loading}
									onClick={() => handleGetMe()}
								>
									Ver mi perfil
								</button>
								<button
									className='btn'
									disabled={loading}
									onClick={() => authedFetch('GET', '/health')}
								>
									Ping health
								</button>
							</div>
						</div>

						<div className='card'>
							<h3>Pacientes</h3>
							{canClinic || isPlatform ? (
								<>
									<div className='grid two'>
										<label className='field'>
											<span>Nombre</span>
											<input
												value={pName}
												onChange={(e) => setPName(e.target.value)}
												placeholder='Nombre y apellido'
											/>
										</label>
										<label className='field'>
											<span>Teléfono</span>
											<input
												value={pPhone}
												onChange={(e) => setPPhone(e.target.value)}
												placeholder='+54...'
											/>
										</label>
									</div>
									<div className='grid two'>
										<label className='field'>
											<span>Email</span>
											<input
												value={pEmail}
												onChange={(e) => setPEmail(e.target.value)}
												placeholder='correo opcional'
											/>
										</label>
										<label className='field'>
											<span>Clínica</span>
											<select
												value={selectedClinicForNewPatient}
												onChange={(e) => setSelectedClinicForNewPatient(e.target.value)}
												disabled={clinicOptions.length === 0}
											>
												{clinicOptions.map((cid) => (
													<option key={cid} value={cid}>
														{cid}
													</option>
												))}
												{clinicOptions.length === 0 && (
													<option value=''>Sin opciones cargadas</option>
												)}
											</select>
										</label>
										<div className='actions end'>
											<button
												className='btn primary'
												disabled={loading}
												onClick={handleCreatePatient}
										>
											Crear paciente
										</button>
									</div>
								</div>

									<div className='divider' />

									{patients.length > 0 && (
										<div className='list'>
											{patients.map((p, idx) => {
												const patient = p as Record<string, any>;
												const selectedNutri =
													patientAssignSelections[patient.id] ??
													(patient.assignedNutriUid ?? '');
												return (
													<div className='card' key={patient.id ?? idx}>
														<div className='inline-info'>
															<div>
																<strong>{patient.name ?? 'Sin nombre'}</strong>
																<div className='muted'>{patient.email ?? 'Sin email'}</div>
															</div>
															<div>
																<small>Clínica</small>
																<div className='muted'>{patient.clinicId ?? '—'}</div>
															</div>
														</div>
														<div className='inline-info'>
															<div>
																<small>Teléfono</small>
																<div className='muted'>{patient.phone ?? '—'}</div>
															</div>
															<div>
																<small>Nutri asignado</small>
																<div className='muted'>{patient.assignedNutriUid ?? '—'}</div>
															</div>
														</div>
														<div className='actions'>
															<select
																value={selectedNutri}
																onChange={(e) =>
																	setPatientAssignSelections((prev) => ({
																		...prev,
																		[patient.id]: e.target.value,
																	}))
																}
															>
																<option value=''>Elegí un nutri</option>
																{knownNutris.map((n) => (
																	<option key={n} value={n}>
																		{n}
																	</option>
																))}
															</select>
															<button
																className='btn'
																disabled={loading || !selectedNutri}
																onClick={() => handleAssignNutri(patient.id)}
															>
																Asignar nutri
															</button>
														</div>
													</div>
												);
											})}
										</div>
									)}
									<button className='btn ghost' disabled={loading} onClick={handleListPatients}>
										Refrescar pacientes
									</button>
								</>
							) : (
								<p className='muted'>Disponible para roles de clínica.</p>
							)}
						</div>
					</div>

					<div className='card'>
						<h3>Turnos</h3>
						<p className='muted'>
							Flujo completo: pedir como paciente, schedule como nutri/clinic_admin,
							cancelar, completar.
						</p>
						{!isPatient && (
							<p className='muted'>
								Para solicitar turnos necesitás rol <strong>patient</strong>.
								Aun así podés programar/cancelar/completar si tu rol lo permite.
							</p>
						)}
						<p className='muted'>
							Tip: el backend exige que tu usuario esté vinculado a un perfil de paciente en
							el emulador (linkedUid). Si recibís un 403, creá o vinculá tu paciente antes de
							volver a pedir turno.
						</p>
						<div
							className='muted'
							style={{
								padding: 12,
								borderRadius: 8,
								border: '1px solid #f3c96b',
								background: '#fff7e0',
								marginBottom: 16,
							}}
						>
							<strong>Recordatorio:</strong> vinculá tu usuario a un paciente antes de
							solicitar turnos para evitar errores.
						</div>
						{appointments.length === 0 && (
							<p className='muted'>
								No hay turnos aún. Solicitá uno como paciente (con perfil vinculado) y luego
								podrás elegir fecha y horario en la tarjeta del turno.
							</p>
						)}
						<div className='grid three'>
							<label className='field'>
								<span>Seleccioná nutri</span>
								<select
									value={apptRequestNutriUid}
									onChange={(e) => setApptRequestNutriUid(e.target.value)}
								>
									{knownNutris.map((n) => (
										<option key={n} value={n}>
											{n}
										</option>
									))}
									{knownNutris.length === 0 && (
										<option value=''>Sin opciones</option>
									)}
								</select>
							</label>
							<label className='field'>
								<span>Desde</span>
								<input
									type='datetime-local'
									value={slotRangeFrom}
									onChange={(e) => setSlotRangeFrom(e.target.value)}
								/>
							</label>
							<label className='field'>
								<span>Hasta</span>
								<input
									type='datetime-local'
									value={slotRangeTo}
									onChange={(e) => setSlotRangeTo(e.target.value)}
								/>
							</label>
							<label className='field'>
								<span>Slots disponibles (24h)</span>
								<select
									value={apptRequestSlot}
									onChange={(e) => setApptRequestSlot(e.target.value)}
									disabled={loadingSlots || apptSlots.length === 0}
								>
									{apptSlots.length === 0 && (
										<option value=''>Sin slots libres</option>
									)}
									{apptSlots.map((slot) => (
										<option key={slot} value={slot}>
											{formatSlotLabel(slot)}
										</option>
									))}
								</select>
							</label>
							<button
								className='btn ghost'
								disabled={loadingSlots || !apptRequestNutriUid}
								onClick={() => handleLoadSlots(apptRequestNutriUid)}
							>
								Refrescar slots
							</button>
							<button
								className='btn primary'
								disabled={
									loading ||
									linking ||
									!isPatient ||
									knownNutris.length === 0 ||
									!apptRequestSlot
								}
								onClick={handleRequestAppointment}
							>
								Solicitar turno (paciente)
							</button>
							<button className='btn ghost' disabled={loading} onClick={handleListAppointments}>
								Listar turnos
							</button>
						</div>

						{slotRangeError && <p className='muted'>{slotRangeError}</p>}

						{apptSlots.length === 0 && (
							<div className='card' style={{ background: '#f7f7f7', border: '1px dashed #ccc' }}>
								<p className='muted'>
									No hay slots libres en el rango seleccionado. Ingresá horario manual como
									fallback.
								</p>
								<label className='field'>
									<span>Horario manual</span>
									<input
										type='datetime-local'
										value={apptManualSlot}
										onChange={(e) => setApptManualSlot(e.target.value)}
									/>
								</label>
							</div>
						)}

						{linkRequired.active && (
							<div
								className='card'
								style={{ background: '#fff7e0', border: '1px solid #f3c96b' }}
							>
								<h4>Necesitás vincular tu paciente</h4>
								<p className='muted'>
									{linkRequired.reason ??
										'No encontramos un paciente vinculado. Crealo y vinculalo para continuar.'}
								</p>
								<div className='actions'>
									<button
										className='btn primary'
										disabled={loading || linking}
										onClick={handleLinkPatientAndRetry}
									>
										Crear y linkear paciente
									</button>
									<button className='btn ghost' disabled={loading} onClick={handleListAppointments}>
										Refrescar turnos
									</button>
								</div>
								{linkFlowMessage && <p className='muted'>{linkFlowMessage}</p>}
							</div>
						)}

						{appointments.length > 0 && (
							<div className='appointments'>
								{appointments.map((a, idx) => {
									const appt = a as Record<string, any>;
									const sched =
										scheduleSelections[appt.id] ?? {
											when: '',
											manualWhen: '',
											nutri: appt.nutriUid ?? apptRequestNutriUid ?? '',
										};
									const canSchedule =
										role === 'nutri' ||
										role === 'clinic_admin' ||
										(role === 'patient' && appt.patientUid === user?.uid);
									const canComplete =
										role === 'nutri' ||
										role === 'clinic_admin' ||
										role === 'platform_admin';
									const lockNutri = role === 'patient';
									const status: string = appt.status ?? 'requested';
									const statusTone =
										status === 'completed'
											? 'success'
											: status === 'cancelled'
											? 'danger'
											: status === 'scheduled'
											? 'warn'
											: 'info';
									const statusLabel: Record<string, string> = {
										requested: 'Solicitado',
										scheduled: 'Programado',
										completed: 'Completado',
										cancelled: 'Cancelado',
									};
									const statusIcon: Record<string, string> = {
										requested: '⏳',
										scheduled: '📅',
										completed: '✅',
										cancelled: '🚫',
									};
									return (
										<div className='appt-card' key={appt.id ?? idx}>
											<div className='appt-head'>
												<div className='appt-headline'>
													<p className='eyebrow'>Turno</p>
													<strong>{appt.id ?? 'sin-id'}</strong>
												</div>
												<div className='appt-meta'>
													<span className={`pill status status-${statusTone}`}>
														<span aria-hidden>{statusIcon[status] ?? '📌'}</span>{' '}
														{statusLabel[status] ?? status}
													</span>
													<span className='pill subtle'>
														#{idx + 1}
													</span>
												</div>
											</div>
											<div className='appt-grid'>
												<div>
													<small>Clínica</small>
													<div className='muted'>{appt.clinicId ?? '—'}</div>
												</div>
												<div>
													<small>Paciente</small>
													<div className='muted'>{appt.patientId ?? appt.patientUid ?? '—'}</div>
												</div>
												<div>
													<small>Nutri</small>
													<div className='muted'>{appt.nutriUid ?? '—'}</div>
												</div>
												<div>
													<small>Solicitado</small>
													<div className='muted'>{toReadableDate(appt.requestedAt)}</div>
												</div>
												<div>
													<small>Programado</small>
													<div className='muted'>{toReadableDate(appt.scheduledFor)}</div>
												</div>
												<div>
													<small>Actualizado</small>
													<div className='muted'>{toReadableDate(appt.updatedAt)}</div>
												</div>
											</div>
											{!canSchedule && (
												<p className='muted' style={{ marginTop: 8 }}>
													{role === 'patient'
														? 'Solo podés programar turnos que solicitaste vos.'
														: 'Seleccioná fecha y nutri cuando tengas permisos de clínica/nutri.'}
												</p>
											)}
											<div className='appt-actions'>
												{canSchedule && (
													<div className='appt-action-block'>
														<p className='muted small'>Programar o reprogramar</p>
														<div className='appt-action-grid'>
															<select
																value={sched.nutri}
																disabled={lockNutri}
																onChange={(e) =>
																	setScheduleSelections((prev) => ({
																		...prev,
																		[appt.id]: {
																			...prev[appt.id],
																			when: '',
																			manualWhen: '',
																			nutri: e.target.value,
																		},
																	}))
																}
															>
																<option value=''>Elegí nutri</option>
																{knownNutris.map((n) => (
																	<option key={n} value={n}>
																		{n}
																	</option>
																))}
															</select>
															<select
																value={sched.when}
																disabled={
																	loadingSlots ||
																	!sched.nutri ||
																	currentSlotsNutri !== sched.nutri ||
																	apptSlots.length === 0
																}
																onChange={(e) =>
																	setScheduleSelections((prev) => ({
																		...prev,
																		[appt.id]: {
																			...prev[appt.id],
																			when: e.target.value,
																			nutri: sched.nutri,
																		},
																	}))
																}
															>
																{currentSlotsNutri !== sched.nutri && (
																	<option value=''>Cargá slots para este nutri</option>
																)}
																{currentSlotsNutri === sched.nutri && apptSlots.length === 0 && (
																	<option value=''>Sin slots libres en el rango</option>
																)}
																{currentSlotsNutri === sched.nutri &&
																	apptSlots.map((slot) => (
																		<option key={slot} value={slot}>
																			{formatSlotLabel(slot)}
																		</option>
																	))}
															</select>
															<input
																type='datetime-local'
																value={sched.manualWhen ?? ''}
																onChange={(e) =>
																	setScheduleSelections((prev) => ({
																		...prev,
																		[appt.id]: {
																			...prev[appt.id],
																			manualWhen: e.target.value,
																			nutri: sched.nutri,
																		},
																	}))
																}
																placeholder='Fallback manual'
															/>
														</div>
														<div className='actions wrap'>
															<button
																className='btn ghost'
																disabled={loadingSlots || !sched.nutri}
																onClick={() =>
																	handleLoadSlots(sched.nutri || apptRequestNutriUid, {
																		fromIso: toIsoFromDatetimeLocal(slotRangeFrom),
																		toIso: toIsoFromDatetimeLocal(slotRangeTo),
																	})
																}
															>
																Slots de nutri
															</button>
															<button
																className='btn'
																disabled={loading || (!sched.when && !sched.manualWhen)}
																onClick={() => handleScheduleAppointment(appt.id)}
															>
																Programar
															</button>
														</div>
													</div>
												)}
												<div className='appt-action-block secondary'>
													<p className='muted small'>Acciones rápidas</p>
													<div className='actions wrap'>
														<button
															className='btn ghost'
															disabled={loading}
															onClick={() => setConfirmAction({ type: 'cancel', apptId: appt.id })}
														>
															Cancelar
														</button>
														{canComplete && (
															<button
																className='btn success'
																disabled={loading}
																onClick={() => setConfirmAction({ type: 'complete', apptId: appt.id })}
															>
																Completar
															</button>
														)}
													</div>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>

					{(role === 'clinic_admin' || role === 'nutri') && (
						<div className='card'>
							<h3>Disponibilidad de la clínica (beta)</h3>
							<p className='muted'>
								Vista rápida de slots libres/ocupados para el nutri seleccionado. Próximamente
								podrás editar disponibilidad desde aquí.
							</p>
							<div className='actions wrap'>
								<button
									className='btn'
									disabled={loadingSlots || !apptRequestNutriUid}
									onClick={() => handleLoadSlots(apptRequestNutriUid)}
								>
									Actualizar slots del nutri
								</button>
								<span className='pill'>
									Libres: {apptSlots.length} — Ocupados: {apptBusySlots.length}
								</span>
							</div>
							{apptSlots.length === 0 && apptBusySlots.length === 0 ? (
								<p className='muted'>Sin slots en el rango actual.</p>
							) : (
								<div className='list'>
									{apptSlots.slice(0, 6).map((slot) => (
										<div className='inline-info' key={`free-${slot}`}>
											<div>
												<small>Libre</small>
												<div>{formatSlotLabel(slot)}</div>
											</div>
										</div>
									))}
									{apptBusySlots.slice(0, 6).map((slot) => (
										<div className='inline-info' key={`busy-${slot}`}>
											<div>
												<small>Ocupado</small>
												<div className='muted'>{formatSlotLabel(slot)}</div>
											</div>
										</div>
									))}
									{apptSlots.length + apptBusySlots.length > 12 && (
										<p className='muted'>Mostrando solo los primeros slots.</p>
									)}
								</div>
							)}
						</div>
					)}

				<div className='card'>
					<h3>Log</h3>
					{reversedLogs.length === 0 ? (
						<p className='muted'>Sin llamadas todavía.</p>
					) : (
						<ul className='log'>
							{reversedLogs.map((l, idx) => (
								<li key={idx}>
									<div className='log-head'>
										<code>{l.ts}</code>
										<strong>{l.endpoint}</strong>
										<span className={l.ok ? 'pill ok' : 'pill error'}>
											{l.ok ? 'OK' : 'ERROR'}
										</span>
									</div>
									{l.payload !== undefined && (
										<div className='log-body'>
											<small>payload</small>{' '}
											<code>{JSON.stringify(l.payload)}</code>
										</div>
									)}
									<div className='log-body'>
										<small>{l.ok ? 'data' : 'error'}</small>{' '}
										<code>{l.ok ? JSON.stringify(l.data) : l.error}</code>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		);
	}

		return (
			<div>
				<div className='toast-stack' aria-live='polite'>
					{toasts.map((toast) => (
						<div key={toast.id} className={`toast ${toast.tone}`}>
							<span className='toast-icon' aria-hidden>
								{toastIcons[toast.tone]}
							</span>
							<div>{toast.message}</div>
						</div>
					))}
				</div>
				{confirmAction && (
					<div className='modal-backdrop' role='dialog' aria-modal='true'>
						<div className='modal'>
							<p className='eyebrow'>{confirmCopy[confirmAction.type].tone === 'warning' ? 'Confirmación' : 'Listo para cerrar'}</p>
							<h3>{confirmCopy[confirmAction.type].title}</h3>
							<p className='muted'>{confirmCopy[confirmAction.type].body}</p>
							<div className='actions end'>
								<button className='btn ghost' onClick={() => setConfirmAction(null)}>
									Volver
								</button>
								<button
									className={`btn ${confirmCopy[confirmAction.type].tone === 'warning' ? 'danger' : 'success'}`}
									onClick={handleConfirmAction}
								>
									{confirmCopy[confirmAction.type].confirmLabel}
								</button>
							</div>
						</div>
					</div>
				)}
				<nav className='topbar'>
					<div className='actions'>
						<Link to='/' className='brand'>
							Nutri Platform
						</Link>
						<span className='badge'>Modo tester (sin Firebase real)</span>
					</div>
					<div className='top-actions'>
						<Link to='/' className='link'>
							Inicio
					</Link>
					<Link to='/dashboard' className='link'>
						Dashboard
					</Link>
					{user ? (
						<button className='btn ghost sm' onClick={handleLogout} disabled={loading}>
							Cerrar sesión
						</button>
					) : (
						<Link to='/login' className='btn sm'>
							Ingresar
						</Link>
					)}
				</div>
			</nav>
			<Routes>
				<Route path='/' element={<Landing />} />
				<Route path='/login' element={<AuthPage />} />
				<Route
					path='/dashboard'
					element={
						<ProtectedRoute user={user}>
							<Dashboard />
						</ProtectedRoute>
					}
				/>
				<Route path='*' element={<Navigate to='/' />} />
			</Routes>
		</div>
	);
}

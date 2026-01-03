import {
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type ReactElement,
} from 'react';
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
import { getCopy, supportedLocales, type Locale } from './i18n';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import type {
	AuthedFetchResult,
	Claims,
	ConfirmAction,
	LogEntry,
	RoleTab,
	Toast,
} from './types/app';

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

function getStringField(source: unknown, key: string): string | null {
	if (source && typeof source === 'object' && key in source) {
		const value = (source as Record<string, unknown>)[key];
		return typeof value === 'string' ? value : null;
	}
	return null;
}

function getArrayField(source: unknown, key: string): unknown[] | null {
	if (source && typeof source === 'object' && key in source) {
		const value = (source as Record<string, unknown>)[key];
		return Array.isArray(value) ? value : null;
	}
	return null;
}

function getObjectField(source: unknown, key: string): Record<string, unknown> | null {
	if (source && typeof source === 'object' && key in source) {
		const value = (source as Record<string, unknown>)[key];
		return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
	}
	return null;
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
	const [locale, setLocale] = useState<Locale>(() => {
		if (typeof window === 'undefined') return 'es';
		const stored = window.localStorage.getItem('qa-console-locale');
		if (stored && supportedLocales.includes(stored as Locale)) return stored as Locale;
		return 'es';
	});
	const copy = useMemo(() => getCopy(locale), [locale]);

	const authFieldRefs = useRef<{ email: HTMLInputElement | null; password: HTMLInputElement | null }>(
		{ email: null, password: null }
	);
	const setAuthFieldRef = (field: 'email' | 'password', ref: HTMLInputElement | null) => {
		authFieldRefs.current[field] = ref;
	};
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

	const roleTabs = useMemo<RoleTab[]>(() => copy.roleTabs, [copy]);
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
	const localeSelectId = useId();

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
		document.documentElement.setAttribute('lang', locale);
		window.localStorage.setItem('qa-console-locale', locale);
	}, [locale]);

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
			const n = getStringField(p, 'assignedNutriUid');
			if (typeof n === 'string' && n) seed.add(n);
		});
		appointments.forEach((a) => {
			const n = getStringField(a, 'nutriUid');
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
			const cid = getStringField(p, 'clinicId');
			if (typeof cid === 'string' && cid) seed.add(cid);
		});
		appointments.forEach((a) => {
			const cid = getStringField(a, 'clinicId');
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

	async function authedFetch(
		method: 'GET' | 'POST' | 'PATCH',
		endpoint: string,
		body?: unknown
	): Promise<AuthedFetchResult> {
		if (!user) {
			const error = copy.errors.unauthenticated;
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
				err instanceof Error ? err.message : copy.errors.network;
			pushErr(endpoint, body, error);
			return { ok: false, status: 0, data: null, error };
		}

		const data = await res.json().catch(() => null);
		if (!res.ok) {
			const errorMessage =
				getStringField(data, 'message') ??
				`HTTP ${res.status} ${res.statusText}`;
			pushErr(endpoint, body, `${errorMessage} :: ${JSON.stringify(data)}`);
			return { ok: false, status: res.status, data, error: errorMessage };
		}
		pushOk(endpoint, body, data);
		return { ok: true, status: res.status, data };
	}

	function getEmailError(value: string) {
		if (!value.trim()) return copy.auth.errors.emailRequired;
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(value.trim())) return copy.auth.errors.emailInvalid;
		return null;
	}

	function getPasswordError(value: string) {
		if (!value) return copy.auth.errors.passwordRequired;
		if (value.length < 6) return copy.auth.errors.passwordLength;
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
			pushToast(copy.toasts.sessionStarted, 'success');
			navigate('/dashboard');
		} catch (err) {
			const msg = err instanceof Error ? err.message : copy.errors.unknown;
			setAuthActionError(msg);
			pushErr('auth/login', { email }, msg);
			pushToast(copy.toasts.loginError, 'error');
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
			pushToast(copy.toasts.accountCreated, 'success');
			navigate('/dashboard');
		} catch (err) {
			const msg = err instanceof Error ? err.message : copy.errors.unknown;
			setAuthActionError(msg);
			pushErr('auth/register', { email }, msg);
			pushToast(copy.toasts.registerError, 'error');
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
			pushToast(copy.toasts.logoutSuccess, 'info');
			navigate('/login');
		} catch (err) {
			pushErr(
				'auth/logout',
				undefined,
				err instanceof Error ? err.message : copy.errors.unknown
			);
			pushToast(copy.toasts.logoutError, 'error');
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
			pushToast(copy.toasts.claimsRefreshed, 'success');
		} catch (err) {
			pushErr(
				'auth/refresh',
				undefined,
				err instanceof Error ? err.message : copy.errors.unknown
			);
			pushToast(copy.toasts.claimsError, 'error');
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
				pushToast(copy.toasts.patientCreated, 'success');
			} else {
				pushToast(copy.toasts.patientError, 'error');
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
				typeof data.data === 'object'
			) {
				const patientsList = getArrayField(data.data, 'data');
				if (patientsList) setPatients(patientsList);
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
					copy.dashboard.patients.selectNutri
				);
				return;
			}
			const res = await authedFetch('PATCH', `/patients/${patientId}`, {
				assignedNutriUid: chosenNutri,
			});
			if (res.ok) {
				await handleListPatients();
				pushToast(copy.toasts.assignSuccess, 'success');
			} else {
				pushToast(copy.toasts.assignError, 'error');
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
				typeof data.data === 'object'
			) {
				const appointmentList = getArrayField(data.data, 'data');
				if (appointmentList) setAppointments(appointmentList);
				pushToast(copy.toasts.appointmentsRefreshed, 'info');
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
			setSlotRangeError(copy.dashboard.appointments.form.rangeErrors.invalidRange);
			return;
		}

		if (Date.parse(toIso) <= Date.parse(fromIso)) {
			setSlotRangeError(copy.dashboard.appointments.form.rangeErrors.endBeforeStart);
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
				typeof res.data === 'object'
			) {
				const dataPayload = getObjectField(res.data, 'data');
				const free =
					getArrayField(dataPayload, 'free')?.filter(
						(slot): slot is string => typeof slot === 'string'
					) ?? [];
				const busy =
					getArrayField(dataPayload, 'busy')?.filter(
						(slot): slot is string => typeof slot === 'string'
					) ?? [];
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
		// handleLoadSlots depends on stateful values; avoid adding it to prevent infinite loops
		// eslint-disable-next-line react-hooks/exhaustive-deps
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
					copy.dashboard.appointments.form.slotRequired
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
				pushToast(copy.toasts.appointmentRequested, 'success');
			} else if (result.status === 403 && claims.role === 'patient') {
				const reason =
					getStringField(result.data, 'message') ?? result.error ?? copy.dashboard.appointments.linking.description;
				setLinkRequired({ active: true, reason });
				pushToast(copy.toasts.linkRequired, 'warning');
			} else {
				pushToast(copy.toasts.appointmentRequestError, 'error');
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
				copy.dashboard.appointments.linking.needAuth
			);
			return;
		}

		const clinicIdForPatient = claims.clinicId || selectedClinicForNewPatient;
		if (!clinicIdForPatient) {
			setLinkFlowMessage(copy.dashboard.appointments.linking.needClinic);
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
			const createdData = getObjectField(created.data, 'data');
			const createdId = getStringField(createdData, 'id');
			if (created.ok && createdId) {
				patientId = createdId;
			} else if (!created.ok && created.status === 409 && createdId) {
				patientId = createdId;
			}

			if (!patientId) {
				setLinkFlowMessage(copy.dashboard.appointments.linking.createError);
				return;
			}

			const linkRes = await authedFetch('PATCH', `/patients/${patientId}/link`, {
				linkedUid: user.uid,
			});
			if (!linkRes.ok) {
				setLinkFlowMessage(copy.dashboard.appointments.linking.linkError);
				return;
			}

			setLinkRequired({ active: false, reason: '' });
			setLinkFlowMessage(copy.dashboard.appointments.linking.success);
			pushToast(copy.toasts.patientLinked, 'success');
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
					copy.dashboard.appointments.schedule.validDateRequired
				);
				return;
			}
			const res = await authedFetch('POST', `/appointments/${apptId}/schedule`, {
				scheduledForIso: iso,
				nutriUid: sched?.nutri || apptRequestNutriUid || '',
			});
			if (res.ok) {
				await handleListAppointments();
				pushToast(copy.toasts.appointmentScheduled, 'success');
			} else {
				pushToast(copy.toasts.appointmentScheduleError, 'error');
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
				pushToast(copy.toasts.appointmentCancelled, 'info');
			} else {
				pushToast(copy.toasts.appointmentCancelError, 'error');
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
				pushToast(copy.toasts.appointmentCompleted, 'success');
			} else {
				pushToast(copy.toasts.appointmentCompleteError, 'error');
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

	const confirmCopy = useMemo<
		Record<
			ConfirmAction['type'],
			{ title: string; body: string; confirmLabel: string; tone: 'warning' | 'success' }
		>
	>(
		() => ({
			cancel: {
				title: copy.confirm.cancel.title,
				body: copy.confirm.cancel.body,
				confirmLabel: copy.confirm.cancel.confirm,
				tone: 'warning',
			},
			complete: {
				title: copy.confirm.complete.title,
				body: copy.confirm.complete.body,
				confirmLabel: copy.confirm.complete.confirm,
				tone: 'success',
			},
		}),
		[copy]
	);

	const toastIcons: Record<Toast['tone'], string> = {
		success: '✅',
		info: 'ℹ️',
		warning: '⚠️',
		error: '❌',
	};

	const authPageProps = {
		copy,
		authErrors,
		email,
		password,
		emailError,
		passwordError,
		showPassword,
		authPending,
		loading,
		user,
		claims,
		setAuthFieldRef,
		setEmail,
		setPassword,
		setShowPassword,
		setAuthActionError,
		setEmailError,
		setPasswordError,
		setStickyAuthField,
		getEmailError,
		getPasswordError,
		handleLogin,
		handleRegister,
		handleLogout,
		handleRefreshClaims,
	};

	const dashboardProps = {
		copy,
		user,
		claims,
		roleTabs,
		activeRoleTab,
		activeRoleContent,
		setActiveRoleTab,
		toggleTheme,
		isDark,
		loading,
		loadingSlots,
		handleRefreshClaims,
		handleLogout,
		handleGetMe,
		authedFetch,
		pName,
		setPName,
		pEmail,
		setPEmail,
		pPhone,
		setPPhone,
		selectedClinicForNewPatient,
		setSelectedClinicForNewPatient,
		clinicOptions,
		handleCreatePatient,
		patients,
		patientAssignSelections,
		setPatientAssignSelections,
		knownNutris,
		handleAssignNutri,
		handleListPatients,
		appointments,
		handleScheduleAppointment,
		apptRequestNutriUid,
		setApptRequestNutriUid,
		slotRangeFrom,
		setSlotRangeFrom,
		slotRangeTo,
		setSlotRangeTo,
		apptRequestSlot,
		setApptRequestSlot,
		apptManualSlot,
		setApptManualSlot,
		handleLoadSlots,
		handleRequestAppointment,
		handleListAppointments,
		slotRangeError,
		apptSlots,
		apptBusySlots,
		linkRequired,
		linkFlowMessage,
		linking,
		handleLinkPatientAndRetry,
		scheduleSelections,
		setScheduleSelections,
		currentSlotsNutri,
		formatSlotLabel,
		toReadableDate,
		toIsoFromDatetimeLocal,
		setConfirmAction,
		reversedLogs,
	};

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
							<p className='eyebrow'>
								{confirmAction.type === 'cancel'
									? copy.confirm.cancel.title
									: copy.confirm.complete.title}
							</p>
							<h3>{confirmCopy[confirmAction.type].title}</h3>
							<p className='muted'>{confirmCopy[confirmAction.type].body}</p>
							<div className='actions end'>
								<button className='btn ghost' onClick={() => setConfirmAction(null)}>
									{copy.confirm.back}
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
							{copy.nav.brand}
						</Link>
						<span className='badge'>{copy.nav.badge}</span>
					</div>
					<div className='top-actions'>
						<label className='field-inline' htmlFor={localeSelectId}>
							<span className='muted small'>{copy.nav.languageLabel}</span>
							<select
								id={localeSelectId}
								value={locale}
								onChange={(e) => setLocale(e.target.value as Locale)}
							>
								{supportedLocales.map((loc) => {
									const locCopy = getCopy(loc);
									return (
										<option key={loc} value={loc}>
											{locCopy.languageName}
										</option>
									);
								})}
							</select>
						</label>
						<Link to='/' className='link'>
							{copy.nav.home}
					</Link>
					<Link to='/dashboard' className='link'>
						{copy.nav.dashboard}
					</Link>
					{user ? (
						<button className='btn ghost sm' onClick={handleLogout} disabled={loading}>
							{copy.nav.logout}
						</button>
					) : (
						<Link to='/login' className='btn sm'>
							{copy.nav.login}
						</Link>
					)}
				</div>
			</nav>
			<Routes>
				<Route path='/' element={<Landing copy={copy} />} />
				<Route path='/login' element={<AuthPage {...authPageProps} />} />
				<Route
					path='/dashboard'
					element={
						<ProtectedRoute user={user}>
							<Dashboard {...dashboardProps} />
						</ProtectedRoute>
					}
				/>
				<Route path='*' element={<Navigate to='/' />} />
			</Routes>
		</div>
	);
}

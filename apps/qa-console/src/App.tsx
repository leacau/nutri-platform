import {
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
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
import { getCopy, supportedLocales, type Locale, type RoleCopy } from './i18n';

type Claims = { role: string | null; clinicId: string | null };

type RoleTab = RoleCopy;

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

	type AuthedFetchResult =
		| { ok: true; status: number; data: unknown }
		| { ok: false; status: number; data: unknown; error: string };

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

	function Landing() {
		return (
			<div className='page'>
				<section className='hero'>
					<div>
						<p className='eyebrow'>{copy.landing.eyebrow}</p>
						<h1>{copy.landing.title}</h1>
						<p className='lead'>{copy.landing.lead}</p>
						<div className='actions'>
							<Link className='btn primary' to='/login'>
								{copy.landing.actions.auth}
							</Link>
							<Link className='btn ghost' to='/dashboard'>
								{copy.landing.actions.dashboard}
							</Link>
						</div>
					</div>
					<div className='panel'>
						<h3>{copy.landing.howTo.title}</h3>
						<ol>
							{copy.landing.howTo.steps.map((step, idx) => (
								<li key={idx}>{step}</li>
							))}
						</ol>
					</div>
				</section>
			</div>
		);
	}

	function AuthPage() {
		const emailInputId = useId();
		const passwordInputId = useId();
		const emailErrorId = useId();
		const passwordErrorId = useId();
		const authErrorsId = useId();

		return (
			<div className='page narrow'>
				<h2>{copy.auth.title}</h2>
				<p className='muted'>{copy.auth.intro}</p>
				<div className='card'>
					{authErrors.length > 0 && (
						<div
							className='error-summary'
							role='alert'
							aria-live='assertive'
							id={authErrorsId}
						>
							<p>
								<strong>{copy.auth.errorSummaryTitle}</strong>
							</p>
							<ul>
								{authErrors.map((err, idx) => (
									<li key={idx}>{err}</li>
								))}
							</ul>
						</div>
					)}
					<label className='field'>
						<span>{copy.auth.emailLabel}</span>
						<input
							id={emailInputId}
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
							placeholder={copy.auth.emailPlaceholder}
							aria-describedby={emailError ? emailErrorId : authErrors.length > 0 ? authErrorsId : undefined}
							aria-invalid={!!emailError}
						/>
						{emailError && (
							<p className='error-text' id={emailErrorId} role='status' aria-live='polite'>
								{emailError}
							</p>
						)}
					</label>
					<label className='field'>
						<span>{copy.auth.passwordLabel}</span>
						<input
							id={passwordInputId}
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
							placeholder={copy.auth.passwordPlaceholder}
							aria-describedby={
								passwordError ? passwordErrorId : authErrors.length > 0 ? authErrorsId : undefined
							}
							aria-invalid={!!passwordError}
						/>
						<div className='field-inline'>
							<label className='toggle'>
								<input
									type='checkbox'
									checked={showPassword}
									onChange={(e) => setShowPassword(e.target.checked)}
								/>
								<span>{copy.auth.passwordToggle}</span>
							</label>
						</div>
						{passwordError && (
							<p className='error-text' id={passwordErrorId} role='status' aria-live='polite'>
								{passwordError}
							</p>
						)}
					</label>
					<div className='actions'>
						<button
							className={`btn primary ${authPending ? 'is-loading' : ''}`}
							disabled={loading || authPending}
							onClick={handleLogin}
						>
							{authPending ? copy.auth.loginPending : copy.auth.login}
						</button>
						<button
							className={`btn ${authPending ? 'is-loading' : ''}`}
							disabled={loading || authPending}
							onClick={handleRegister}
						>
							{authPending ? copy.auth.registerPending : copy.auth.register}
						</button>
						{user && (
							<button className='btn ghost' disabled={loading || authPending} onClick={handleLogout}>
								{copy.auth.logout}
							</button>
						)}
					</div>
					<div className='inline-info'>
						<div>
							<strong>{copy.auth.infoUid}</strong>{' '}
							<code>{user ? user.uid : copy.auth.notLogged}</code>
						</div>
						<div>
							<strong>{copy.auth.infoClaims}</strong>{' '}
							<code>{JSON.stringify(claims)}</code>
						</div>
					</div>
					<button className='link' disabled={loading} onClick={handleRefreshClaims}>
						{copy.auth.refreshClaims}
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
			const displayEmail = user?.email ?? copy.dashboard.unknownEmail;
			const roleLabelValue = role ?? copy.dashboard.noRole;
			const clinicLabelValue = claims.clinicId ?? copy.dashboard.noClinic;
			const roleTabListId = useId();
			const tabPanelId = useId();
			const handleRoleTabKeyDown = (
				event: ReactKeyboardEvent<HTMLButtonElement>,
				index: number
			) => {
				if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
				event.preventDefault();
				const offset = event.key === 'ArrowRight' ? 1 : -1;
				const nextIndex = (index + offset + roleTabs.length) % roleTabs.length;
				setActiveRoleTab(roleTabs[nextIndex]?.key ?? activeRoleTab);
			};

		return (
			<div className='page'>
				<header className='subheader'>
					<div>
						<p className='eyebrow'>{copy.dashboard.sessionEyebrow}</p>
						<div className='inline-heading'>
							<h2>{displayEmail}</h2>
							<span className='pill subtle'>
								{activeRoleContent.icon} {activeRoleContent.label}
							</span>
						</div>
						<p className='muted'>
							{copy.dashboard.roleLabel}:{' '}
							<strong>{roleLabelValue}</strong> — {copy.dashboard.clinicLabel}:{' '}
							<strong>{clinicLabelValue}</strong>
						</p>
					</div>
					<div className='actions'>
						<button className='btn ghost' onClick={toggleTheme}>
							{isDark ? '🌙' : '☀️'} {isDark ? copy.dashboard.themeDark : copy.dashboard.themeLight}
						</button>
						<button className='btn ghost' disabled={loading} onClick={handleRefreshClaims}>
							{copy.auth.refreshClaims}
						</button>
						<button className='btn' disabled={loading} onClick={handleLogout}>
							{copy.nav.logout}
						</button>
					</div>
				</header>

				<div className='card tabs-card'>
					<div className='inline-heading'>
						<h3>{copy.dashboard.roleTabsLabel}</h3>
						<span className='pill subtle'>{copy.dashboard.roleTabsHelp}</span>
					</div>
					<div className='tabs' role='tablist' aria-label={copy.dashboard.roleTabsLabel} id={roleTabListId}>
						{roleTabs.map((tab, idx) => (
							<button
								key={tab.key}
								id={`${roleTabListId}-${tab.key}`}
								className={`tab ${activeRoleTab === tab.key ? 'is-active' : ''}`}
								onClick={() => setActiveRoleTab(tab.key)}
								onKeyDown={(event) => handleRoleTabKeyDown(event, idx)}
								role='tab'
								aria-selected={activeRoleTab === tab.key}
								tabIndex={activeRoleTab === tab.key ? 0 : -1}
								aria-controls={tabPanelId}
							>
								<span className='tab-icon' aria-hidden>
									{tab.icon}
								</span>
								<span>{tab.label}</span>
							</button>
						))}
					</div>
					<div className='tab-panel' role='tabpanel' id={tabPanelId} aria-labelledby={`${roleTabListId}-${activeRoleTab}`}>
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
						<h3>{copy.dashboard.profile.title}</h3>
						<p className='muted'>{copy.dashboard.profile.description}</p>
						<div className='actions'>
								<button
									className='btn primary'
									disabled={loading}
									onClick={() => handleGetMe()}
								>
									{copy.dashboard.profile.view}
								</button>
								<button
									className='btn'
									disabled={loading}
									onClick={() => authedFetch('GET', '/health')}
								>
									{copy.dashboard.profile.ping}
								</button>
							</div>
						</div>

						<div className='card'>
							<h3>{copy.dashboard.patients.title}</h3>
							{canClinic || isPlatform ? (
								<>
									<div className='grid two'>
										<label className='field'>
											<span>{copy.dashboard.patients.fields.name}</span>
											<input
												value={pName}
												onChange={(e) => setPName(e.target.value)}
												placeholder={copy.dashboard.patients.placeholders.name}
											/>
										</label>
										<label className='field'>
											<span>{copy.dashboard.patients.fields.phone}</span>
											<input
												value={pPhone}
												onChange={(e) => setPPhone(e.target.value)}
												placeholder={copy.dashboard.patients.placeholders.phone}
											/>
										</label>
									</div>
									<div className='grid two'>
										<label className='field'>
											<span>{copy.dashboard.patients.fields.email}</span>
											<input
												value={pEmail}
												onChange={(e) => setPEmail(e.target.value)}
												placeholder={copy.dashboard.patients.placeholders.email}
											/>
										</label>
										<label className='field'>
											<span>{copy.dashboard.patients.fields.clinic}</span>
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
													<option value=''>{copy.dashboard.patients.fields.clinicEmpty}</option>
												)}
											</select>
										</label>
										<div className='actions end'>
											<button
												className='btn primary'
												disabled={loading}
												onClick={handleCreatePatient}
										>
											{copy.dashboard.patients.create}
										</button>
									</div>
								</div>

									<div className='divider' />

									{patients.length > 0 && (
										<div className='list'>
											{patients.map((p, idx) => {
												const patientRecord = p as Record<string, unknown>;
												const patientId = getStringField(patientRecord, 'id') ?? String(idx);
												const patientName =
													getStringField(patientRecord, 'name') ?? copy.dashboard.patients.missingName;
												const patientEmail =
													getStringField(patientRecord, 'email') ?? copy.dashboard.patients.missingEmail;
												const patientClinic =
													getStringField(patientRecord, 'clinicId') ?? copy.dashboard.noClinic;
												const patientPhone =
													getStringField(patientRecord, 'phone') ?? copy.dashboard.patients.missingPhone;
												const assignedNutri =
													getStringField(patientRecord, 'assignedNutriUid') ?? '';
												const selectedNutri = patientAssignSelections[patientId] ?? assignedNutri;
												return (
													<div className='card' key={patientId}>
														<div className='inline-info'>
															<div>
																<strong>{patientName}</strong>
																<div className='muted'>{patientEmail}</div>
															</div>
															<div>
																<small>{copy.dashboard.patients.fields.clinic}</small>
																<div className='muted'>{patientClinic}</div>
															</div>
														</div>
														<div className='inline-info'>
															<div>
																<small>{copy.dashboard.patients.fields.phone}</small>
																<div className='muted'>{patientPhone}</div>
															</div>
															<div>
																<small>{copy.dashboard.patients.assignedNutri}</small>
																<div className='muted'>{assignedNutri || copy.dashboard.patients.missingNutri}</div>
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
																<option value=''>{copy.dashboard.patients.selectNutri}</option>
																{knownNutris.map((n) => (
																	<option key={n} value={n}>
																		{n}
																	</option>
																))}
															</select>
															<button
																className='btn'
																disabled={loading || !selectedNutri}
																onClick={() => handleAssignNutri(patientId)}
															>
																{copy.dashboard.patients.assignNutri}
															</button>
														</div>
													</div>
												);
											})}
										</div>
									)}
									<button className='btn ghost' disabled={loading} onClick={handleListPatients}>
										{copy.dashboard.patients.refresh}
									</button>
								</>
							) : (
								<p className='muted'>{copy.dashboard.patients.onlyClinic}</p>
							)}
						</div>
					</div>

					<div className='card'>
						<h3>{copy.dashboard.appointments.title}</h3>
						<p className='muted'>{copy.dashboard.appointments.description}</p>
						{!isPatient && <p className='muted'>{copy.dashboard.appointments.patientRoleReminder}</p>}
						<p className='muted'>{copy.dashboard.appointments.tip}</p>
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
							{copy.dashboard.appointments.reminder}
						</div>
						{appointments.length === 0 && (
							<p className='muted'>{copy.dashboard.appointments.noAppointments}</p>
						)}
						<div className='grid three'>
							<label className='field'>
								<span>{copy.dashboard.appointments.form.selectNutri}</span>
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
										<option value=''>{copy.dashboard.appointments.form.noNutriOptions}</option>
									)}
								</select>
							</label>
							<label className='field'>
								<span>{copy.dashboard.appointments.form.from}</span>
								<input
									type='datetime-local'
									value={slotRangeFrom}
									onChange={(e) => setSlotRangeFrom(e.target.value)}
								/>
							</label>
							<label className='field'>
								<span>{copy.dashboard.appointments.form.to}</span>
								<input
									type='datetime-local'
									value={slotRangeTo}
									onChange={(e) => setSlotRangeTo(e.target.value)}
								/>
							</label>
							<label className='field'>
								<span>{copy.dashboard.appointments.form.slotLabel}</span>
								<select
									value={apptRequestSlot}
									onChange={(e) => setApptRequestSlot(e.target.value)}
									disabled={loadingSlots || apptSlots.length === 0}
								>
									{apptSlots.length === 0 && (
										<option value=''>{copy.dashboard.appointments.form.noSlots}</option>
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
								{copy.dashboard.appointments.form.refreshSlots}
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
								{copy.dashboard.appointments.form.request}
							</button>
							<button className='btn ghost' disabled={loading} onClick={handleListAppointments}>
								{copy.dashboard.appointments.form.list}
							</button>
						</div>

						{slotRangeError && (
							<p className='muted' role='status' aria-live='assertive'>
								{slotRangeError}
							</p>
						)}

						{apptSlots.length === 0 && (
							<div className='card' style={{ background: '#f7f7f7', border: '1px dashed #ccc' }}>
								<p className='muted'>{copy.dashboard.appointments.form.manualHelp}</p>
								<label className='field'>
									<span>{copy.dashboard.appointments.form.manualLabel}</span>
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
								<h4>{copy.dashboard.appointments.linking.title}</h4>
								<p className='muted'>
									{linkRequired.reason ??
										copy.dashboard.appointments.linking.description}
								</p>
								<div className='actions'>
									<button
										className='btn primary'
										disabled={loading || linking}
										onClick={handleLinkPatientAndRetry}
									>
										{copy.dashboard.appointments.linking.createAndLink}
									</button>
									<button className='btn ghost' disabled={loading} onClick={handleListAppointments}>
										{copy.dashboard.appointments.linking.refresh}
									</button>
								</div>
								{linkFlowMessage && (
									<p className='muted' role='status' aria-live='polite'>
										{linkFlowMessage}
									</p>
								)}
							</div>
						)}

						{appointments.length > 0 && (
							<div className='appointments'>
								{appointments.map((a, idx) => {
									const appt = a as Record<string, unknown>;
									const appointmentId = getStringField(appt, 'id');
									const appointmentKey = appointmentId ?? String(idx);
									const appointmentNutri = getStringField(appt, 'nutriUid') ?? '';
									const appointmentPatientUid = getStringField(appt, 'patientUid');
									const appointmentPatientId =
										getStringField(appt, 'patientId') ?? appointmentPatientUid ?? '—';
									const appointmentClinic = getStringField(appt, 'clinicId') ?? copy.dashboard.noClinic;
									const appointmentStatus = getStringField(appt, 'status') ?? 'requested';
									const sched =
										scheduleSelections[appointmentKey] ?? {
											when: '',
											manualWhen: '',
											nutri: appointmentNutri || apptRequestNutriUid || '',
										};
									const canSchedule =
										role === 'nutri' ||
										role === 'clinic_admin' ||
										(role === 'patient' && appointmentPatientUid === user?.uid);
									const canComplete =
										role === 'nutri' ||
										role === 'clinic_admin' ||
										role === 'platform_admin';
									const lockNutri = role === 'patient';
									const status: string = appointmentStatus;
									const statusTone =
										status === 'completed'
											? 'success'
											: status === 'cancelled'
											? 'danger'
											: status === 'scheduled'
											? 'warn'
											: 'info';
									const statusIcon: Record<string, string> = {
										requested: '⏳',
										scheduled: '📅',
										completed: '✅',
										cancelled: '🚫',
									};
									return (
										<div className='appt-card' key={appointmentKey}>
											<div className='appt-head'>
												<div className='appt-headline'>
													<p className='eyebrow'>{copy.dashboard.appointments.cardLabel}</p>
													<strong>{appointmentId ?? copy.dashboard.appointments.noId}</strong>
												</div>
												<div className='appt-meta'>
													<span className={`pill status status-${statusTone}`}>
														<span aria-hidden>{statusIcon[status] ?? '📌'}</span>{' '}
														{copy.dashboard.appointments.statusLabel[status as keyof typeof copy.dashboard.appointments.statusLabel] ??
															status}
													</span>
													<span
														className='pill subtle'
														aria-label={`${copy.dashboard.appointments.detailLabels.positionLabel} ${idx + 1}`}
													>
														#{idx + 1}
													</span>
												</div>
											</div>
											<div className='appt-grid'>
												<div>
													<small>{copy.dashboard.appointments.detailLabels.clinic}</small>
													<div className='muted'>{appointmentClinic}</div>
												</div>
												<div>
													<small>{copy.dashboard.appointments.detailLabels.patient}</small>
													<div className='muted'>{appointmentPatientId}</div>
												</div>
												<div>
													<small>{copy.dashboard.appointments.detailLabels.nutri}</small>
													<div className='muted'>{appointmentNutri || copy.dashboard.patients.missingNutri}</div>
												</div>
												<div>
													<small>{copy.dashboard.appointments.detailLabels.requested}</small>
													<div className='muted'>{toReadableDate(appt.requestedAt)}</div>
												</div>
												<div>
													<small>{copy.dashboard.appointments.detailLabels.scheduled}</small>
													<div className='muted'>{toReadableDate(appt.scheduledFor)}</div>
												</div>
												<div>
													<small>{copy.dashboard.appointments.detailLabels.updated}</small>
													<div className='muted'>{toReadableDate(appt.updatedAt)}</div>
												</div>
											</div>
											{!canSchedule && (
												<p className='muted' style={{ marginTop: 8 }}>
													{role === 'patient'
														? copy.dashboard.appointments.schedule.lockNotice
														: copy.dashboard.appointments.schedule.permissionHint}
												</p>
											)}
											<div className='appt-actions'>
												{canSchedule && (
													<div className='appt-action-block'>
														<p className='muted small'>{copy.dashboard.appointments.schedule.title}</p>
														<div className='appt-action-grid'>
															<select
																value={sched.nutri}
																disabled={lockNutri}
																onChange={(e) =>
																	setScheduleSelections((prev) => ({
																		...prev,
																		[appointmentKey]: {
																			...prev[appointmentKey],
																			when: '',
																			manualWhen: '',
																			nutri: e.target.value,
																		},
																	}))
																}
															>
																<option value=''>{copy.dashboard.appointments.schedule.selectNutri}</option>
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
																		[appointmentKey]: {
																			...prev[appointmentKey],
																			when: e.target.value,
																			nutri: sched.nutri,
																		},
																	}))
																}
																>
																	{currentSlotsNutri !== sched.nutri && (
																	<option value=''>{copy.dashboard.appointments.schedule.selectSlot}</option>
																)}
																{currentSlotsNutri === sched.nutri && apptSlots.length === 0 && (
																	<option value=''>{copy.dashboard.appointments.schedule.noSlots}</option>
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
																		[appointmentKey]: {
																			...prev[appointmentKey],
																			manualWhen: e.target.value,
																			nutri: sched.nutri,
																		},
																	}))
																}
																placeholder={copy.dashboard.appointments.schedule.manualFallback}
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
																{copy.dashboard.appointments.schedule.loadSlots}
															</button>
															<button
																className='btn'
																disabled={loading || (!sched.when && !sched.manualWhen)}
																onClick={() => handleScheduleAppointment(appointmentKey)}
															>
																{copy.dashboard.appointments.schedule.program}
															</button>
														</div>
													</div>
												)}
												<div className='appt-action-block secondary'>
													<p className='muted small'>{copy.dashboard.appointments.quickActions.title}</p>
													<div className='actions wrap'>
														<button
															className='btn ghost'
															disabled={loading}
															onClick={() => setConfirmAction({ type: 'cancel', apptId: appointmentKey })}
														>
															{copy.dashboard.appointments.quickActions.cancel}
														</button>
														{canComplete && (
															<button
																className='btn success'
																disabled={loading}
																onClick={() => setConfirmAction({ type: 'complete', apptId: appointmentKey })}
															>
																{copy.dashboard.appointments.quickActions.complete}
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
							<h3>{copy.dashboard.clinicAvailability.title}</h3>
							<p className='muted'>{copy.dashboard.clinicAvailability.description}</p>
							<div className='actions wrap'>
								<button
									className='btn'
									disabled={loadingSlots || !apptRequestNutriUid}
									onClick={() => handleLoadSlots(apptRequestNutriUid)}
								>
									{copy.dashboard.clinicAvailability.refresh}
								</button>
								<span className='pill'>
									{copy.dashboard.clinicAvailability.counts
										.replace('{{free}}', String(apptSlots.length))
										.replace('{{busy}}', String(apptBusySlots.length))}
								</span>
							</div>
							{apptSlots.length === 0 && apptBusySlots.length === 0 ? (
								<p className='muted'>{copy.dashboard.clinicAvailability.empty}</p>
							) : (
								<div className='list'>
									{apptSlots.slice(0, 6).map((slot) => (
										<div className='inline-info' key={`free-${slot}`}>
											<div>
												<small>{copy.dashboard.clinicAvailability.freeLabel}</small>
												<div>{formatSlotLabel(slot)}</div>
											</div>
										</div>
									))}
									{apptBusySlots.slice(0, 6).map((slot) => (
										<div className='inline-info' key={`busy-${slot}`}>
											<div>
												<small>{copy.dashboard.clinicAvailability.busyLabel}</small>
												<div className='muted'>{formatSlotLabel(slot)}</div>
											</div>
										</div>
									))}
									{apptSlots.length + apptBusySlots.length > 12 && (
										<p className='muted'>{copy.dashboard.clinicAvailability.limited}</p>
									)}
								</div>
							)}
						</div>
					)}

				<div className='card'>
					<h3>{copy.dashboard.log.title}</h3>
					{reversedLogs.length === 0 ? (
						<p className='muted'>{copy.dashboard.log.empty}</p>
					) : (
						<ul className='log'>
							{reversedLogs.map((l, idx) => (
								<li key={idx}>
									<div className='log-head'>
										<code>{l.ts}</code>
										<strong>{l.endpoint}</strong>
										<span className={l.ok ? 'pill ok' : 'pill error'}>
											{l.ok ? copy.dashboard.log.ok : copy.dashboard.log.error}
										</span>
									</div>
									{l.payload !== undefined && (
										<div className='log-body'>
											<small>{copy.dashboard.log.payloadLabel}</small>{' '}
											<code>{JSON.stringify(l.payload)}</code>
										</div>
									)}
									<div className='log-body'>
										<small>{l.ok ? copy.dashboard.log.dataLabel : copy.dashboard.log.error}</small>{' '}
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

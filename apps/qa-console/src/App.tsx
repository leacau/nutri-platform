import {
	useEffect,
	useCallback,
	useMemo,
	useRef,
	useState,
	lazy,
	Suspense,
	type ReactElement,
} from 'react';
import type { User } from 'firebase/auth';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import { fetchJSON } from './api';
import { getCopy, supportedLocales, type Locale } from './i18n';
import { ConfirmModal, ToastStack, Topbar } from './components';
import { API_BASE_URL } from './config/env';
const Landing = lazy(() => import('./pages/Landing'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
import type {
	AuthedFetchResult,
	BackendStatus,
	ConfirmAction,
	LogEntry,
	RoleTab,
	Toast,
} from './types/app';
import useAuthSession from './hooks/useAuthSession';
import useDebouncedValue from './hooks/useDebouncedValue';
import { formatAuditId, scrubPII } from './utils/privacy';
import {
	isValidDatetimeLocal,
	isValidEmail,
	isValidPhone,
	toIsoFromDatetimeLocal,
} from './utils/validation';
import { createE2EStubApi } from './utils/e2eStubApi';

type ProtectedProps = {
	user: User | null;
	children: ReactElement;
};

function nowIso() {
	return new Date().toISOString();
}

function createLogId() {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return Math.random().toString(36).slice(2, 12);
}

function isoToDatetimeLocal(iso: string): string {
	const d = new Date(iso);
	if (!Number.isFinite(d.getTime())) return '';
	const tzOffsetMinutes = d.getTimezoneOffset();
	const localDate = new Date(d.getTime() - tzOffsetMinutes * 60 * 1000);
	return localDate.toISOString().slice(0, 16);
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

function toMillis(v: unknown): number | null {
	if (typeof v === 'string') {
		const ms = Date.parse(v);
		return Number.isFinite(ms) ? ms : null;
	}
	if (typeof v === 'object' && v !== null) {
		const any = v as { _seconds?: number; _nanoseconds?: number };
		if (typeof any._seconds === 'number') {
			return any._seconds * 1000 + Math.floor((any._nanoseconds ?? 0) / 1_000_000);
		}
	}
	return null;
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

type AppointmentFilters = {
	status: 'all' | 'requested' | 'scheduled' | 'completed' | 'cancelled';
	patient: string;
	nutri: string;
	clinic: string;
	from: string;
	to: string;
};

type ScheduleSelection = {
	slots: string[];
	manualWhen?: string;
	nutri: string;
};

function ProtectedRoute({ user, children }: ProtectedProps) {
	if (!user) return <Navigate to='/login' replace />;
	return children;
}

export default function App() {
	const API_BASE = API_BASE_URL;
	const useE2EStubApi = import.meta.env.VITE_E2E_API_STUB === 'true';

	const navigate = useNavigate();
	const location = useLocation();

	const {
		user,
		claims,
		sessionError,
		login,
		register,
		refreshClaims,
		getValidIdToken,
		logoutAndRevoke,
		clearSessionError,
	} = useAuthSession();
	const [loading, setLoading] = useState(false);
	const [patientsLoading, setPatientsLoading] = useState(false);
	const [appointmentsLoading, setAppointmentsLoading] = useState(false);
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
	const patientNameInputRef = useRef<HTMLInputElement | null>(null);
	const apptNutriSelectRef = useRef<HTMLSelectElement | null>(null);
	const apptFromInputRef = useRef<HTMLInputElement | null>(null);
	const [stickyAuthField, setStickyAuthField] = useState<'email' | 'password' | null>(null);

	const [email, setEmail] = useState('qa1@test.com');
	const [password, setPassword] = useState('Passw0rd!');
	const [showPassword, setShowPassword] = useState(false);
	const [authPending, setAuthPending] = useState(false);
	const [authActionError, setAuthActionError] = useState<string | null>(null);
	const [emailError, setEmailError] = useState<string | null>(null);
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [authErrors, setAuthErrors] = useState<string[]>([]);
	const sessionErrorRef = useRef<string | null>(null);
	const [toasts, setToasts] = useState<Toast[]>([]);
	const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

	const [backendStatus, setBackendStatus] = useState<BackendStatus>({
		state: 'unknown',
		message: copy.dashboard.backend.unknown,
	});
	const [apiErrorCount, setApiErrorCount] = useState(0);
	const [logs, setLogs] = useState<LogEntry[]>([]);

	const roleTabs = useMemo<RoleTab[]>(() => copy.roleTabs, [copy]);
	const [activeRoleTab, setActiveRoleTab] = useState<RoleTab['key']>('patient');

	// Pacientes
	const [pName, setPName] = useState('Juan Perez');
	const [pEmail, setPEmail] = useState('juan@test.com');
	const [pPhone, setPPhone] = useState('+549341000000');
	const [patientErrors, setPatientErrors] = useState<{ email: string | null; phone: string | null }>({
		email: null,
		phone: null,
	});
	const [patientAssignSelections, setPatientAssignSelections] = useState<
		Record<string, string>
	>({});
	const [patients, setPatients] = useState<unknown[]>([]);

	// Turnos
	const defaultWindow = useMemo(() => defaultSlotWindow(), []);
	const [apptRequestNutriUid, setApptRequestNutriUid] = useState('');
	const [apptRequestSlots, setApptRequestSlots] = useState<string[]>([]);
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
	const [appointmentFormError, setAppointmentFormError] = useState<string | null>(null);
	const [scheduleSelections, setScheduleSelections] = useState<
		Record<string, ScheduleSelection>
	>({});
	const [auditRefs, setAuditRefs] = useState<Record<string, string>>({});
	const [scheduleErrors, setScheduleErrors] = useState<Record<string, string | null>>({});
	const [appointments, setAppointments] = useState<unknown[]>([]);
	const [appointmentFilters, setAppointmentFilters] = useState<AppointmentFilters>({
		status: 'all',
		patient: '',
		nutri: '',
		clinic: '',
		from: '',
		to: '',
	});
	const [appointmentPage, setAppointmentPage] = useState(1);
	const [appointmentsPerPage, setAppointmentsPerPage] = useState(5);
	const [selectedClinicForNewPatient, setSelectedClinicForNewPatient] =
		useState<string>('');
	const [linkRequired, setLinkRequired] = useState<{ active: boolean; reason?: string }>({
		active: false,
		reason: '',
	});
	const [linkFlowMessage, setLinkFlowMessage] = useState<string | null>(null);
	const [linking, setLinking] = useState(false);

	const getBackendMessage = useCallback(
		(state: BackendStatus['state']) => {
			if (state === 'online') return copy.dashboard.backend.online;
			if (state === 'offline') return copy.dashboard.backend.offline;
			if (state === 'degraded') return copy.dashboard.backend.degraded;
			return copy.dashboard.backend.unknown;
		},
		[copy.dashboard.backend.degraded, copy.dashboard.backend.offline, copy.dashboard.backend.online, copy.dashboard.backend.unknown]
	);

	const setBackendState = (state: BackendStatus['state']) => {
		setBackendStatus({
			state,
			message: getBackendMessage(state),
			lastChecked: nowIso(),
		});
	};

	const sanitizeLogEntry = (entry: LogEntry): LogEntry => ({
		...entry,
		request: entry.request
			? {
					...entry.request,
					body: scrubPII(entry.request.body),
					headers: entry.request.headers,
			  }
			: undefined,
		response: entry.response ? { ...entry.response, body: scrubPII(entry.response.body) } : undefined,
		error: entry.error ? scrubPII(entry.error) : entry.error,
	});

	const appendLog = (entry: LogEntry) => {
		const safeEntry = sanitizeLogEntry(entry);
		setLogs((prev) => [...prev.slice(-99), safeEntry]);
	};

	const logManual = (input: {
		endpoint: string;
		method?: string;
		ok: boolean;
		status?: number;
		payload?: unknown;
		data?: unknown;
		error?: string;
	}) =>
		appendLog({
			id: createLogId(),
			ts: nowIso(),
			method: input.method ?? 'APP',
			endpoint: input.endpoint,
			url: `${API_BASE}${input.endpoint}`,
			ok: input.ok,
			status: input.status,
			durationMs: 0,
			attempt: 1,
			retries: 0,
			request: input.payload ? { body: input.payload } : undefined,
			response: input.data !== undefined ? { body: input.data } : undefined,
			error: input.error,
		});

	const reversedLogs = useMemo(() => [...logs].reverse(), [logs]);
	const isDark = theme === 'dark';
	const toggleTheme = useCallback(() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light')), []);

	const setValidatedPEmail: typeof setPEmail = (value) =>
		setPEmail((prev) => {
			const next = typeof value === 'function' ? value(prev) : value;
			setPatientErrors((prevErrors) => ({
				...prevErrors,
				email: next && !isValidEmail(next) ? copy.dashboard.patients.errors.emailInvalid : null,
			}));
			return next;
		});

	const setValidatedPPhone: typeof setPPhone = (value) =>
		setPPhone((prev) => {
			const next = typeof value === 'function' ? value(prev) : value;
			setPatientErrors((prevErrors) => ({
				...prevErrors,
				phone: next && !isValidPhone(next) ? copy.dashboard.patients.errors.phoneInvalid : null,
			}));
			return next;
		});

	const setSlotRangeFromInput: typeof setSlotRangeFrom = (value) =>
		setSlotRangeFrom((prev) => {
			const next = typeof value === 'function' ? value(prev) : value;
			setSlotRangeError(null);
			return next;
		});

	const setSlotRangeToInput: typeof setSlotRangeTo = (value) =>
		setSlotRangeTo((prev) => {
			const next = typeof value === 'function' ? value(prev) : value;
			setSlotRangeError(null);
			return next;
		});

	const setValidatedApptManualSlot: typeof setApptManualSlot = (value) =>
		setApptManualSlot((prev) => {
			const next = typeof value === 'function' ? value(prev) : value;
			const manualIssue = next
				? isValidDatetimeLocal(next)
					? null
					: copy.dashboard.appointments.form.manualInvalid
				: null;
			setAppointmentFormError(manualIssue);
			return next;
		});

	useEffect(() => {
		setPatientErrors({
			email: pEmail && !isValidEmail(pEmail) ? copy.dashboard.patients.errors.emailInvalid : null,
			phone: pPhone && !isValidPhone(pPhone) ? copy.dashboard.patients.errors.phoneInvalid : null,
		});
	}, [copy, pEmail, pPhone]);

	useEffect(() => {
		if (location.pathname.startsWith('/login')) {
			setStickyAuthField('email');
			authFieldRefs.current.email?.focus({ preventScroll: true });
			return;
		}
		if (location.pathname.startsWith('/dashboard')) {
			if (patientNameInputRef.current) {
				patientNameInputRef.current.focus({ preventScroll: true });
			} else {
				apptNutriSelectRef.current?.focus({ preventScroll: true });
			}
		}
	}, [location.pathname]);

	useEffect(() => {
		const ref = stickyAuthField ? authFieldRefs.current[stickyAuthField] : null;
		ref?.focus({ preventScroll: true });
	}, [stickyAuthField]);

	useEffect(() => {
		const inlineErrors: string[] = [];
		if (emailError) inlineErrors.push(emailError);
		if (passwordError) inlineErrors.push(passwordError);
		if (authActionError) inlineErrors.push(authActionError);
		if (sessionError) inlineErrors.push(sessionError);
		setAuthErrors(inlineErrors);
	}, [emailError, passwordError, authActionError, sessionError]);

	useEffect(() => {
		if (sessionError && sessionError !== sessionErrorRef.current) {
			pushToast(sessionError, 'error');
			sessionErrorRef.current = sessionError;
		} else if (!sessionError) {
			sessionErrorRef.current = null;
		}
	}, [sessionError]);

	useEffect(() => {
		document.documentElement.setAttribute('data-theme', theme);
		window.localStorage.setItem('qa-console-theme', theme);
	}, [theme]);

	useEffect(() => {
		document.documentElement.setAttribute('lang', locale);
		window.localStorage.setItem('qa-console-locale', locale);
	}, [locale]);

	useEffect(() => {
		const handleHotkeys = (event: KeyboardEvent) => {
			if (!(event.shiftKey && (event.metaKey || event.ctrlKey))) return;
			const key = event.key.toLowerCase();
			if (['input', 'textarea', 'select'].includes((event.target as HTMLElement)?.tagName?.toLowerCase())) {
				// allow hotkeys while typing without blocking text shortcuts
				if (key !== 't') return;
			}
			event.preventDefault();
			if (key === 't') toggleTheme();
			else if (key === 'l') {
				navigate('/login');
				window.requestAnimationFrame(() => authFieldRefs.current.email?.focus({ preventScroll: true }));
			} else if (key === 'd') {
				navigate('/dashboard');
			} else if (key === 'p') {
				patientNameInputRef.current?.focus({ preventScroll: true });
			} else if (key === 'a') {
				(apptNutriSelectRef.current ?? apptFromInputRef.current)?.focus({ preventScroll: true });
			}
		};

		window.addEventListener('keydown', handleHotkeys);
		return () => window.removeEventListener('keydown', handleHotkeys);
	}, [navigate, toggleTheme]);

	useEffect(() => {
		setBackendStatus((prev) => ({
			...prev,
			message: getBackendMessage(prev.state),
		}));
	}, [getBackendMessage]);

	useEffect(() => {
		if (apptRequestSlots.length > 0 || apptManualSlot) setAppointmentFormError(null);
	}, [apptManualSlot, apptRequestSlots.length]);

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

	const debouncedPatientFilter = useDebouncedValue(appointmentFilters.patient, 320);
	const debouncedNutriFilter = useDebouncedValue(appointmentFilters.nutri, 320);

	const filteredAppointments = useMemo(() => {
		const fromIso = toIsoFromDatetimeLocal(appointmentFilters.from);
		const toIso = toIsoFromDatetimeLocal(appointmentFilters.to);
		const patientTerm = debouncedPatientFilter.trim().toLowerCase();
		const nutriTerm = debouncedNutriFilter.trim().toLowerCase();
		const clinicFilter = appointmentFilters.clinic.trim().toLowerCase();
		const statusFilter = appointmentFilters.status;

		return appointments.filter((a) => {
			const appt = a as Record<string, unknown>;
			const status = (appt.status as string) ?? 'requested';
			if (statusFilter !== 'all' && status !== statusFilter) return false;

			const clinicId = (appt.clinicId as string) ?? '';
			if (clinicFilter && clinicId.toLowerCase() !== clinicFilter) return false;

			if (patientTerm) {
				const patientUid = getStringField(appt, 'patientUid') ?? '';
				const patientId = getStringField(appt, 'patientId') ?? '';
				const patientEmail = getStringField(appt, 'patientEmail') ?? '';
				const patientName = getStringField(appt, 'patientName') ?? '';
				const matchesPatient = [patientUid, patientId, patientEmail, patientName]
					.filter(Boolean)
					.some((value) => value.toLowerCase().includes(patientTerm));
				if (!matchesPatient) return false;
			}

			if (nutriTerm) {
				const nutriUid = getStringField(appt, 'nutriUid') ?? '';
				if (!nutriUid.toLowerCase().includes(nutriTerm)) return false;
			}

			const compareDate =
				toMillis((appt as Record<string, unknown>).scheduledFor) ??
				toMillis((appt as Record<string, unknown>).requestedAt);
			if (fromIso && compareDate !== null && compareDate < Date.parse(fromIso)) return false;
			if (toIso && compareDate !== null && compareDate > Date.parse(toIso)) return false;

			return true;
		});
	}, [
		appointments,
		appointmentFilters.clinic,
		appointmentFilters.from,
		appointmentFilters.status,
		appointmentFilters.to,
		debouncedNutriFilter,
		debouncedPatientFilter,
	]);

	const totalAppointmentPages = useMemo(
		() => Math.max(1, Math.ceil(filteredAppointments.length / Math.max(appointmentsPerPage, 1))),
		[appointmentsPerPage, filteredAppointments.length]
	);

	useEffect(() => {
		setAppointmentPage(1);
	}, [appointmentFilters, appointmentsPerPage]);

	useEffect(() => {
		setAppointmentPage((prev) => Math.min(prev, totalAppointmentPages));
	}, [totalAppointmentPages]);

	const visibleAppointments = useMemo(() => {
		const safePage = Math.min(appointmentPage, totalAppointmentPages);
		const start = (safePage - 1) * Math.max(appointmentsPerPage, 1);
		const end = start + Math.max(appointmentsPerPage, 1);
		return filteredAppointments.slice(start, end);
	}, [appointmentPage, appointmentsPerPage, filteredAppointments, totalAppointmentPages]);

	useEffect(() => {
		if (claims.clinicId) {
			setSelectedClinicForNewPatient((prev) => prev || claims.clinicId || '');
		}
	}, [claims.clinicId]);

	useEffect(() => {
		setLinkRequired({ active: false, reason: '' });
		setLinkFlowMessage(null);
		setLinking(false);
	}, [user?.uid]);

	useEffect(() => {
		if (!user) {
			setSelectedClinicForNewPatient('');
		}
	}, [user]);

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

	const e2eApi = useMemo(() => (useE2EStubApi ? createE2EStubApi() : null), [useE2EStubApi]);

	async function authedFetch(
		method: 'GET' | 'POST' | 'PATCH',
		endpoint: string,
		body?: unknown
	): Promise<AuthedFetchResult> {
		if (!user) {
			const error = copy.errors.unauthenticated;
			logManual({ endpoint, payload: body, ok: false, status: 401, error });
			return { ok: false, status: 401, data: null, error, attempts: 0, durationMs: 0 };
		}

		if (useE2EStubApi && e2eApi) {
			const stubResult = e2eApi.handle(method, endpoint, body);
			appendLog({
				id: createLogId(),
				ts: nowIso(),
				method,
				endpoint,
				url: endpoint,
				ok: stubResult.ok,
				status: stubResult.status,
				durationMs: stubResult.durationMs,
				attempt: stubResult.attempts,
				retries: Math.max(0, stubResult.attempts - 1),
				request: body ? { body } : undefined,
				response: stubResult.ok ? { body: stubResult.data } : undefined,
				error: stubResult.ok ? undefined : stubResult.error,
			});
			if (stubResult.ok) {
				setBackendState('online');
				return stubResult;
			}
			setApiErrorCount((prev) => prev + 1);
			setBackendState('degraded');
			return stubResult;
		}

		const token = await getValidIdToken();
		if (!token) {
			const error = sessionError ?? copy.errors.unauthenticated;
			logManual({ endpoint, payload: body, ok: false, status: 401, error });
			return { ok: false, status: 401, data: null, error, attempts: 0, durationMs: 0 };
		}

		const result = await fetchJSON({
			baseUrl: API_BASE,
			endpoint,
			method,
			body,
			headers: { Authorization: `Bearer ${token}` },
			timeoutMs: 12_000,
			retries: 2,
			onLog: appendLog,
		});

		if (result.ok) {
			setBackendState('online');
			return result;
		}

		setApiErrorCount((prev) => prev + 1);
		setBackendState(result.status === 0 ? 'offline' : 'degraded');
		const fallbackError =
			result.error ?? getStringField(result.data, 'message') ?? copy.errors.unknown;
		return { ...result, error: fallbackError };
	}

function getEmailError(value: string) {
	if (!value.trim()) return copy.auth.errors.emailRequired;
	if (!isValidEmail(value)) return copy.auth.errors.emailInvalid;
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
		clearSessionError();
		try {
			const result = await login(email, password);
			if (result.ok && result.user) {
				logManual({ endpoint: '/auth/login', method: 'AUTH', ok: true, payload: { email }, data: { uid: result.user.uid } });
				pushToast(copy.toasts.sessionStarted, 'success');
				navigate('/dashboard');
			} else {
				const msg = result.error ?? copy.errors.unknown;
				setAuthActionError(msg);
				logManual({ endpoint: '/auth/login', method: 'AUTH', ok: false, payload: { email }, error: msg });
				pushToast(copy.toasts.loginError, 'error');
				setStickyAuthField('email');
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : copy.errors.unknown;
			setAuthActionError(msg);
			logManual({ endpoint: '/auth/login', method: 'AUTH', ok: false, payload: { email }, error: msg });
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
		clearSessionError();
		try {
			const result = await register(email, password);
			if (result.ok && result.user) {
				logManual({
					endpoint: '/auth/register',
					method: 'AUTH',
					ok: true,
					payload: { email },
					data: { uid: result.user.uid },
				});
				pushToast(copy.toasts.accountCreated, 'success');
				navigate('/dashboard');
			} else {
				const msg = result.error ?? copy.errors.unknown;
				setAuthActionError(msg);
				logManual({ endpoint: '/auth/register', method: 'AUTH', ok: false, payload: { email }, error: msg });
				pushToast(copy.toasts.registerError, 'error');
				setStickyAuthField('email');
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : copy.errors.unknown;
			setAuthActionError(msg);
			logManual({ endpoint: '/auth/register', method: 'AUTH', ok: false, payload: { email }, error: msg });
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
			const result = await logoutAndRevoke();
			if (result.error) {
				logManual({ endpoint: '/auth/logout', method: 'AUTH', ok: false, error: result.error });
				pushToast(copy.errors.logoutRevoke, 'error');
			} else {
				logManual({ endpoint: '/auth/logout', method: 'AUTH', ok: true, data: { ok: true } });
				pushToast(copy.toasts.logoutSuccess, 'info');
			}
			setPatients([]);
			setAppointments([]);
			setAuditRefs({});
			navigate('/login');
		} catch (err) {
			logManual({
				endpoint: '/auth/logout',
				method: 'AUTH',
				ok: false,
				error: err instanceof Error ? err.message : copy.errors.unknown,
			});
			pushToast(copy.toasts.logoutError, 'error');
		} finally {
			setLoading(false);
		}
	}

	async function handleRefreshClaims() {
		setLoading(true);
		try {
			if (!user) {
				logManual({ endpoint: '/auth/refresh', method: 'AUTH', ok: false, error: 'Sin usuario logueado' });
				return;
			}
			const ok = await refreshClaims();
			if (ok) {
				logManual({
					endpoint: '/auth/refresh',
					method: 'AUTH',
					ok: true,
					data: { role: claims.role, clinicId: claims.clinicId },
				});
				pushToast(copy.toasts.claimsRefreshed, 'success');
			} else {
				const error = sessionError ?? copy.errors.refreshSession;
				logManual({ endpoint: '/auth/refresh', method: 'AUTH', ok: false, error });
				pushToast(copy.toasts.claimsError, 'error');
			}
		} catch (err) {
			logManual({
				endpoint: '/auth/refresh',
				method: 'AUTH',
				ok: false,
				error: err instanceof Error ? err.message : copy.errors.unknown,
			});
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
		const emailIssue = pEmail ? (!isValidEmail(pEmail) ? copy.dashboard.patients.errors.emailInvalid : null) : null;
		const phoneIssue = pPhone ? (!isValidPhone(pPhone) ? copy.dashboard.patients.errors.phoneInvalid : null) : null;
		setPatientErrors({ email: emailIssue, phone: phoneIssue });
		if (emailIssue || phoneIssue) return;
		setLoading(true);
		setPatientsLoading(true);
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
			setPatientsLoading(false);
		}
	}

	async function handleListPatients() {
		setLoading(true);
		setPatientsLoading(true);
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
			setPatientsLoading(false);
		}
	}

	async function handleAssignNutri(patientId: string) {
		setLoading(true);
		try {
			const chosenNutri = patientAssignSelections[patientId];
			if (!chosenNutri) {
				logManual({
					endpoint: '/patients/:id (assign)',
					method: 'VALIDATION',
					ok: false,
					payload: { patientId },
					error: copy.dashboard.patients.selectNutri,
				});
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
		setAppointmentsLoading(true);
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
			setAppointmentsLoading(false);
		}
	}

	async function handleLoadSlots(
		nutriUid?: string,
		range?: { fromIso?: string | null; toIso?: string | null }
	) {
		if (!nutriUid) {
			setApptSlots([]);
			setApptBusySlots([]);
			setApptRequestSlots([]);
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
				setApptRequestSlots((prev) => {
					const valid = prev.filter((slot) => free.includes(slot));
					if (valid.length > 0) return valid;
					if (free[0]) return [free[0]];
					return [];
				});
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
		if (!apptRequestNutriUid) {
			logManual({
				endpoint: '/appointments/request',
				method: 'VALIDATION',
				ok: false,
				payload: { apptRequestNutriUid, apptRequestSlots },
				error: 'Falta nutriUid para pedir turno',
			});
			return;
		}
		const manualIso = apptManualSlot ? toIsoFromDatetimeLocal(apptManualSlot) : null;
		if (apptManualSlot && !manualIso) {
			setAppointmentFormError(copy.dashboard.appointments.form.manualInvalid);
			return;
		}
		const candidates = [...apptRequestSlots];
		if (manualIso) candidates.push(manualIso);
		const uniqueSlots = Array.from(new Set(candidates.filter(Boolean)));
		if (uniqueSlots.length === 0) {
			setAppointmentFormError(copy.dashboard.appointments.form.slotRequired);
			logManual({
				endpoint: '/appointments/request',
				method: 'VALIDATION',
				ok: false,
				payload: { apptRequestNutriUid, apptRequestSlots, manual: apptManualSlot },
				error: copy.dashboard.appointments.form.slotRequired,
			});
			return;
		}

		const overlapWithBusy = uniqueSlots.find((slot) => apptBusySlots.includes(slot));
		if (overlapWithBusy) {
			setAppointmentFormError(copy.dashboard.appointments.form.overlapBusy);
			return;
		}

		setAppointmentFormError(null);
		setLoading(true);
		try {
			let successCount = 0;
			let lastError: string | null = null;
			for (const slot of uniqueSlots) {
				const result = await authedFetch('POST', '/appointments/request', {
					nutriUid: apptRequestNutriUid,
					clinicId: claims.clinicId ?? undefined,
					scheduledForIso: slot,
				});
				if (result.ok) {
					successCount += 1;
				} else if (result.status === 403 && claims.role === 'patient') {
					const reason =
						getStringField(result.data, 'message') ??
						result.error ??
						copy.dashboard.appointments.linking.description;
					setLinkRequired({ active: true, reason });
					pushToast(copy.toasts.linkRequired, 'warning');
					break;
				} else {
					lastError = result.error ?? copy.dashboard.appointments.form.slotRequired;
				}
			}

			if (successCount > 0) {
				setLinkRequired({ active: false, reason: '' });
				setLinkFlowMessage(null);
				await handleListAppointments();
				setApptRequestSlots([]);
				setApptManualSlot('');
				pushToast(
					successCount > 1
						? copy.toasts.appointmentsRequestedMany.replace('{{count}}', String(successCount))
						: copy.toasts.appointmentRequested,
					'success'
				);
			} else if (lastError) {
				setAppointmentFormError(lastError);
				pushToast(copy.toasts.appointmentRequestError, 'error');
			}
		} finally {
			setLoading(false);
		}
	}

	async function handleLinkPatientAndRetry() {
		if (!user) {
			logManual({
				endpoint: '/patients/link-and-retry',
				method: 'VALIDATION',
				ok: false,
				error: copy.dashboard.appointments.linking.needAuth,
			});
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
		const sched = scheduleSelections[apptId];
		const manualIso = sched?.manualWhen ? toIsoFromDatetimeLocal(sched.manualWhen) : null;
		if (sched?.manualWhen && !manualIso) {
			setScheduleErrors((prev) => ({
				...prev,
				[apptId]: copy.dashboard.appointments.schedule.manualInvalid,
			}));
			return;
		}
		const candidates = [...(sched?.slots ?? [])];
		if (manualIso) candidates.push(manualIso);
		const uniqueSlots = Array.from(new Set(candidates.filter(Boolean)));
		if (uniqueSlots.length === 0) {
			setScheduleErrors((prev) => ({
				...prev,
				[apptId]: copy.dashboard.appointments.schedule.validDateRequired,
			}));
			return;
		}

		const conflictWithBusy = uniqueSlots.find((slot) => apptBusySlots.includes(slot));
		if (conflictWithBusy) {
			setScheduleErrors((prev) => ({
				...prev,
				[apptId]: copy.dashboard.appointments.schedule.overlapBusy,
			}));
			return;
		}

		const targetNutri = sched?.nutri || apptRequestNutriUid || '';
		const conflictWithSelection = uniqueSlots.find((slot) =>
			Object.entries(scheduleSelections).some(([otherId, other]) => {
				if (otherId === apptId) return false;
				const otherNutri = other?.nutri || apptRequestNutriUid || '';
				if (otherNutri !== targetNutri) return false;
				const otherManual = other?.manualWhen ? toIsoFromDatetimeLocal(other.manualWhen) : null;
				const otherSlots = [...(other?.slots ?? []), ...(otherManual ? [otherManual] : [])];
				return otherSlots.includes(slot);
			})
		);
		if (conflictWithSelection) {
			setScheduleErrors((prev) => ({
				...prev,
				[apptId]: copy.dashboard.appointments.schedule.overlapSelected,
			}));
			return;
		}

		const iso = [...uniqueSlots].sort((a, b) => Date.parse(a) - Date.parse(b))[0];
		setScheduleErrors((prev) => ({ ...prev, [apptId]: null }));
		setLoading(true);
		try {
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
				const auditId = getStringField(res.data, 'auditId');
				if (auditId) {
					setAuditRefs((prev) => ({ ...prev, [apptId]: auditId }));
					pushToast(
						copy.toasts.auditLogged.replace('{{id}}', formatAuditId(auditId)),
						'info'
					);
				}
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
				const auditId = getStringField(res.data, 'auditId');
				if (auditId) {
					setAuditRefs((prev) => ({ ...prev, [apptId]: auditId }));
					pushToast(
						copy.toasts.auditLogged.replace('{{id}}', formatAuditId(auditId)),
						'success'
					);
				}
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
		backendStatus,
		apiErrorCount,
		pName,
		setPName,
		pEmail,
		setPEmail: setValidatedPEmail,
		pPhone,
		setPPhone: setValidatedPPhone,
		patientErrors,
		selectedClinicForNewPatient,
		setSelectedClinicForNewPatient,
		clinicOptions,
		handleCreatePatient,
		patients,
		patientsLoading,
		patientAssignSelections,
		setPatientAssignSelections,
		knownNutris,
		handleAssignNutri,
		handleListPatients,
		appointments,
		filteredAppointments,
		visibleAppointments,
		appointmentsLoading,
		appointmentFilters,
		setAppointmentFilters,
		appointmentPage,
		setAppointmentPage,
		appointmentsPerPage,
		setAppointmentsPerPage,
		totalAppointmentPages,
		handleScheduleAppointment,
		apptRequestNutriUid,
		setApptRequestNutriUid,
		slotRangeFrom,
		setSlotRangeFrom: setSlotRangeFromInput,
		slotRangeTo,
		setSlotRangeTo: setSlotRangeToInput,
		apptRequestSlots,
		setApptRequestSlots,
		apptManualSlot,
		setApptManualSlot: setValidatedApptManualSlot,
		handleLoadSlots,
		handleRequestAppointment,
		handleListAppointments,
		slotRangeError,
		appointmentFormError,
		setAppointmentFormError,
		apptSlots,
		apptBusySlots,
		linkRequired,
		linkFlowMessage,
		linking,
		handleLinkPatientAndRetry,
		scheduleSelections,
		setScheduleSelections,
		scheduleErrors,
		setScheduleErrors,
		currentSlotsNutri,
		formatSlotLabel,
		toReadableDate,
		toIsoFromDatetimeLocal,
		setConfirmAction,
		reversedLogs,
		patientNameInputRef,
		apptNutriSelectRef,
		apptFromInputRef,
		auditRefs,
	};

	return (
		<div>
			<ToastStack toasts={toasts} />
			<ConfirmModal
				confirmAction={confirmAction}
				confirmCopy={confirmCopy}
				copy={copy}
				onCancel={() => setConfirmAction(null)}
				onConfirm={handleConfirmAction}
			/>
			<Topbar
				copy={copy}
				locale={locale}
				setLocale={setLocale}
				supportedLocales={supportedLocales}
				user={user}
				loading={loading}
				onLogout={handleLogout}
			/>
			<Suspense fallback={<div className='app-loading'>Cargando consola…</div>}>
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
			</Suspense>
		</div>
	);
}

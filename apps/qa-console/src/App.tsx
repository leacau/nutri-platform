import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import './App.css';
import useAuthSession from './hooks/useAuthSession';
import { getCopy, supportedLocales, type Locale } from './i18n';

type ClinicRole = 'clinic_admin' | 'nutri' | 'staff';
type Membership = { clinicId: string; clinicName: string | null; role: ClinicRole; uid?: string };

type ApiLog = {
	id: string;
	ts: string;
	method: string;
	endpoint: string;
	ok: boolean;
	status: number;
	request?: unknown;
	response?: unknown;
};

type AuthedResult =
	| { ok: true; status: number; data: any }
	| { ok: false; status: number; error: string; data: any };

type PatientForm = { name: string; email: string; phone: string };
type SeedForm = { secret: string; clinicName: string; clinicId: string; users: string };
type ScheduleForm = { when: string; nutriUid: string };

function nowIso() {
	return new Date().toISOString();
}

function randomId() {
	return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function ProtectedRoute({ user, children }: { user: unknown; children: ReactElement }) {
	if (!user) return <Navigate to='/login' replace />;
	return children;
}

export default function App() {
	const navigate = useNavigate();
	const [locale, setLocale] = useState<Locale>(() => {
		const stored = window.localStorage.getItem('qa-console-locale');
		if (stored && supportedLocales.includes(stored as Locale)) return stored as Locale;
		return 'es';
	});
const {
		user,
		isPlatformAdmin,
		sessionError,
		login,
		register,
		getValidIdToken,
		logoutAndRevoke,
		clearSessionError,
	} = useAuthSession();

	const [sessionClinics, setSessionClinics] = useState<Membership[]>([]);
	const [activeClinicId, setActiveClinicId] = useState<string | null>(() => {
		return window.localStorage.getItem('qa-active-clinic');
	});
	const activeMembership = useMemo(
		() => sessionClinics.find((c) => c.clinicId === activeClinicId) ?? null,
		[activeClinicId, sessionClinics]
	);
	const effectiveRole: ClinicRole | 'platform_admin' | null = isPlatformAdmin
		? 'platform_admin'
		: activeMembership?.role ?? null;

	const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

	const [authEmail, setAuthEmail] = useState('qa1@test.com');
	const [authPassword, setAuthPassword] = useState('Passw0rd!');
	const [authPending, setAuthPending] = useState(false);
	const [authMessage, setAuthMessage] = useState<string | null>(null);

	const [logs, setLogs] = useState<ApiLog[]>([]);

	const [seedForm, setSeedForm] = useState<SeedForm>({
		secret: '',
		clinicId: '',
		clinicName: 'Clinica Demo',
		users: 'admin@test.com:clinic_admin,nutri@test.com:nutri,staff@test.com:staff',
	});

	const [patients, setPatients] = useState<any[]>([]);
	const [patientsLoading, setPatientsLoading] = useState(false);
	const [patientForm, setPatientForm] = useState<PatientForm>({
		name: 'Paciente Demo',
		email: 'paciente@test.com',
		phone: '+549111111111',
	});

	const [members, setMembers] = useState<Membership[]>([]);
	const [appointments, setAppointments] = useState<any[]>([]);
	const [appointmentsLoading, setAppointmentsLoading] = useState(false);
	const [scheduleForms, setScheduleForms] = useState<Record<string, ScheduleForm>>({});

	function pushLog(entry: Omit<ApiLog, 'id' | 'ts'>) {
		setLogs((prev) => [
			...prev.slice(-99),
			{ ...entry, id: randomId(), ts: nowIso() },
		]);
	}

	async function authedFetch(
		method: 'GET' | 'POST' | 'PATCH' | 'PUT',
		endpoint: string,
		body?: unknown,
		opts?: { includeClinicHeader?: boolean }
	): Promise<AuthedResult> {
		const token = await getValidIdToken();
		if (!token) {
			return { ok: false, status: 401, error: 'No hay sesión activa', data: null };
		}

		const headers: Record<string, string> = {
			Authorization: `Bearer ${token}`,
		};
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		if (opts?.includeClinicHeader !== false && activeClinicId) {
			headers['X-Clinic-Id'] = activeClinicId;
		}

		let responseData: any = null;
		let ok = false;
		let status = 0;
		let error: string | undefined;
		try {
			const res = await fetch(`${API_BASE}${endpoint}`, {
				method,
				headers,
				body: body !== undefined ? JSON.stringify(body) : undefined,
			});
			status = res.status;
			const text = await res.text();
			try {
				responseData = text ? JSON.parse(text) : null;
			} catch {
				responseData = text;
			}
			ok = res.ok;
			if (!ok) {
				error =
					(typeof responseData === 'object' && responseData && 'message' in responseData
						? (responseData as any).message
						: null) ?? `Request failed with status ${status}`;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Network error';
		}

		pushLog({
			method,
			endpoint,
			ok,
			status,
			request: body,
			response: responseData ?? error,
		});

		if (ok) return { ok: true, status, data: responseData };
		return { ok: false, status: status || 0, error: error ?? 'Unknown error', data: responseData };
	}

	const refreshSession = async () => {
		if (!user) return;
		const res = await authedFetch('GET', '/session', undefined, { includeClinicHeader: false });
		if (!res.ok) {
			setAuthMessage(res.error ?? 'No se pudo cargar la sesión');
			return;
		}
		const clinics = Array.isArray(res.data?.data?.clinics)
			? (res.data.data.clinics as Membership[])
			: [];
		setSessionClinics(clinics);
		if (!activeClinicId && clinics.length > 0) {
			const first = clinics[0].clinicId;
			setActiveClinicId(first);
			window.localStorage.setItem('qa-active-clinic', first);
		}
	};

	useEffect(() => {
		if (user) {
			void refreshSession();
		} else {
			setSessionClinics([]);
			setActiveClinicId(null);
		}
	}, [user]);

	const handleLogin = async (action: 'login' | 'register') => {
		setAuthPending(true);
		setAuthMessage(null);
		const fn = action === 'login' ? login : register;
		const res = await fn(authEmail, authPassword);
		setAuthPending(false);
		if (res.ok) {
			setAuthMessage(null);
			await refreshSession();
			navigate('/dashboard');
		} else {
			setAuthMessage(res.error ?? 'Error');
		}
	};

	const handleLogout = async () => {
		await logoutAndRevoke();
		setSessionClinics([]);
		setActiveClinicId(null);
		setPatients([]);
		setAppointments([]);
	};

	const handleSeed = async () => {
		const [adminEntry, ...rest] = seedForm.users.split(',').map((s) => s.trim()).filter(Boolean);
		const usersPayload = [adminEntry, ...rest]
			.filter(Boolean)
			.map((entry) => {
				const [email, role] = entry.split(':');
				return { uid: email.trim(), email: email.trim(), roleInClinic: role?.trim() ?? 'staff' };
			});

		const payload = {
			secret: seedForm.secret,
			clinic: { clinicId: seedForm.clinicId || undefined, name: seedForm.clinicName || 'Clinica Demo' },
			users: usersPayload,
		};

		const res = await authedFetch('POST', '/dev/seed', payload, { includeClinicHeader: false });
		if (res.ok) {
			setAuthMessage('Seed OK');
			await refreshSession();
		} else {
			setAuthMessage(res.error ?? 'Seed failed');
		}
	};

	const loadMembers = async () => {
		if (!activeClinicId) return;
		const res = await authedFetch('GET', `/clinics/${activeClinicId}/members`);
		if (res.ok) {
			const items = Array.isArray(res.data?.data) ? res.data.data : [];
			const mapped: Membership[] = items.map((m: any) => ({
				clinicId: m.clinicId,
				clinicName: null,
				role: m.role,
				uid: m.uid,
			}));
			setMembers(mapped);
		}
	};

	const loadPatients = async () => {
		if (!activeClinicId) {
			setAuthMessage('Seleccioná una clínica activa');
			return;
		}
		setPatientsLoading(true);
		const res = await authedFetch('GET', '/patients');
		setPatientsLoading(false);
		if (res.ok) {
			setPatients(Array.isArray(res.data?.data) ? res.data.data : []);
		} else {
			setAuthMessage(res.error ?? 'No se pudieron cargar pacientes');
		}
	};

	const createPatient = async () => {
		if (!activeClinicId) {
			setAuthMessage('Seleccioná una clínica activa');
			return;
		}
		const res = await authedFetch('POST', '/patients', {
			name: patientForm.name,
			email: patientForm.email || null,
			phone: patientForm.phone || null,
		});
		if (res.ok) {
			await loadPatients();
		} else {
			setAuthMessage(res.error ?? 'No se pudo crear paciente');
		}
	};

	const assignNutri = async (patientId: string, nutriUid: string | null) => {
		const res = await authedFetch('POST', `/patients/${patientId}/assign-nutri`, {
			nutriUid,
		});
		if (res.ok) await loadPatients();
	};

	const loadAppointments = async () => {
		if (!activeClinicId) return;
		setAppointmentsLoading(true);
		const res = await authedFetch('GET', '/appointments');
		setAppointmentsLoading(false);
		if (res.ok) {
			setAppointments(Array.isArray(res.data?.data) ? res.data.data : []);
		} else {
			setAuthMessage(res.error ?? 'No se pudieron cargar turnos');
		}
	};

	const requestAppointment = async () => {
		const res = await authedFetch('POST', '/appointments/request', {});
		if (res.ok) {
			await loadAppointments();
		} else {
			setAuthMessage(res.error ?? 'No se pudo solicitar turno');
		}
	};

	const scheduleAppointment = async (id: string) => {
		const form = scheduleForms[id];
		if (!form?.nutriUid || !form?.when) {
			setAuthMessage('Completa nutri y fecha');
			return;
		}
		const iso = new Date(form.when).toISOString();
		const res = await authedFetch('POST', `/appointments/${id}/schedule`, {
			nutriUid: form.nutriUid,
			scheduledFor: iso,
		});
		if (res.ok) await loadAppointments();
		else setAuthMessage(res.error ?? 'No se pudo programar');
	};

	const cancelAppointment = async (id: string) => {
		const res = await authedFetch('POST', `/appointments/${id}/cancel`, {});
		if (res.ok) await loadAppointments();
		else setAuthMessage(res.error ?? 'No se pudo cancelar');
	};

	useEffect(() => {
		if (activeClinicId) {
			window.localStorage.setItem('qa-active-clinic', activeClinicId);
		} else {
			window.localStorage.removeItem('qa-active-clinic');
		}
	}, [activeClinicId]);

	useEffect(() => {
		if (activeClinicId) {
			void loadMembers();
			void loadPatients();
			void loadAppointments();
		}
	}, [activeClinicId]);

	const clinicOptions = sessionClinics.map((c) => (
		<option key={c.clinicId} value={c.clinicId}>
			{c.clinicName ?? c.clinicId} ({c.role})
		</option>
	));

	const nutriOptions = members.filter((m: any) => m.role === 'nutri').map((m: any) => m.uid ?? m.clinicId);

	const Landing = (
		<div className='page'>
			<section className='hero'>
				<div>
					<p className='eyebrow'>Nutri Platform</p>
					<h1>QA Console multi-clínica</h1>
					<p className='lead'>
						Seleccioná clínica activa, probá pacientes y turnos sin depender de curl.
					</p>
					<div className='actions'>
						<Link className='btn primary' to='/login'>
							Ingresar
						</Link>
						<Link className='btn ghost' to='/dashboard'>
							Ir al dashboard
						</Link>
					</div>
				</div>
			</section>
		</div>
	);

	const AuthPage = (
		<div className='page narrow'>
			<h2>Auth emulator</h2>
			<div className='card'>
				<label className='field'>
					<span>Email</span>
					<input
						value={authEmail}
						onChange={(e) => setAuthEmail(e.target.value)}
						autoComplete='email'
					/>
				</label>
				<label className='field'>
					<span>Password</span>
					<input
						type='password'
						value={authPassword}
						onChange={(e) => setAuthPassword(e.target.value)}
						autoComplete='current-password'
					/>
				</label>
				<div className='actions'>
					<button className='btn primary' disabled={authPending} onClick={() => handleLogin('login')}>
						Login
					</button>
					<button className='btn' disabled={authPending} onClick={() => handleLogin('register')}>
						Register
					</button>
					{user && (
						<button className='btn ghost' onClick={handleLogout}>
							Logout
						</button>
					)}
				</div>
				{authMessage && <p className='error-text'>{authMessage}</p>}
				{sessionError && (
					<p className='error-text'>
						{sessionError}{' '}
						<button className='link' onClick={clearSessionError}>
							OK
						</button>
					</p>
				)}
				<div className='inline-info'>
					<div>
						<strong>UID</strong> <code>{user?.uid ?? '—'}</code>
					</div>
					<div>
						<strong>Platform admin</strong> {isPlatformAdmin ? 'sí' : 'no'}
					</div>
				</div>
			</div>
		</div>
	);

	const Dashboard = (
		<div className='page'>
			<div className='grid two'>
				<div className='card'>
					<h3>Sesión</h3>
					<p>Seleccioná clínica activa y refrescá.</p>
					<div className='field'>
						<span>Idioma</span>
						<select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
							{supportedLocales.map((loc) => {
								const locCopy = getCopy(loc);
								return (
									<option key={loc} value={loc}>
										{locCopy.languageName}
									</option>
								);
							})}
						</select>
					</div>
					<label className='field'>
						<span>Clínica activa</span>
						<select value={activeClinicId ?? ''} onChange={(e) => setActiveClinicId(e.target.value || null)}>
							<option value=''>Elegir...</option>
							{clinicOptions}
						</select>
					</label>
					<div className='actions'>
						<button className='btn' onClick={refreshSession}>
							Refrescar sesión
						</button>
						<button className='btn ghost' onClick={loadPatients} disabled={!activeClinicId}>
							Listar pacientes
						</button>
						<button className='btn ghost' onClick={loadAppointments} disabled={!activeClinicId}>
							Listar turnos
						</button>
					</div>
					<div className='inline-info'>
						<div>
							<strong>Rol efectivo</strong> {effectiveRole ?? '—'}
						</div>
						<div>
							<strong>Clinics</strong> {sessionClinics.length}
						</div>
					</div>
				</div>

				<div className='card'>
					<h3>Dev tools / seed</h3>
					<label className='field'>
						<span>Secret</span>
						<input
							value={seedForm.secret}
							onChange={(e) => setSeedForm((p) => ({ ...p, secret: e.target.value }))}
						/>
					</label>
					<label className='field'>
						<span>Clinic ID (opcional)</span>
						<input
							value={seedForm.clinicId}
							onChange={(e) => setSeedForm((p) => ({ ...p, clinicId: e.target.value }))}
						/>
					</label>
					<label className='field'>
						<span>Clinic name</span>
						<input
							value={seedForm.clinicName}
							onChange={(e) => setSeedForm((p) => ({ ...p, clinicName: e.target.value }))}
						/>
					</label>
					<label className='field'>
						<span>Users (email:role, email:role)</span>
						<input
							value={seedForm.users}
							onChange={(e) => setSeedForm((p) => ({ ...p, users: e.target.value }))}
						/>
					</label>
					<button className='btn' onClick={handleSeed}>
						Seed clinic + members
					</button>
				</div>
			</div>

			<div className='grid two'>
				<div className='card'>
					<h3>Pacientes</h3>
					<div className='field'>
						<span>Nombre</span>
						<input
							value={patientForm.name}
							onChange={(e) => setPatientForm((p) => ({ ...p, name: e.target.value }))}
						/>
					</div>
					<div className='field'>
						<span>Email</span>
						<input
							value={patientForm.email}
							onChange={(e) => setPatientForm((p) => ({ ...p, email: e.target.value }))}
						/>
					</div>
					<div className='field'>
						<span>Phone</span>
						<input
							value={patientForm.phone}
							onChange={(e) => setPatientForm((p) => ({ ...p, phone: e.target.value }))}
						/>
					</div>
					<div className='actions'>
						<button className='btn primary' onClick={createPatient} disabled={!activeClinicId}>
							Crear paciente
						</button>
						<button className='btn ghost' onClick={loadPatients} disabled={!activeClinicId || patientsLoading}>
							Refrescar
						</button>
					</div>
					{patientsLoading && <p className='muted'>Cargando...</p>}
					{patients.length === 0 && <p className='muted'>Sin pacientes</p>}
					<div className='list'>
						{patients.map((p) => {
							const id = (p as any).id;
							return (
								<div className='inline-info' key={id}>
									<div>
										<strong>{(p as any).name}</strong>
										<div className='muted small'>{id}</div>
									</div>
									<div>
										<div className='field-inline'>
											<span className='muted small'>Nutri asignado</span>
											<select
												value={(p as any).assignedNutriUid ?? ''}
												onChange={(e) => assignNutri(id, e.target.value || null)}
											>
												<option value=''>No asignado</option>
												{nutriOptions.map((n) => (
													<option key={n} value={n}>
														{n}
													</option>
												))}
											</select>
										</div>
										<div className='muted small'>linkedUid: {(p as any).linkedUid ?? '—'}</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>

				<div className='card'>
					<h3>Turnos</h3>
					<div className='actions wrap'>
						<button className='btn' onClick={requestAppointment} disabled={!activeClinicId}>
							Solicitar turno (paciente vinculado)
						</button>
						<button className='btn ghost' onClick={loadAppointments} disabled={!activeClinicId || appointmentsLoading}>
							Refrescar
						</button>
					</div>
					{appointmentsLoading && <p className='muted'>Cargando...</p>}
					{appointments.length === 0 && <p className='muted'>Sin turnos</p>}
					<div className='list'>
						{appointments.map((a) => {
							const id = (a as any).id;
							const status = (a as any).status;
							const sched = (a as any).scheduledFor?._seconds
								? new Date((a as any).scheduledFor._seconds * 1000).toISOString()
								: null;
							return (
								<div className='appt-card' key={id}>
									<div className='appt-head'>
										<div>
											<strong>{status}</strong>
											<div className='muted small'>{id}</div>
										</div>
										<div className='muted small'>patientUid: {(a as any).patientUid}</div>
										<div className='muted small'>nutriUid: {(a as any).nutriUid ?? '—'}</div>
									</div>
									<div className='grid two'>
										<div className='field'>
											<span>Fecha/hora</span>
											<input
												type='datetime-local'
												value={scheduleForms[id]?.when ?? ''}
												onChange={(e) =>
													setScheduleForms((prev) => ({
														...prev,
														[id]: { ...(prev[id] ?? { nutriUid: (a as any).nutriUid ?? '' }), when: e.target.value },
													}))
												}
											/>
										</div>
										<div className='field'>
											<span>Nutri</span>
											<input
												value={scheduleForms[id]?.nutriUid ?? (a as any).nutriUid ?? ''}
												onChange={(e) =>
													setScheduleForms((prev) => ({
														...prev,
														[id]: { ...(prev[id] ?? { when: sched ?? '' }), nutriUid: e.target.value },
													}))
												}
												placeholder='nutri uid'
											/>
										</div>
									</div>
									<div className='actions wrap'>
										<button className='btn' onClick={() => scheduleAppointment(id)}>
											Programar
										</button>
										<button className='btn ghost' onClick={() => cancelAppointment(id)}>
											Cancelar
										</button>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			<div className='card'>
				<h3>Logs</h3>
				{logs.length === 0 && <p className='muted'>Sin logs</p>}
				<ul className='log'>
					{[...logs].reverse().map((l) => (
						<li key={l.id}>
							<div className='log-head'>
								<code>{l.ts}</code>
								<strong>{l.endpoint}</strong>
								<span className={l.ok ? 'pill ok' : 'pill error'}>
									{l.ok ? 'OK' : 'ERR'} {l.status}
								</span>
							</div>
							{l.request !== undefined && (
								<div className='log-body'>
									<small>req</small> <code>{JSON.stringify(l.request)}</code>
								</div>
							)}
							<div className='log-body'>
								<small>res</small> <code>{JSON.stringify(l.response)}</code>
							</div>
						</li>
					))}
				</ul>
			</div>
		</div>
	);

	return (
		<div>
			<nav className='topbar'>
				<div className='actions'>
					<Link to='/' className='brand'>
						Nutri QA Console
					</Link>
					<span className='badge'>multi-clínica</span>
				</div>
				<div className='top-actions'>
					<Link to='/' className='link'>
						Inicio
					</Link>
					<Link to='/dashboard' className='link'>
						Dashboard
					</Link>
					{user ? (
						<button className='btn ghost sm' onClick={handleLogout}>
							Logout
						</button>
					) : (
						<Link to='/login' className='btn sm'>
							Login
						</Link>
					)}
				</div>
			</nav>
			<Routes>
				<Route path='/' element={Landing} />
				<Route path='/login' element={AuthPage} />
				<Route
					path='/dashboard'
					element={
						<ProtectedRoute user={user}>
							{Dashboard}
						</ProtectedRoute>
					}
				/>
				<Route path='*' element={<Navigate to='/' />} />
			</Routes>
		</div>
	);
}

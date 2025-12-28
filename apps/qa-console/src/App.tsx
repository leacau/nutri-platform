import { useEffect, useMemo, useState } from 'react';
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
	children: JSX.Element;
};

function nowIso() {
	return new Date().toISOString();
}

function toIsoFromDatetimeLocal(v: string): string | null {
	if (!v || !v.includes('T')) return null;
	const d = new Date(v);
	if (!Number.isFinite(d.getTime())) return null;
	return d.toISOString();
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

	const [email, setEmail] = useState('qa1@test.com');
	const [password, setPassword] = useState('Passw0rd!');

	const [logs, setLogs] = useState<LogEntry[]>([]);

	// Pacientes
	const [pName, setPName] = useState('Juan Perez');
	const [pEmail, setPEmail] = useState('juan@test.com');
	const [pPhone, setPPhone] = useState('+549341000000');
	const [assignPatientId, setAssignPatientId] = useState('');
	const [assignNutriUid, setAssignNutriUid] = useState('');
	const [patients, setPatients] = useState<unknown[]>([]);

	// Turnos
	const [apptNutriUid, setApptNutriUid] = useState('');
	const [apptScheduleId, setApptScheduleId] = useState('');
	const [apptScheduleWhen, setApptScheduleWhen] = useState('');
	const [apptScheduleNutriUid, setApptScheduleNutriUid] = useState('');
	const [apptCancelId, setApptCancelId] = useState('');
	const [apptCompleteId, setApptCompleteId] = useState('');
	const [appointments, setAppointments] = useState<unknown[]>([]);

	const reversedLogs = useMemo(() => [...logs].reverse(), [logs]);

	useEffect(() => {
		const unsub = onAuthStateChanged(auth, async (u) => {
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
		});
		return () => unsub();
	}, []);

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

	async function authedFetch(
		method: 'GET' | 'POST' | 'PATCH',
		endpoint: string,
		body?: unknown
	) {
		if (!user) {
			pushErr(endpoint, body, 'Usuario no autenticado');
			return null;
		}
		const token = await getIdToken(user, true);

		const res = await fetch(`${API_BASE}${endpoint}`, {
			method,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: body ? JSON.stringify(body) : undefined,
		});

		const data = await res.json().catch(() => null);
		if (!res.ok) {
			pushErr(
				endpoint,
				body,
				`HTTP ${res.status} ${res.statusText} :: ${JSON.stringify(data)}`
			);
			return null;
		}
		pushOk(endpoint, body, data);
		return data;
	}

	async function handleLogin() {
		setLoading(true);
		try {
			const cred = await signInWithEmailAndPassword(auth, email, password);
			pushOk('auth/login', { email }, { uid: cred.user.uid });
			navigate('/dashboard');
		} catch (err) {
			pushErr(
				'auth/login',
				{ email },
				err instanceof Error ? err.message : 'Error desconocido'
			);
		} finally {
			setLoading(false);
		}
	}

	async function handleRegister() {
		setLoading(true);
		try {
			const cred = await createUserWithEmailAndPassword(auth, email, password);
			pushOk('auth/register', { email }, { uid: cred.user.uid });
			navigate('/dashboard');
		} catch (err) {
			pushErr(
				'auth/register',
				{ email },
				err instanceof Error ? err.message : 'Error desconocido'
			);
		} finally {
			setLoading(false);
		}
	}

	async function handleLogout() {
		setLoading(true);
		try {
			await signOut(auth);
			pushOk('auth/logout', undefined, { ok: true });
			setPatients([]);
			setAppointments([]);
			navigate('/login');
		} catch (err) {
			pushErr(
				'auth/logout',
				undefined,
				err instanceof Error ? err.message : 'Error desconocido'
			);
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
		} catch (err) {
			pushErr(
				'auth/refresh',
				undefined,
				err instanceof Error ? err.message : 'Error desconocido'
			);
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
			});
			if (created) {
				await handleListPatients();
			}
		} finally {
			setLoading(false);
		}
	}

	async function handleListPatients() {
		setLoading(true);
		try {
			const data = await authedFetch('GET', '/patients');
			if (data && typeof data === 'object' && 'data' in data) {
				setPatients((data as any).data ?? []);
			}
		} finally {
			setLoading(false);
		}
	}

	async function handleAssignNutri() {
		setLoading(true);
		try {
			if (!assignPatientId || !assignNutriUid) {
				pushErr(
					'/patients/:id (assign)',
					{ assignPatientId, assignNutriUid },
					'Falta patientId o nutriUid'
				);
				return;
			}
			await authedFetch('PATCH', `/patients/${assignPatientId}`, {
				assignedNutriUid: assignNutriUid,
			});
			await handleListPatients();
		} finally {
			setLoading(false);
		}
	}

	async function handleListAppointments() {
		setLoading(true);
		try {
			const data = await authedFetch('GET', '/appointments');
			if (data && typeof data === 'object' && 'data' in data) {
				setAppointments((data as any).data ?? []);
			}
		} finally {
			setLoading(false);
		}
	}

	async function handleRequestAppointment() {
		setLoading(true);
		try {
			if (!apptNutriUid) {
				pushErr(
					'/appointments/request',
					{ apptNutriUid },
					'Falta nutriUid para pedir turno'
				);
				return;
			}
			await authedFetch('POST', '/appointments/request', {
				nutriUid: apptNutriUid,
			});
			await handleListAppointments();
		} finally {
			setLoading(false);
		}
	}

	async function handleScheduleAppointment() {
		setLoading(true);
		try {
			const iso = toIsoFromDatetimeLocal(apptScheduleWhen);
			if (!apptScheduleId || !iso) {
				pushErr(
					'/appointments/:id/schedule',
					{ apptScheduleId, apptScheduleWhen },
					'Falta appointmentId o fecha inválida'
				);
				return;
			}
			await authedFetch('POST', `/appointments/${apptScheduleId}/schedule`, {
				scheduledForIso: iso,
				nutriUid: apptScheduleNutriUid || apptNutriUid || '',
			});
			await handleListAppointments();
		} finally {
			setLoading(false);
		}
	}

	async function handleCancelAppointment() {
		setLoading(true);
		try {
			if (!apptCancelId) {
				pushErr(
					'/appointments/:id/cancel',
					{ apptCancelId },
					'Falta appointmentId'
				);
				return;
			}
			await authedFetch('POST', `/appointments/${apptCancelId}/cancel`, {});
			await handleListAppointments();
		} finally {
			setLoading(false);
		}
	}

	async function handleCompleteAppointment() {
		setLoading(true);
		try {
			if (!apptCompleteId) {
				pushErr(
					'/appointments/:id/complete',
					{ apptCompleteId },
					'Falta appointmentId'
				);
				return;
			}
			await authedFetch('POST', `/appointments/${apptCompleteId}/complete`, {});
			await handleListAppointments();
		} finally {
			setLoading(false);
		}
	}

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
					<label className='field'>
						<span>Email</span>
						<input
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder='usuario@test.com'
						/>
					</label>
					<label className='field'>
						<span>Password</span>
						<input
							type='password'
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder='mínimo 6 caracteres'
						/>
					</label>
					<div className='actions'>
						<button className='btn primary' disabled={loading} onClick={handleLogin}>
							Login
						</button>
						<button className='btn' disabled={loading} onClick={handleRegister}>
							Registrar
						</button>
						{user && (
							<button className='btn ghost' disabled={loading} onClick={handleLogout}>
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

		return (
			<div className='page'>
				<header className='subheader'>
					<div>
						<p className='eyebrow'>Sesión activa</p>
						<h2>{user?.email ?? 'Sin email'}</h2>
						<p className='muted'>
							Rol: <strong>{role ?? 'sin rol'}</strong> — Clínica:{' '}
							<strong>{claims.clinicId ?? 'n/a'}</strong>
						</p>
					</div>
					<div className='actions'>
						<button className='btn ghost' disabled={loading} onClick={handleRefreshClaims}>
							Refrescar claims
						</button>
						<button className='btn' disabled={loading} onClick={handleLogout}>
							Cerrar sesión
						</button>
					</div>
				</header>

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
								GET /api/users/me
							</button>
							<button
								className='btn'
								disabled={loading}
								onClick={() => authedFetch('GET', '/health')}
							>
								GET /api/health
							</button>
						</div>
					</div>

					<div className='card'>
						<h3>Pacientes</h3>
						{canClinic || role === 'platform_admin' ? (
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

								<div className='grid two'>
									<label className='field'>
										<span>patientId</span>
										<input
											value={assignPatientId}
											onChange={(e) => setAssignPatientId(e.target.value)}
											placeholder='ID de paciente'
										/>
									</label>
									<label className='field'>
										<span>nutriUid</span>
										<input
											value={assignNutriUid}
											onChange={(e) => setAssignNutriUid(e.target.value)}
											placeholder='UID del nutri'
										/>
									</label>
								</div>
								<div className='actions'>
									<button className='btn' disabled={loading} onClick={handleAssignNutri}>
										Asignar nutri
									</button>
									<button className='btn ghost' disabled={loading} onClick={handleListPatients}>
										Listar pacientes
									</button>
								</div>
								{patients.length > 0 && (
									<div className='list'>
										{patients.map((p, idx) => (
											<pre key={idx}>{JSON.stringify(p, null, 2)}</pre>
										))}
									</div>
								)}
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
					<div className='grid three'>
						<label className='field'>
							<span>nutriUid para solicitar</span>
							<input
								value={apptNutriUid}
								onChange={(e) => setApptNutriUid(e.target.value)}
								placeholder='UID del nutri'
							/>
						</label>
						<button className='btn primary' disabled={loading} onClick={handleRequestAppointment}>
							POST /appointments/request
						</button>
						<button className='btn ghost' disabled={loading} onClick={handleListAppointments}>
							Listar turnos
						</button>
					</div>

					<div className='grid three'>
						<label className='field'>
							<span>appointmentId</span>
							<input
								value={apptScheduleId}
								onChange={(e) => setApptScheduleId(e.target.value)}
								placeholder='ID a schedule'
							/>
						</label>
						<label className='field'>
							<span>Fecha/hora (local)</span>
							<input
								type='datetime-local'
								value={apptScheduleWhen}
								onChange={(e) => setApptScheduleWhen(e.target.value)}
							/>
						</label>
						<label className='field'>
							<span>nutriUid (opcional)</span>
							<input
								value={apptScheduleNutriUid}
								onChange={(e) => setApptScheduleNutriUid(e.target.value)}
								placeholder='UID para schedule'
							/>
						</label>
					</div>
					<div className='actions'>
						<button className='btn' disabled={loading} onClick={handleScheduleAppointment}>
							Schedule (clinic_admin / nutri)
						</button>
						<button className='btn' disabled={loading} onClick={handleCancelAppointment}>
							Cancelar turno
						</button>
						<button className='btn' disabled={loading} onClick={handleCompleteAppointment}>
							Completar turno
						</button>
					</div>

					{appointments.length > 0 && (
						<div className='list'>
							{appointments.map((a, idx) => (
								<pre key={idx}>{JSON.stringify(a, null, 2)}</pre>
							))}
						</div>
					)}
				</div>

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
			<nav className='topbar'>
				<Link to='/' className='brand'>
					Nutri Platform
				</Link>
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


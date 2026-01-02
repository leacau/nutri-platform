import { useEffect, useMemo, useState, type ReactElement } from 'react';
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
	children: ReactElement;
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
		const [patientAssignSelections, setPatientAssignSelections] = useState<
			Record<string, string>
		>({});
		const [patients, setPatients] = useState<unknown[]>([]);

		// Turnos
		const [apptRequestNutriUid, setApptRequestNutriUid] = useState('');
	const [scheduleSelections, setScheduleSelections] = useState<
		Record<string, { when: string; nutri: string }>
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
				clinicId: selectedClinicForNewPatient || undefined,
			});
			if (created.ok) {
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
			}
		} finally {
			setLoading(false);
		}
	}

	async function handleRequestAppointment() {
		setLoading(true);
		try {
			if (!apptRequestNutriUid) {
				pushErr(
					'/appointments/request',
					{ apptRequestNutriUid },
					'Falta nutriUid para pedir turno'
				);
				return;
			}
			const result = await authedFetch('POST', '/appointments/request', {
				nutriUid: apptRequestNutriUid,
			});
			if (result.ok) {
				setLinkRequired({ active: false, reason: '' });
				setLinkFlowMessage(null);
				await handleListAppointments();
			} else if (result.status === 403 && claims.role === 'patient') {
				const reason =
					(typeof result.data === 'object' &&
						result.data &&
						'message' in (result.data as any) &&
						typeof (result.data as any).message === 'string'
						? (result.data as any).message
						: result.error) ?? 'Necesitás vincular tu perfil antes de pedir turno.';
				setLinkRequired({ active: true, reason });
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

			const meRes = await authedFetch('GET', '/patients/me');
			if (
				meRes.ok &&
				meRes.data &&
				typeof meRes.data === 'object' &&
				'data' in (meRes.data as any) &&
				(meRes.data as any).data?.id
			) {
				patientId = (meRes.data as any).data.id as string;
			}

			if (!patientId) {
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
			await handleRequestAppointment();
		} finally {
			setLinking(false);
		}
	}

	async function handleScheduleAppointment(apptId: string) {
		setLoading(true);
		try {
			const sched = scheduleSelections[apptId];
			const iso = toIsoFromDatetimeLocal(sched?.when ?? '');
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
			}
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
			const isPlatform = role === 'platform_admin';
			const isPatient = role === 'patient';

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
							<button
								className='btn primary'
								disabled={loading || linking || !isPatient || knownNutris.length === 0}
								onClick={handleRequestAppointment}
							>
								Solicitar turno (paciente)
							</button>
							<button className='btn ghost' disabled={loading} onClick={handleListAppointments}>
								Listar turnos
							</button>
						</div>

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
										Crear paciente y linkear
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
									return (
										<div className='appt-card' key={appt.id ?? idx}>
											<div className='appt-head'>
												<div>
													<p className='eyebrow'>Turno</p>
													<strong>{appt.id ?? 'sin-id'}</strong>
												</div>
												<span className={`pill ${appt.status === 'completed' ? 'ok' : appt.status === 'cancelled' ? 'error' : ''}`}>
													{appt.status ?? 'sin-status'}
												</span>
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
											<div className='actions wrap'>
												{canSchedule && (
													<>
														<input
															type='datetime-local'
															value={sched.when}
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
														/>
														<select
															value={sched.nutri}
															disabled={lockNutri}
															onChange={(e) =>
																setScheduleSelections((prev) => ({
																	...prev,
																	[appt.id]: {
																		...prev[appt.id],
																		when: sched.when,
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
														<button
															className='btn'
															disabled={loading || !sched.when}
															onClick={() => handleScheduleAppointment(appt.id)}
														>
															Programar
														</button>
													</>
												)}
												<button
													className='btn ghost'
													disabled={loading}
													onClick={() => handleCancelAppointment(appt.id)}
												>
													Cancelar
												</button>
												{canComplete && (
													<button
														className='btn'
														disabled={loading}
														onClick={() => handleCompleteAppointment(appt.id)}
													>
														Completar
													</button>
												)}
											</div>
										</div>
									);
								})}
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

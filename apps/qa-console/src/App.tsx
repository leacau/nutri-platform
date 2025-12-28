import { useEffect, useMemo, useState } from 'react';
import {
	onAuthStateChanged,
	signInWithEmailAndPassword,
	createUserWithEmailAndPassword,
	signOut,
	getIdToken,
	getIdTokenResult,
	type User,
} from 'firebase/auth';
import { auth } from './firebase';

type LogEntry =
	| { ts: string; endpoint: string; payload?: unknown; ok: true; data: unknown }
	| {
			ts: string;
			endpoint: string;
			payload?: unknown;
			ok: false;
			error: string;
	  };

function nowIso(): string {
	return new Date().toISOString();
}

type ClaimsView = {
	role: string | null;
	clinicId: string | null;
};

function toIsoFromDatetimeLocal(v: string): string | null {
	// v: "2025-12-26T18:30"
	if (!v || !v.includes('T')) return null;
	const d = new Date(v);
	if (!Number.isFinite(d.getTime())) return null;
	return d.toISOString();
}

export default function App() {
	const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [loading, setLoading] = useState(false);

	const [user, setUser] = useState<User | null>(null);
	const [claims, setClaims] = useState<ClaimsView>({
		role: null,
		clinicId: null,
	});

	const [email, setEmail] = useState('qa1@test.com');
	const [password, setPassword] = useState('Passw0rd!');

	// Patients create
	const [pName, setPName] = useState('Juan Perez');
	const [pEmail, setPEmail] = useState('juan@test.com');
	const [pPhone, setPPhone] = useState('+549341000000');

	// Assign nutri to patient
	const [assignPatientId, setAssignPatientId] = useState('');
	const [assignNutriUid, setAssignNutriUid] = useState('');
	const [apptNutriUid, setApptNutriUid] = useState('');

	// Appointment flows
	const [apptNutriUidRequest, setApptNutriUidRequest] = useState('');
	const [apptScheduleId, setApptScheduleId] = useState('');
	const [apptScheduleIso, setApptScheduleIso] = useState('');
	const [apptScheduleNutriUid, setApptScheduleNutriUid] = useState('');
	const [apptCancelId, setApptCancelId] = useState('');
	const [apptCompleteId, setApptCompleteId] = useState('');
	const [apptScheduleWhen, setApptScheduleWhen] = useState(''); // datetime-local

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

	function pushOk(
		endpoint: string,
		payload: unknown | undefined,
		data: unknown
	) {
		setLogs((prev) => [
			...prev,
			{ ts: nowIso(), endpoint, payload, ok: true, data },
		]);
	}
	function pushErr(
		endpoint: string,
		payload: unknown | undefined,
		error: string
	) {
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
			pushErr(endpoint, body, 'No authenticated user');
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

	async function callAuthedGet(endpoint: string) {
		setLoading(true);
		try {
			await authedFetch('GET', endpoint);
		} finally {
			setLoading(false);
		}
	}

	async function callAuthedPost(endpoint: string, payload: unknown) {
		setLoading(true);
		try {
			await authedFetch('POST', endpoint, payload);
		} finally {
			setLoading(false);
		}
	}

	async function publicGet(endpoint: string) {
		setLoading(true);
		try {
			const res = await fetch(`${API_BASE}${endpoint}`, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' },
			});
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				pushErr(
					endpoint,
					undefined,
					`HTTP ${res.status} ${res.statusText} :: ${JSON.stringify(data)}`
				);
				return;
			}
			pushOk(endpoint, undefined, data);
		} catch (e) {
			pushErr(
				endpoint,
				undefined,
				e instanceof Error ? e.message : 'Unknown error'
			);
		} finally {
			setLoading(false);
		}
	}

	async function handleLogin() {
		setLoading(true);
		try {
			const cred = await signInWithEmailAndPassword(auth, email, password);
			pushOk(
				'AUTH login',
				{ email },
				{ uid: cred.user.uid, email: cred.user.email }
			);
		} catch (e) {
			pushErr(
				'AUTH login',
				{ email },
				e instanceof Error ? e.message : 'Unknown error'
			);
		} finally {
			setLoading(false);
		}
	}

	async function handleRegister() {
		setLoading(true);
		try {
			const cred = await createUserWithEmailAndPassword(auth, email, password);
			pushOk(
				'AUTH register',
				{ email },
				{ uid: cred.user.uid, email: cred.user.email }
			);
		} catch (e) {
			pushErr(
				'AUTH register',
				{ email },
				e instanceof Error ? e.message : 'Unknown error'
			);
		} finally {
			setLoading(false);
		}
	}

	async function handleLogout() {
		setLoading(true);
		try {
			await signOut(auth);
			pushOk('AUTH logout', undefined, { ok: true });
		} catch (e) {
			pushErr(
				'AUTH logout',
				undefined,
				e instanceof Error ? e.message : 'Unknown error'
			);
		} finally {
			setLoading(false);
		}
	}

	async function handleRefreshToken() {
		setLoading(true);
		try {
			if (!user) {
				pushErr('AUTH refreshToken', undefined, 'No authenticated user');
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
			pushOk('AUTH refreshToken', undefined, { ok: true, role, clinicId });
		} catch (e) {
			pushErr(
				'AUTH refreshToken',
				undefined,
				e instanceof Error ? e.message : 'Unknown error'
			);
		} finally {
			setLoading(false);
		}
	}

	async function handleCreatePatient() {
		setLoading(true);
		try {
			await authedFetch('POST', '/patients', {
				name: pName,
				email: pEmail || null,
				phone: pPhone || null,
			});
			// refresh list
			await authedFetch('GET', '/patients');
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
					'Missing patientId or nutriUid'
				);
				return;
			}
			await authedFetch('PATCH', `/patients/${assignPatientId}`, {
				assignedNutriUid: assignNutriUid,
			});
			await authedFetch('GET', '/patients');
		} finally {
			setLoading(false);
		}
	}

	async function handleRequestAppointmentAsPatient() {
		setLoading(true);
		try {
			if (!apptNutriUid) {
				pushErr(
					'/appointments/request',
					{ apptNutriUid },
					'Missing nutriUid to request appointment'
				);
				return;
			}
			await authedFetch('POST', '/appointments/request', {
				nutriUid: apptNutriUid,
			});
			await authedFetch('GET', '/appointments');
		} finally {
			setLoading(false);
		}
	}

	async function handleListAppointments() {
		setLoading(true);
		try {
			await authedFetch('GET', '/appointments');
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
					'Missing appointmentId or invalid datetime'
				);
				return;
			}
			await authedFetch('POST', `/appointments/${apptScheduleId}/schedule`, {
				scheduledForIso: iso,
				nutriUid: apptNutriUid,
			});

			await authedFetch('GET', '/appointments');
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
					'Missing appointmentId'
				);
				return;
			}
			await authedFetch('POST', `/appointments/${apptCancelId}/cancel`, {});
			await authedFetch('GET', '/appointments');
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
					'Missing appointmentId to complete'
				);
				return;
			}
			await authedFetch('POST', `/appointments/${apptCompleteId}/complete`, {});
			await authedFetch('GET', '/appointments');
		} finally {
			setLoading(false);
		}
	}

	return (
		<div
			style={{
				fontFamily: 'system-ui, Arial',
				padding: 16,
				maxWidth: 1200,
				margin: '0 auto',
			}}
		>
			<h2>Nutri Platform – QA Console</h2>

			<div
				style={{
					display: 'grid',
					gridTemplateColumns: '1fr 1fr',
					gap: 16,
					marginBottom: 16,
				}}
			>
				<div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
					<h3 style={{ marginTop: 0 }}>Auth (Emulator)</h3>

					<div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
						<input
							style={{ flex: 1 }}
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder='email'
						/>
						<input
							style={{ flex: 1 }}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder='password'
							type='password'
						/>
					</div>

					<div
						style={{
							display: 'flex',
							gap: 8,
							marginBottom: 10,
							flexWrap: 'wrap',
						}}
					>
						<button disabled={loading} onClick={handleLogin}>
							Login
						</button>
						<button disabled={loading} onClick={handleRegister}>
							Register
						</button>
						<button disabled={loading} onClick={handleLogout}>
							Logout
						</button>
						<button disabled={loading} onClick={handleRefreshToken}>
							Refresh token
						</button>
					</div>

					<div style={{ fontSize: 14, lineHeight: 1.4 }}>
						<div>
							<strong>user:</strong>{' '}
							<code>
								{user ? `${user.uid} (${user.email ?? 'no-email'})` : 'null'}
							</code>
						</div>
						<div>
							<strong>claims:</strong> <code>{JSON.stringify(claims)}</code>
						</div>
						<div style={{ opacity: 0.7 }}>
							API_BASE = <code>{API_BASE}</code>
						</div>
					</div>
				</div>

				<div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
					<h3 style={{ marginTop: 0 }}>API Calls</h3>

					<div
						style={{
							display: 'flex',
							gap: 8,
							flexWrap: 'wrap',
							marginBottom: 10,
						}}
					>
						<button disabled={loading} onClick={() => publicGet('/health')}>
							GET /api/health
						</button>
						<button
							disabled={loading}
							onClick={() => authedFetch('GET', '/users/me')}
						>
							GET /api/users/me
						</button>
						<button
							disabled={loading}
							onClick={() => authedFetch('GET', '/patients')}
						>
							GET /api/patients
						</button>
						<button disabled={loading} onClick={handleListAppointments}>
							GET /api/appointments
						</button>
					</div>

					<hr />

					<h4 style={{ margin: '10px 0 6px' }}>Patients – Create</h4>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: '1fr 1fr 1fr',
							gap: 8,
						}}
					>
						<input
							value={pName}
							onChange={(e) => setPName(e.target.value)}
							placeholder='name'
						/>
						<input
							value={pEmail}
							onChange={(e) => setPEmail(e.target.value)}
							placeholder='email'
						/>
						<input
							value={pPhone}
							onChange={(e) => setPPhone(e.target.value)}
							placeholder='phone'
						/>
					</div>
					<div style={{ marginTop: 8 }}>
						<button disabled={loading} onClick={handleCreatePatient}>
							POST /api/patients
						</button>
					</div>

					<hr />

					<h4 style={{ margin: '10px 0 6px' }}>Patients – Assign Nutri</h4>
					<div
						style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
					>
						<input
							value={assignPatientId}
							onChange={(e) => setAssignPatientId(e.target.value)}
							placeholder='patientId (Firestore doc id)'
						/>
						<input
							value={assignNutriUid}
							onChange={(e) => setAssignNutriUid(e.target.value)}
							placeholder='nutriUid (auth uid)'
						/>
					</div>
					<div style={{ marginTop: 8 }}>
						<button disabled={loading} onClick={handleAssignNutri}>
							PATCH /api/patients/:id (assignedNutriUid)
						</button>
					</div>

					<hr style={{ margin: '12px 0', opacity: 0.3 }} />

					<h4 style={{ margin: '8px 0' }}>Appointments</h4>

					<div
						style={{
							display: 'grid',
							gap: 8,
							gridTemplateColumns: '1fr 1fr 1fr',
						}}
					>
						<input
							value={apptNutriUidRequest}
							onChange={(e) => setApptNutriUidRequest(e.target.value)}
							placeholder='nutriUid (para request)'
						/>
						<button
							disabled={loading}
							onClick={() =>
								callAuthedPost('/appointments/request', {
									nutriUid: apptNutriUidRequest,
								})
							}
						>
							POST /api/appointments/request
						</button>
						<button
							disabled={loading}
							onClick={() => callAuthedGet('/appointments')}
						>
							GET /api/appointments
						</button>
					</div>

					<div
						style={{
							display: 'grid',
							gap: 8,
							gridTemplateColumns: '1fr 1fr 1fr 1fr',
							marginTop: 10,
						}}
					>
						<input
							value={apptScheduleId}
							onChange={(e) => setApptScheduleId(e.target.value)}
							placeholder='appointmentId (schedule)'
						/>
						<input
							value={apptScheduleIso}
							onChange={(e) => setApptScheduleIso(e.target.value)}
							placeholder='scheduledForIso (ej: 2025-12-26T15:30:00.000Z)'
						/>
						<input
							value={apptScheduleNutriUid}
							onChange={(e) => setApptScheduleNutriUid(e.target.value)}
							placeholder='nutriUid (schedule)'
						/>
						<button
							disabled={loading}
							onClick={() =>
								callAuthedPost(`/appointments/${apptScheduleId}/schedule`, {
									scheduledForIso: apptScheduleIso,
									nutriUid: apptScheduleNutriUid,
								})
							}
						>
							POST /api/appointments/:id/schedule
						</button>
					</div>

					<div
						style={{
							display: 'grid',
							gap: 8,
							gridTemplateColumns: '1fr 1fr',
							marginTop: 10,
						}}
					>
						<input
							value={apptCancelId}
							onChange={(e) => setApptCancelId(e.target.value)}
							placeholder='appointmentId (cancel)'
						/>
						<button
							disabled={loading}
							onClick={() =>
								callAuthedPost(`/appointments/${apptCancelId}/cancel`, {})
							}
						>
							POST /api/appointments/:id/cancel
						</button>
					</div>

					<div
						style={{
							display: 'grid',
							gap: 8,
							gridTemplateColumns: '1fr 1fr',
							marginTop: 10,
						}}
					>
						<input
							value={apptCompleteId}
							onChange={(e) => setApptCompleteId(e.target.value)}
							placeholder='appointmentId (complete)'
						/>
						<button disabled={loading} onClick={handleCompleteAppointment}>
							POST /api/appointments/:id/complete
						</button>
					</div>

					<hr />

					<h4 style={{ margin: '10px 0 6px' }}>Appointments</h4>
					<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
						<button
							disabled={loading}
							onClick={handleRequestAppointmentAsPatient}
						>
							POST /api/appointments/request (patient)
						</button>
					</div>

					<div style={{ marginTop: 10 }}>
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: '1fr 1fr',
								gap: 8,
							}}
						>
							<input
								value={apptScheduleId}
								onChange={(e) => setApptScheduleId(e.target.value)}
								placeholder='appointmentId'
							/>
							<input
								value={apptScheduleWhen}
								onChange={(e) => setApptScheduleWhen(e.target.value)}
								type='datetime-local'
							/>
							<input
								value={apptNutriUid}
								onChange={(e) => setApptNutriUid(e.target.value)}
								placeholder='nutriUid'
							/>
						</div>
						<div style={{ marginTop: 8 }}>
							<button disabled={loading} onClick={handleScheduleAppointment}>
								POST /api/appointments/:id/schedule (nutri/clinic_admin)
							</button>
						</div>
					</div>

					<div style={{ marginTop: 10 }}>
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: '1fr auto',
								gap: 8,
							}}
						>
							<input
								value={apptCancelId}
								onChange={(e) => setApptCancelId(e.target.value)}
								placeholder='appointmentId to cancel'
							/>
							<button disabled={loading} onClick={handleCancelAppointment}>
								POST /api/appointments/:id/cancel
							</button>
						</div>
					</div>

					<p style={{ marginBottom: 0, opacity: 0.7, marginTop: 10 }}>
						Nota: “request” es idempotente (1 requested activo). “schedule” solo
						desde status=requested.
					</p>
				</div>
			</div>

			<div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
				<h3 style={{ marginTop: 0 }}>Log</h3>

				{reversedLogs.length === 0 ? (
					<p style={{ opacity: 0.7 }}>Sin llamadas todavía.</p>
				) : (
					<ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
						{reversedLogs.map((l, idx) => (
							<li
								key={idx}
								style={{
									padding: '10px 8px',
									borderBottom: '1px solid #eee',
									whiteSpace: 'pre-wrap',
								}}
							>
								<div
									style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}
								>
									<code>{l.ts}</code>
									<strong>{l.endpoint}</strong>
									<span style={{ marginLeft: 'auto', fontWeight: 700 }}>
										{l.ok ? 'OK' : 'ERROR'}
									</span>
								</div>
								{l.payload !== undefined && (
									<div>
										<small>payload:</small>{' '}
										<code>{JSON.stringify(l.payload)}</code>
									</div>
								)}
								<div>
									<small>{l.ok ? 'data:' : 'error:'}</small>{' '}
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

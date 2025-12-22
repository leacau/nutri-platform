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

type PatientCreatePayload = {
	name: string;
	email?: string | null;
	phone?: string | null;
	linkedUid?: string | null;
};

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

	// Token tools
	const [idToken, setIdToken] = useState<string | null>(null);

	// Patients form
	const [pName, setPName] = useState('Juan Perez');
	const [pEmail, setPEmail] = useState('juan@test.com');
	const [pPhone, setPPhone] = useState('+549341000000');

	const reversedLogs = useMemo(() => [...logs].reverse(), [logs]);

	useEffect(() => {
		const unsub = onAuthStateChanged(auth, async (u) => {
			setUser(u);
			setIdToken(null);

			if (!u) {
				setClaims({ role: null, clinicId: null });
				return;
			}

			// Force refresh so claims are picked up right after /dev/set-claims
			const tokenRes = await getIdTokenResult(u, true);
			const role =
				typeof tokenRes.claims.role === 'string' ? tokenRes.claims.role : null;
			const clinicId =
				typeof tokenRes.claims.clinicId === 'string'
					? tokenRes.claims.clinicId
					: null;

			setClaims({ role, clinicId });

			// Keep a fresh idToken available (for copy/debug)
			const token = await getIdToken(u, true);
			setIdToken(token);
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

	async function callPublicGet(endpoint: string) {
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

	async function callAuthed(
		endpoint: string,
		method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
		payload?: unknown
	) {
		setLoading(true);
		try {
			if (!user) {
				pushErr(endpoint, payload, 'No authenticated user');
				return;
			}

			const token = await getIdToken(user, true);
			setIdToken(token);

			const res = await fetch(`${API_BASE}${endpoint}`, {
				method,
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body:
					method === 'GET' || method === 'DELETE'
						? undefined
						: JSON.stringify(payload ?? {}),
			});

			const data = await res.json().catch(() => null);
			if (!res.ok) {
				pushErr(
					endpoint,
					payload,
					`HTTP ${res.status} ${res.statusText} :: ${JSON.stringify(data)}`
				);
				return;
			}

			pushOk(endpoint, payload, data);
		} catch (e) {
			pushErr(
				endpoint,
				payload,
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
			setIdToken(null);
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
		if (!user) {
			pushErr('AUTH refreshToken', undefined, 'No authenticated user');
			return;
		}
		setLoading(true);
		try {
			const tokenRes = await getIdTokenResult(user, true);
			const role =
				typeof tokenRes.claims.role === 'string' ? tokenRes.claims.role : null;
			const clinicId =
				typeof tokenRes.claims.clinicId === 'string'
					? tokenRes.claims.clinicId
					: null;
			setClaims({ role, clinicId });

			const token = await getIdToken(user, true);
			setIdToken(token);

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

	async function copyToken() {
		if (!idToken) {
			pushErr('COPY token', undefined, 'No idToken available');
			return;
		}
		try {
			await navigator.clipboard.writeText(idToken);
			pushOk('COPY token', undefined, { ok: true });
		} catch (e) {
			pushErr(
				'COPY token',
				undefined,
				e instanceof Error ? e.message : 'Copy failed'
			);
		}
	}

	function buildPatientPayload(): PatientCreatePayload {
		return {
			name: pName.trim(),
			email: pEmail.trim() ? pEmail.trim() : null,
			phone: pPhone.trim() ? pPhone.trim() : null,
		};
	}

	return (
		<div
			style={{
				fontFamily: 'system-ui, Arial',
				padding: 16,
				maxWidth: 1100,
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

					<div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
						<button disabled={loading} onClick={handleLogin}>
							Login
						</button>
						<button disabled={loading} onClick={handleRegister}>
							Register
						</button>
						<button disabled={loading} onClick={handleLogout}>
							Logout
						</button>
						<button disabled={loading || !user} onClick={handleRefreshToken}>
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

						<div style={{ marginTop: 10 }}>
							<strong>idToken:</strong>{' '}
							<code
								style={{
									display: 'inline-block',
									maxWidth: 720,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									verticalAlign: 'bottom',
								}}
							>
								{idToken
									? `${idToken.slice(0, 18)}...${idToken.slice(-18)}`
									: 'null'}
							</code>{' '}
							<button disabled={!idToken || loading} onClick={copyToken}>
								Copy
							</button>
						</div>

						<div style={{ opacity: 0.7, marginTop: 6 }}>
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
						<button disabled={loading} onClick={() => callPublicGet('/health')}>
							GET /api/health
						</button>

						<button
							disabled={loading}
							onClick={() => callAuthed('/users/me', 'GET')}
						>
							GET /api/users/me
						</button>

						<button
							disabled={loading}
							onClick={() => callAuthed('/patients', 'GET')}
						>
							GET /api/patients
						</button>
					</div>

					<div style={{ borderTop: '1px solid #eee', paddingTop: 10 }}>
						<h4 style={{ margin: '0 0 8px 0' }}>Patients – Create</h4>

						<div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
							<input
								style={{ flex: 1 }}
								value={pName}
								onChange={(e) => setPName(e.target.value)}
								placeholder='name'
							/>
							<input
								style={{ flex: 1 }}
								value={pEmail}
								onChange={(e) => setPEmail(e.target.value)}
								placeholder='email'
							/>
							<input
								style={{ flex: 1 }}
								value={pPhone}
								onChange={(e) => setPPhone(e.target.value)}
								placeholder='phone'
							/>
						</div>

						<button
							disabled={loading}
							onClick={() =>
								callAuthed('/patients', 'POST', buildPatientPayload())
							}
						>
							POST /api/patients
						</button>

						<p style={{ marginBottom: 0, opacity: 0.7 }}>
							Este POST requiere token real. El <code>clinicId</code> se toma
							del token (excepto platform_admin).
						</p>
					</div>
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


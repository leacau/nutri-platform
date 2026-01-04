import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	createUserWithEmailAndPassword,
	getIdTokenResult,
	onIdTokenChanged,
	signInWithEmailAndPassword,
	signOut,
	type User,
} from 'firebase/auth';
import { auth, firebaseConfig } from '../firebase';
import type { Claims } from '../types/app';

const getClaimsFromResult = (tokenRes: Awaited<ReturnType<typeof getIdTokenResult>>): Claims => {
	const role = typeof tokenRes.claims.role === 'string' ? tokenRes.claims.role : null;
	const clinicId = typeof tokenRes.claims.clinicId === 'string' ? tokenRes.claims.clinicId : null;
	return { role, clinicId };
};

type AuthSessionResult = {
	user: User | null;
	claims: Claims;
	sessionError: string | null;
	login: (email: string, password: string) => Promise<{ ok: boolean; user?: User; error?: string }>;
	register: (email: string, password: string) => Promise<{ ok: boolean; user?: User; error?: string }>;
	refreshClaims: () => Promise<boolean>;
	getValidIdToken: () => Promise<string | null>;
	logoutAndRevoke: () => Promise<{ ok: boolean; error: string | null }>;
	clearSessionError: () => void;
};

export function useAuthSession(): AuthSessionResult {
	if (import.meta.env.VITE_E2E_MOCK_AUTH === 'true') {
		return useMockAuthSession();
	}

	const [user, setUser] = useState<User | null>(auth.currentUser);
	const [claims, setClaims] = useState<Claims>({ role: null, clinicId: null });
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [idToken, setIdToken] = useState<string | null>(null);
	const [tokenExpiryMs, setTokenExpiryMs] = useState<number | null>(null);
	const refreshTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);
	const refreshIdTokenRef = useRef<((forceRefresh?: boolean) => Promise<string | null>) | null>(null);

	const clearRefreshTimer = useCallback(() => {
		if (refreshTimer.current) {
			window.clearTimeout(refreshTimer.current);
			refreshTimer.current = null;
		}
	}, []);

	const refreshIdToken = useCallback(
		async (forceRefresh = false): Promise<string | null> => {
			const currentUser = auth.currentUser;
			if (!currentUser) {
				setUser(null);
				setClaims({ role: null, clinicId: null });
				setIdToken(null);
				setTokenExpiryMs(null);
				setSessionError(null);
				clearRefreshTimer();
				return null;
			}

			try {
				const tokenRes = await getIdTokenResult(currentUser, forceRefresh);
				const nextClaims = getClaimsFromResult(tokenRes);
				setUser(currentUser);
				setClaims(nextClaims);
				setIdToken(tokenRes.token);
				setSessionError(null);

				const expirationMs = Date.parse(tokenRes.expirationTime);
				setTokenExpiryMs(Number.isFinite(expirationMs) ? expirationMs : null);
				clearRefreshTimer();
				if (Number.isFinite(expirationMs)) {
					const msUntilRefresh = Math.max(5_000, expirationMs - Date.now() - 60_000);
					refreshTimer.current = window.setTimeout(() => {
						void refreshIdTokenRef.current?.(true);
					}, msUntilRefresh);
				}

				return tokenRes.token;
			} catch (err) {
				const message =
					err instanceof Error
						? err.message
						: 'Session refresh failed. Please sign in again.';
				setSessionError(message);
				setIdToken(null);
				setTokenExpiryMs(null);
				clearRefreshTimer();
				return null;
			}
		},
		[clearRefreshTimer]
	);

	const getValidIdToken = useCallback(async (): Promise<string | null> => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			setSessionError('Please sign in to continue.');
			return null;
		}
		if (idToken && tokenExpiryMs && tokenExpiryMs - Date.now() > 60_000) {
			return idToken;
		}
		return refreshIdToken(true);
	}, [idToken, refreshIdToken, tokenExpiryMs]);

	const login = useCallback(
		async (email: string, password: string) => {
			try {
				const cred = await signInWithEmailAndPassword(auth, email, password);
				await refreshIdToken(true);
				setSessionError(null);
				return { ok: true, user: cred.user };
			} catch (err) {
				const message =
					err instanceof Error ? err.message : 'Could not sign in. Check your credentials.';
				setSessionError(message);
				return { ok: false, error: message };
			}
		},
		[refreshIdToken]
	);

	const register = useCallback(
		async (email: string, password: string) => {
			try {
				const cred = await createUserWithEmailAndPassword(auth, email, password);
				await refreshIdToken(true);
				setSessionError(null);
				return { ok: true, user: cred.user };
			} catch (err) {
				const message =
					err instanceof Error ? err.message : 'Could not register the user. Try again.';
				setSessionError(message);
				return { ok: false, error: message };
			}
		},
		[refreshIdToken]
	);

	const refreshClaims = useCallback(async () => {
		const refreshed = await refreshIdToken(true);
		return Boolean(refreshed);
	}, [refreshIdToken]);

	const logoutAndRevoke = useCallback(async () => {
		const currentUser = auth.currentUser;
		let revokeError: string | null = null;

		if (currentUser && !import.meta.env.PROD) {
			try {
				const revokeRes = await fetch(
					`http://127.0.0.1:9099/emulator/v1/projects/${firebaseConfig.projectId}/accounts:signOut`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ localId: currentUser.uid }),
					}
				);
				if (!revokeRes.ok) {
					const detail = await revokeRes.text().catch(() => revokeRes.statusText);
					revokeError = detail || 'Error al revocar sesión en el emulador.';
					setSessionError(revokeError);
				}
			} catch (err) {
				revokeError =
					err instanceof Error ? err.message : 'Could not revoke the session in the emulator.';
				setSessionError(revokeError);
			}
		}

		await signOut(auth);
		setUser(null);
		setClaims({ role: null, clinicId: null });
		setIdToken(null);
		setTokenExpiryMs(null);
		clearRefreshTimer();

		return { ok: !revokeError, error: revokeError };
	}, [clearRefreshTimer]);

	useEffect(() => {
		const unsub = onIdTokenChanged(auth, () => {
			void refreshIdToken(false);
		});
		return () => unsub();
	}, [refreshIdToken]);

	useEffect(() => {
		refreshIdTokenRef.current = refreshIdToken;
	}, [refreshIdToken]);

	useEffect(
		() => () => {
			clearRefreshTimer();
		},
		[clearRefreshTimer]
	);

	const clearSessionError = useCallback(() => setSessionError(null), []);

	return {
		user,
		claims,
		sessionError,
		login,
		register,
		refreshClaims,
		getValidIdToken,
		logoutAndRevoke,
		clearSessionError,
	};
}

function useMockAuthSession(): AuthSessionResult {
	const [user, setUser] = useState<User | null>(null);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [claims, setClaims] = useState<Claims>(() => ({
		role: import.meta.env.VITE_E2E_ROLE ?? 'clinic_admin',
		clinicId: import.meta.env.VITE_E2E_CLINIC_ID ?? 'demo-clinic',
	}));

	const mockUser = useMemo(
		() =>
			({
				uid: 'e2e-user',
				email: 'qa1@test.com',
				providerData: [],
			}) as unknown as User,
		[]
	);

	const login = useCallback(
		async (email: string) => {
			const nextUser = { ...mockUser, email };
			setUser(nextUser);
			setSessionError(null);
			return { ok: true, user: nextUser };
		},
		[mockUser]
	);

	const register = useCallback(
		async (email: string) => {
			const nextUser = { ...mockUser, email };
			setUser(nextUser);
			setSessionError(null);
			return { ok: true, user: nextUser };
		},
		[mockUser]
	);

	const refreshClaims = useCallback(async () => true, []);

	const getValidIdToken = useCallback(async () => {
		if (!user) {
			setSessionError('Please sign in to continue.');
			return null;
		}
		return 'mock-token';
	}, [user]);

	const logoutAndRevoke = useCallback(async () => {
		setUser(null);
		setSessionError(null);
		setClaims({ role: import.meta.env.VITE_E2E_ROLE ?? 'clinic_admin', clinicId: import.meta.env.VITE_E2E_CLINIC_ID ?? 'demo-clinic' });
		return { ok: true, error: null };
	}, []);

	const clearSessionError = useCallback(() => setSessionError(null), []);

	return {
		user,
		claims,
		sessionError,
		login,
		register,
		refreshClaims,
		getValidIdToken,
		logoutAndRevoke,
		clearSessionError,
	};
}

export default useAuthSession;

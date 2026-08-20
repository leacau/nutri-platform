'use client';

import {
	User,
	createUserWithEmailAndPassword,
	getIdTokenResult,
	onAuthStateChanged,
	sendPasswordResetEmail,
	signInWithEmailAndPassword,
	signInWithPopup,
	signOut,
	updatePassword,
} from 'firebase/auth';
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from 'react';
import { getFirebaseAuth, googleProvider } from '../lib/firebase';

type AuthContextValue = {
	user: User | null;
	idToken: string | null;
	loading: boolean;
	refreshToken: () => Promise<void>;
	loginWithEmail: (
		email: string,
		password: string,
	) => Promise<{ token: string; claims: Record<string, unknown> }>;
	registerWithEmail: (email: string, password: string) => Promise<string>;
	loginWithGoogle: () => Promise<void>;
	updateCurrentPassword: (password: string) => Promise<void>;
	resetPassword: (email: string) => Promise<void>;
	logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [idToken, setIdToken] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const auth = getFirebaseAuth();

	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
			setUser(firebaseUser);
			if (firebaseUser) {
				const token = await firebaseUser.getIdToken();
				setIdToken(token);
			} else {
				setIdToken(null);
			}
			setLoading(false);
		});
		return () => unsubscribe();
	}, [auth]);

	const refreshToken = useCallback(async () => {
		if (!auth.currentUser) return;
		const token = await auth.currentUser.getIdToken(true);
		setIdToken(token);
	}, [auth]);

	const loginWithEmail = useCallback(
		async (email: string, password: string) => {
			const credentials = await signInWithEmailAndPassword(auth, email, password);
			const tokenResult = await getIdTokenResult(credentials.user, true);
			setIdToken(tokenResult.token);
			return { token: tokenResult.token, claims: tokenResult.claims };
		},
		[auth]
	);

	const registerWithEmail = useCallback(
		async (email: string, password: string) => {
			const credentials = await createUserWithEmailAndPassword(
				auth,
				email,
				password
			);
			const token = await credentials.user.getIdToken();
			setIdToken(token);
			return token;
		},
		[auth]
	);

	const loginWithGoogle = useCallback(async () => {
		await signInWithPopup(auth, googleProvider);
		await refreshToken();
	}, [auth, refreshToken]);

	const updateCurrentPassword = useCallback(
		async (password: string) => {
			if (!auth.currentUser) throw new Error('Missing authenticated user');
			await updatePassword(auth.currentUser, password);
		},
		[auth],
	);

	const resetPassword = useCallback(
		async (email: string) => {
			await sendPasswordResetEmail(auth, email);
		},
		[auth]
	);

	const logout = useCallback(async () => {
		if (auth.currentUser) await signOut(auth);
		setUser(null);
		setIdToken(null);
	}, [auth]);

	useEffect(() => {
		if (!user || typeof window === 'undefined') return;

		let timeoutId: number | null = null;
		const resetTimer = () => {
			if (timeoutId) window.clearTimeout(timeoutId);
			timeoutId = window.setTimeout(() => {
				void logout();
			}, INACTIVITY_TIMEOUT_MS);
		};
		const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
		events.forEach((event) =>
			window.addEventListener(event, resetTimer, { passive: true }),
		);
		resetTimer();

		return () => {
			if (timeoutId) window.clearTimeout(timeoutId);
			events.forEach((event) => window.removeEventListener(event, resetTimer));
		};
	}, [logout, user]);

	return (
		<AuthContext.Provider
			value={{
				user,
				idToken,
				loading,
				refreshToken,
				loginWithEmail,
				registerWithEmail,
				loginWithGoogle,
				updateCurrentPassword,
				resetPassword,
				logout,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
	return ctx;
}

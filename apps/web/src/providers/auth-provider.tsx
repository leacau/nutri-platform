'use client';

import {
	User,
	createUserWithEmailAndPassword,
	onAuthStateChanged,
	sendPasswordResetEmail,
	signInWithEmailAndPassword,
	signInWithPopup,
	signOut,
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
	qaLogin: (uid: string, email?: string | null) => void;
	loginWithEmail: (email: string, password: string) => Promise<void>;
	registerWithEmail: (email: string, password: string) => Promise<string>;
	loginWithGoogle: () => Promise<void>;
	resetPassword: (email: string) => Promise<void>;
	logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const QA_AUTH_STORAGE_KEY = 'amsa-core.qaAuth.v1';

function createQaUser(uid: string, email?: string | null): User {
	return {
		uid,
		email: email ?? `${uid}@qa.local`,
		displayName: uid,
		photoURL: null,
		phoneNumber: null,
		providerId: 'qa',
		emailVerified: true,
		isAnonymous: false,
		metadata: {},
		providerData: [],
		refreshToken: '',
		tenantId: null,
		delete: async () => undefined,
		getIdToken: async () => `qa:${uid}`,
		getIdTokenResult: async () => {
			throw new Error('QA user does not support getIdTokenResult');
		},
		reload: async () => undefined,
		toJSON: () => ({ uid, email: email ?? `${uid}@qa.local` }),
	} as unknown as User;
}

function readQaSession(): { uid: string; email: string | null } | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage.getItem(QA_AUTH_STORAGE_KEY);
		return raw ? (JSON.parse(raw) as { uid: string; email: string | null }) : null;
	} catch {
		return null;
	}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const initialQaSession = readQaSession();
	const [qaSession, setQaSession] = useState(initialQaSession);
	const [user, setUser] = useState<User | null>(() =>
		initialQaSession
			? createQaUser(initialQaSession.uid, initialQaSession.email)
			: null,
	);
	const [idToken, setIdToken] = useState<string | null>(() =>
		initialQaSession ? `qa:${initialQaSession.uid}` : null,
	);
	const [loading, setLoading] = useState(!initialQaSession);
	const auth = getFirebaseAuth();

	useEffect(() => {
		if (qaSession) {
			setUser(createQaUser(qaSession.uid, qaSession.email));
			setIdToken(`qa:${qaSession.uid}`);
			setLoading(false);
			return;
		}

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
	}, [auth, qaSession]);

	const refreshToken = useCallback(async () => {
		if (qaSession) {
			setIdToken(`qa:${qaSession.uid}`);
			return;
		}
		if (!auth.currentUser) return;
		const token = await auth.currentUser.getIdToken(true);
		setIdToken(token);
	}, [auth, qaSession]);

	const qaLogin = useCallback((uid: string, email?: string | null) => {
		const session = { uid, email: email ?? null };
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(QA_AUTH_STORAGE_KEY, JSON.stringify(session));
		}
		setQaSession(session);
		setUser(createQaUser(uid, email));
		setIdToken(`qa:${uid}`);
		setLoading(false);
	}, []);

	const loginWithEmail = useCallback(
		async (email: string, password: string) => {
			await signInWithEmailAndPassword(auth, email, password);
			await refreshToken();
		},
		[auth, refreshToken]
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

	const resetPassword = useCallback(
		async (email: string) => {
			await sendPasswordResetEmail(auth, email);
		},
		[auth]
	);

	const logout = useCallback(async () => {
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem(QA_AUTH_STORAGE_KEY);
		}
		setQaSession(null);
		if (auth.currentUser) await signOut(auth);
		setUser(null);
		setIdToken(null);
	}, [auth]);

	return (
		<AuthContext.Provider
			value={{
				user,
				idToken,
				loading,
				refreshToken,
				qaLogin,
				loginWithEmail,
				registerWithEmail,
				loginWithGoogle,
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

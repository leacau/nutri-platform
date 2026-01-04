"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
} from "firebase/auth";
import { getFirebaseAuth, googleProvider } from "../lib/firebase";

type AuthContextValue = {
  user: User | null;
  idToken: string | null;
  loading: boolean;
  refreshToken: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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
      await signInWithEmailAndPassword(auth, email, password);
      await refreshToken();
    },
    [auth, refreshToken],
  );

  const registerWithEmail = useCallback(
    async (email: string, password: string) => {
      await createUserWithEmailAndPassword(auth, email, password);
      await refreshToken();
    },
    [auth, refreshToken],
  );

  const loginWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
    await refreshToken();
  }, [auth, refreshToken]);

  const resetPassword = useCallback(
    async (email: string) => {
      await sendPasswordResetEmail(auth, email);
    },
    [auth],
  );

  const logout = useCallback(async () => {
    await signOut(auth);
    setIdToken(null);
  }, [auth]);

  return (
    <AuthContext.Provider
      value={{ user, idToken, loading, refreshToken, loginWithEmail, registerWithEmail, loginWithGoogle, resetPassword, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}

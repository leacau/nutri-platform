'use client';

import { Clinic, MeResponse, Membership } from '../lib/types';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiClient } from '../lib/api-client';
import { useAuth } from './auth-provider';

type ClinicContextValue = {
	me: MeResponse | undefined;
	clinics: Clinic[] | undefined;
	activeClinicId: string | null;
	activeClinic: Clinic | undefined;
	activeMembership: Membership | undefined;
	platformRole: MeResponse['platformRole'];
	isLoading: boolean;
	setActiveClinic: (id: string) => void;
	clearClinic: () => void;
};

const ClinicContext = createContext<ClinicContextValue | undefined>(undefined);
const ACTIVE_CLINIC_STORAGE_KEY = 'amsa-core.activeClinicId.v1';
const LEGACY_ACTIVE_CLINIC_STORAGE_KEY = 'amsa-active-clinic';

export function ClinicProvider({ children }: { children: React.ReactNode }) {
	const { idToken, user } = useAuth();
	const qc = useQueryClient();
	const [activeClinicId, setActiveClinicId] = useState<string | null>(() => {
		if (typeof window === 'undefined') return null;
		const current = window.localStorage.getItem(ACTIVE_CLINIC_STORAGE_KEY);
		const legacy = window.localStorage.getItem(LEGACY_ACTIVE_CLINIC_STORAGE_KEY);
		if (!current && legacy) {
			window.localStorage.setItem(ACTIVE_CLINIC_STORAGE_KEY, legacy);
			window.localStorage.removeItem(LEGACY_ACTIVE_CLINIC_STORAGE_KEY);
			return legacy;
		}
		return current;
	});

	useEffect(() => {
		if (!user) {
			// El logout debe limpiar el contexto y FORZAR la limpieza del caché
			queueMicrotask(() => setActiveClinicId(null));
			if (typeof window !== 'undefined') {
				window.localStorage.removeItem(ACTIVE_CLINIC_STORAGE_KEY);
				window.localStorage.removeItem(LEGACY_ACTIVE_CLINIC_STORAGE_KEY);
			}
			// Limpiamos la caché de React Query al salir
			qc.clear();
		}
	}, [user, qc]);

	const meQuery = useQuery({
		// FIX: Agregamos el UID a la llave para que no se mezclen cachés entre logins
		queryKey: ['me', user?.uid],
		queryFn: () => apiClient.me(idToken || undefined),
		enabled: Boolean(idToken && user?.uid),
	});

	const me = meQuery.data;
	const isPlatformAdmin = me?.platformRole === 'platform_admin';

	const clinicsQuery = useQuery({
		// FIX: Agregamos el UID a la llave para forzar actualización
		queryKey: ['clinics', user?.uid, me?.platformRole],
		queryFn: () =>
			isPlatformAdmin
				? apiClient.adminClinics(idToken || undefined)
				: apiClient.clinics(idToken || undefined),
		enabled: Boolean(idToken && user?.uid && me),
	});

	const clinics = clinicsQuery.data;

	useEffect(() => {
		if (!isPlatformAdmin && !activeClinicId && clinics && clinics.length === 1) {
			const onlyClinic = clinics[0];
			if (!onlyClinic) return;
			queueMicrotask(() => setActiveClinicId(onlyClinic.id));
			if (typeof window !== 'undefined') {
				window.localStorage.setItem(ACTIVE_CLINIC_STORAGE_KEY, onlyClinic.id);
			}
		}
	}, [activeClinicId, clinics, isPlatformAdmin]);

	useEffect(() => {
		if (!activeClinicId || !clinics) return;
		if (!clinics.some((clinic) => clinic.id === activeClinicId)) {
			queueMicrotask(() => setActiveClinicId(null));
			if (typeof window !== 'undefined') {
				window.localStorage.removeItem(ACTIVE_CLINIC_STORAGE_KEY);
			}
		}
	}, [activeClinicId, clinics]);

	const activeClinicQuery = useQuery({
		queryKey: ['clinic-detail', activeClinicId],
		queryFn: () => apiClient.clinic(activeClinicId!, idToken || undefined),
		enabled: Boolean(idToken && activeClinicId),
		retry: (failureCount, error) => {
			if (error instanceof ApiError && error.status === 404) return false;
			return failureCount < 2;
		},
	});

	useEffect(() => {
		const error = activeClinicQuery.error;
		if (error instanceof ApiError && error.status === 404) {
			queueMicrotask(() => setActiveClinicId(null));
			if (typeof window !== 'undefined') {
				window.localStorage.removeItem(ACTIVE_CLINIC_STORAGE_KEY);
			}
		}
	}, [activeClinicQuery.error]);

	const activeMembership = useMemo(
		() => me?.memberships.find((m) => m.clinicId === activeClinicId),
		[me, activeClinicId],
	);

	const activeClinic = useMemo(
		() =>
			activeClinicQuery.data ??
			clinics?.find((clinic) => clinic.id === activeClinicId),
		[activeClinicQuery.data, clinics, activeClinicId],
	);

	const setActiveClinic = (id: string) => {
		setActiveClinicId(id);
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(ACTIVE_CLINIC_STORAGE_KEY, id);
			window.localStorage.removeItem(LEGACY_ACTIVE_CLINIC_STORAGE_KEY);
		}
	};

	const clearClinic = () => {
		setActiveClinicId(null);
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem(ACTIVE_CLINIC_STORAGE_KEY);
			window.localStorage.removeItem(LEGACY_ACTIVE_CLINIC_STORAGE_KEY);
		}
	};

	const value: ClinicContextValue = {
		me,
		clinics,
		activeClinicId,
		activeClinic,
		activeMembership,
		platformRole: me?.platformRole ?? null,
		isLoading:
			meQuery.isLoading ||
			clinicsQuery.isLoading ||
			activeClinicQuery.isLoading,
		setActiveClinic,
		clearClinic,
	};

	return (
		<ClinicContext.Provider value={value}>{children}</ClinicContext.Provider>
	);
}

export function useClinic() {
	const ctx = useContext(ClinicContext);
	if (!ctx) throw new Error('useClinic debe usarse dentro de ClinicProvider');
	return ctx;
}

'use client';

import { Clinic, MeResponse, Membership } from '../lib/types';
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react';

import { ApiError, apiClient } from '../lib/api-client';
import { useAuth } from './auth-provider';
import { useQuery } from '@tanstack/react-query';

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
const ACTIVE_CLINIC_STORAGE_KEY = 'amsa.active-clinic-id';

export function ClinicProvider({ children }: { children: React.ReactNode }) {
	const { idToken, user } = useAuth();
	const [activeClinicId, setActiveClinicId] = useState<string | null>(() => {
		if (typeof window === 'undefined') return null;
		return window.localStorage.getItem(ACTIVE_CLINIC_STORAGE_KEY);
	});

	useEffect(() => {
		if (!user && activeClinicId !== null) {
			// El logout debe limpiar el contexto de clínica para evitar filtrados cruzados.
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setActiveClinicId(null);
			if (typeof window !== 'undefined') {
				window.localStorage.removeItem(ACTIVE_CLINIC_STORAGE_KEY);
			}
		}
	}, [user, activeClinicId]);

	const meQuery = useQuery({
		queryKey: ['me'],
		queryFn: () => apiClient.me(idToken || undefined),
		enabled: Boolean(idToken),
	});

	const clinicsQuery = useQuery({
		queryKey: ['clinics', meQuery.data?.platformRole],
		queryFn: () => {
			if (meQuery.data?.platformRole === 'platform_admin') {
				return apiClient.adminClinics(idToken || undefined);
			}
			return apiClient.clinics(idToken || undefined);
		},
		enabled: Boolean(idToken && meQuery.data),
	});

	const me = meQuery.data;
	const clinics = clinicsQuery.data;

	const activeClinicQuery = useQuery({
		queryKey: ['clinic', activeClinicId],
		queryFn: () => apiClient.clinicById(activeClinicId as string, idToken || undefined),
		enabled: Boolean(idToken && activeClinicId),
		retry: false,
	});

	const setActiveClinic = useCallback((id: string) => {
		setActiveClinicId(id);
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(ACTIVE_CLINIC_STORAGE_KEY, id);
		}
	}, []);

	const clearClinic = useCallback(() => {
		setActiveClinicId(null);
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem(ACTIVE_CLINIC_STORAGE_KEY);
		}
	}, []);

	useEffect(() => {
		if (
			!activeClinicId &&
			clinics &&
			clinics.length === 1 &&
			me?.platformRole !== 'platform_admin'
		) {
			setActiveClinicId(clinics[0].id);
			if (typeof window !== 'undefined') {
				window.localStorage.setItem(
					ACTIVE_CLINIC_STORAGE_KEY,
					clinics[0].id
				);
			}
		}
	}, [activeClinicId, clinics, me?.platformRole]);

	useEffect(() => {
		if (!activeClinicId || !clinics) return;
		if (!clinics.some((clinic) => clinic.id === activeClinicId)) {
			clearClinic();
		}
	}, [activeClinicId, clinics, clearClinic]);

	useEffect(() => {
		if (!activeClinicId || !activeClinicQuery.error) return;
		if (activeClinicQuery.error instanceof ApiError) {
			if (activeClinicQuery.error.status === 404) {
				clearClinic();
			}
		}
	}, [activeClinicId, activeClinicQuery.error, clearClinic]);

	const activeMembership = useMemo(
		() => me?.memberships.find((m) => m.clinicId === activeClinicId),
		[me, activeClinicId]
	);

	const activeClinic = useMemo(
		() => clinics?.find((clinic) => clinic.id === activeClinicId),
		[clinics, activeClinicId]
	);

	const value: ClinicContextValue = {
		me,
		clinics,
		activeClinicId,
		activeClinic,
		activeMembership,
		platformRole: me?.platformRole ?? null,
		isLoading: meQuery.isLoading || clinicsQuery.isLoading,
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

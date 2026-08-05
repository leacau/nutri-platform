'use client';

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useAuth } from '../providers/auth-provider';
import { useClinic } from '../providers/clinic-provider';

export function useAuthedQuery<TQueryFnData, TError = Error>(
	options: Omit<UseQueryOptions<TQueryFnData, TError>, 'queryFn'> & {
		queryFn: (token: string, clinicId: string) => Promise<TQueryFnData>;
	},
) {
	const { idToken, user } = useAuth();
	const { activeClinicId, activeMembership, platformRole } = useClinic();

	const enabled = Boolean(idToken && activeClinicId && options.enabled !== false);
	const scopedQueryKey = [
		...(options.queryKey ?? []),
		activeClinicId,
		user?.uid,
		activeMembership?.role ?? platformRole ?? null,
	];

	return useQuery<TQueryFnData, TError>({
		...options,
		queryKey: scopedQueryKey,
		enabled,
		queryFn: () => options.queryFn(idToken as string, activeClinicId as string),
	});
}

"use client";

import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import { useAuth } from "../providers/auth-provider";
import { useClinic } from "../providers/clinic-provider";

export function useAuthedQuery<TQueryFnData, TError = Error>(options: Omit<UseQueryOptions<TQueryFnData, TError>, "queryFn"> & { queryFn: (token: string, clinicId: string) => Promise<TQueryFnData> }) {
  const { idToken } = useAuth();
  const { activeClinicId } = useClinic();

  const enabled = Boolean(idToken && activeClinicId && options.enabled !== false);

  return useQuery<TQueryFnData, TError>({
    ...options,
    enabled,
    queryFn: () => options.queryFn(idToken as string, activeClinicId as string),
  });
}

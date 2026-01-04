"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";
import { Clinic, MeResponse, Membership } from "../lib/types";
import { useAuth } from "./auth-provider";

type ClinicContextValue = {
  me: MeResponse | undefined;
  clinics: Clinic[] | undefined;
  activeClinicId: string | null;
  activeClinic: Clinic | undefined;
  activeMembership: Membership | undefined;
  platformRole: MeResponse["platformRole"];
  isLoading: boolean;
  setActiveClinic: (id: string) => void;
  clearClinic: () => void;
};

const ClinicContext = createContext<ClinicContextValue | undefined>(undefined);

export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const { idToken, user } = useAuth();
  const [activeClinicId, setActiveClinicId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("amsa-active-clinic");
  });

  useEffect(() => {
    if (!user && activeClinicId !== null) {
      // El logout debe limpiar el contexto de clínica para evitar filtrados cruzados.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveClinicId(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("amsa-active-clinic");
      }
    }
  }, [user, activeClinicId]);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => apiClient.me(idToken || undefined),
    enabled: Boolean(idToken),
  });

  const clinicsQuery = useQuery({
    queryKey: ["clinics"],
    queryFn: () => apiClient.clinics(idToken || undefined),
    enabled: Boolean(idToken),
  });

  const me = meQuery.data;
  const clinics = clinicsQuery.data;

  const activeMembership = useMemo(() => me?.memberships.find((m) => m.clinicId === activeClinicId), [me, activeClinicId]);

  const activeClinic = useMemo(
    () => clinics?.find((clinic) => clinic.id === activeClinicId),
    [clinics, activeClinicId],
  );

  const setActiveClinic = (id: string) => {
    setActiveClinicId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("amsa-active-clinic", id);
    }
  };

  const clearClinic = () => {
    setActiveClinicId(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("amsa-active-clinic");
    }
  };

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

  return <ClinicContext.Provider value={value}>{children}</ClinicContext.Provider>;
}

export function useClinic() {
  const ctx = useContext(ClinicContext);
  if (!ctx) throw new Error("useClinic debe usarse dentro de ClinicProvider");
  return ctx;
}

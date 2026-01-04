"use client";

import { ChevronsUpDown, Hospital } from "lucide-react";
import { useRouter } from "next/navigation";
import { useClinic } from "../providers/clinic-provider";
import { Button } from "./ui/button";
import { Select } from "./ui/select";

export function ClinicSwitcher() {
  const { clinics, activeClinicId, setActiveClinic, me } = useClinic();
  const router = useRouter();

  const handleChange = (id: string) => {
    setActiveClinic(id);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Hospital className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs uppercase text-muted-foreground">Clínica activa</p>
        <div className="flex items-center gap-2">
          <Select value={activeClinicId || ""} onChange={(e) => handleChange(e.target.value)} className="min-w-[200px]">
            <option value="" disabled>
              Seleccionar clínica
            </option>
            {clinics?.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>
                {clinic.name} · {me?.memberships.find((m) => m.clinicId === clinic.id)?.role}
              </option>
            ))}
          </Select>
          <Button variant="outline" size="sm" onClick={() => router.push("/select-clinic")}>
            <ChevronsUpDown className="mr-2 h-4 w-4" />
            Cambiar
          </Button>
        </div>
      </div>
    </div>
  );
}

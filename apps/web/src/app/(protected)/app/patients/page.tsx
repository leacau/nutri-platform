"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Filter, Link as LinkIcon, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import Link from "next/link";
import { Select } from "../../../../components/ui/select";
import { Textarea } from "../../../../components/ui/textarea";
import { UserAccount } from "../../../../lib/types";
import { apiClient } from "../../../../lib/api-client";
import { useAuth } from "../../../../providers/auth-provider";
import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { useClinic } from "../../../../providers/clinic-provider";
import { useForm } from "react-hook-form";
import { usePermissions } from "../../../../hooks/use-permissions";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const patientSchema = z.object({
  name: z.string().min(2, "El nombre es requerido"),
  dni: z
    .string()
    .min(7, "El DNI debe tener al menos 7 dígitos")
    .max(8, "El DNI debe tener máximo 8 dígitos")
    .regex(/^\d+$/, "El DNI solo debe contener números"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  sexo: z.enum(["male", "female", "other"]),
  birthDate: z.string().optional(),
  assignedProfessionalId: z.string().optional(),
  notes: z.string().optional(),
});

type PatientForm = z.infer<typeof patientSchema>;

const accountUid = (account: UserAccount) => account.uid || account.id;

export default function PatientsPage() {
  const { activeClinicId } = useClinic();
  const { idToken } = useAuth();
  const perms = usePermissions();
  const qc = useQueryClient();
  const patientsQuery = useAuthedQuery({
    queryKey: ["patients", activeClinicId],
    queryFn: (token, clinicId) => apiClient.patients(clinicId, token),
  });
  const professionalsQuery = useAuthedQuery({
    queryKey: ["professionals", activeClinicId],
    queryFn: (token, clinicId) => apiClient.professionals(clinicId, token),
    enabled: perms.canAssignAnyPatient,
  });

  const [search, setSearch] = useState("");
  const [selectedProfessional, setSelectedProfessional] = useState("all");
  const [linkMessage, setLinkMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (data: PatientForm) => {
      if (!activeClinicId) throw new Error("Sin espacio activo");
      const assignedProfessionalUids = data.assignedProfessionalId
        ? [data.assignedProfessionalId]
        : [];
      return apiClient.createPatient(
        activeClinicId,
        {
          ...data,
          assignedProfessionalUids,
        },
        idToken ?? undefined,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients", activeClinicId] });
      reset();
      setLinkMessage(null);
      alert("Paciente guardado/vinculado exitosamente");
    },
    onError: () => {
      alert("Error al guardar paciente");
    },
  });

  const portalAccessMutation = useMutation({
    mutationFn: async (data: {
      patientId: string;
      portalAccessEnabled?: boolean;
      medicalRecordAccessEnabled?: boolean;
    }) => {
      if (!activeClinicId) throw new Error("Sin espacio activo");
      return apiClient.updatePatient(
        data.patientId,
        activeClinicId,
        {
          portalAccessEnabled: data.portalAccessEnabled,
          medicalRecordAccessEnabled: data.medicalRecordAccessEnabled,
        },
        idToken ?? undefined,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients", activeClinicId] });
    },
    onError: () => {
      alert("No pudimos actualizar accesos del paciente");
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm<PatientForm>({
    resolver: zodResolver(patientSchema),
    defaultValues: { sexo: "female" },
  });

  const handleDniBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const dniVal = e.target.value;
    if (dniVal.length < 7 || !activeClinicId) {
      setLinkMessage(null);
      return;
    }

    try {
      const found = await apiClient.lookupPatient(
        dniVal,
        activeClinicId,
        idToken ?? undefined,
      );

      if (found) {
        setValue("name", found.name || "");
        if (found.email) setValue("email", found.email);
        if (found.phone) setValue("phone", found.phone);
        if (found.sexo) setValue("sexo", found.sexo);
        if (found.birthDate) setValue("birthDate", found.birthDate);

        if (found.clinicId === activeClinicId) {
          setLinkMessage(
            `Este paciente ya está registrado en la clínica. Haz clic en Vincular para agregarlo a tu lista.`,
          );
        } else if (found.clinicId) {
          setLinkMessage(
            `Paciente encontrado en otra clínica de la red. Haz clic en Vincular para traer su perfil.`,
          );
        } else {
          setLinkMessage(
            `Persona encontrada en la plataforma. Haz clic en Vincular para crearle una ficha médica.`,
          );
        }
      } else {
        setLinkMessage(null);
      }
    } catch (error) {
      console.error("Error buscando paciente:", error);
      setLinkMessage(null);
    }
  };

  const patients = useMemo(() => {
    const list = patientsQuery.data || [];
    return list.filter((patient) => {
      const matchesSearch = patient.name
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesProfessional =
        selectedProfessional === "all" ||
        (patient.assignedProfessionalUids ?? []).includes(selectedProfessional);
      return matchesSearch && matchesProfessional;
    });
  }, [patientsQuery.data, search, selectedProfessional]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,400px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              Gestión de pacientes
            </p>
            <h1 className="text-2xl font-semibold text-primary">Pacientes</h1>
          </div>
          <Badge variant="secondary">
            {patientsQuery.data?.length ?? 0} registros
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={selectedProfessional}
              onChange={(e) => setSelectedProfessional(e.target.value)}
              className="w-56"
            >
              <option value="all">Todos los profesionales</option>
              {professionalsQuery.data?.map((professional: UserAccount) => (
                <option key={professional.id} value={accountUid(professional)}>
                  {professional.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <Card>
          <CardContent className="divide-y p-0">
            {patients.map((patient) => (
              <div
                key={patient.id}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div>
                  <p className="font-semibold">{patient.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {patient.email || "sin email"} ·{" "}
                    {patient.phone || "sin teléfono"}
                  </p>
                  <Badge variant="outline" className="mt-1">
                    Asignado:{" "}
                    {patient.assignedProfessionalUids?.join(", ") || "N/D"}
                  </Badge>
                  {perms.canManagePatientPortalAccess ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          patient.portalAccessEnabled === false
                            ? "outline"
                            : "secondary"
                        }
                        onClick={() =>
                          portalAccessMutation.mutate({
                            patientId: patient.id,
                            portalAccessEnabled:
                              patient.portalAccessEnabled === false,
                          })
                        }
                      >
                        {patient.portalAccessEnabled === false
                          ? "Habilitar portal"
                          : "Deshabilitar portal"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          patient.medicalRecordAccessEnabled
                            ? "secondary"
                            : "outline"
                        }
                        onClick={() =>
                          portalAccessMutation.mutate({
                            patientId: patient.id,
                            medicalRecordAccessEnabled:
                              !patient.medicalRecordAccessEnabled,
                          })
                        }
                      >
                        {patient.medicalRecordAccessEnabled
                          ? "Ocultar historial"
                          : "Permitir historial"}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/app/patients/${patient.id}`}>Ver ficha</Link>
                </Button>
              </div>
            ))}
            {!patients.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                No hay pacientes para los filtros aplicados.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="self-start border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-4 w-4" />
            Crear o vincular paciente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={handleSubmit((data) => mutation.mutateAsync(data))}
          >
            <div className="space-y-1">
              <Label>DNI / Identificación</Label>
              <Input
                placeholder="12345678"
                {...register("dni")}
                onBlur={handleDniBlur}
              />
              {errors.dni && (
                <span className="text-xs font-medium text-red-500">
                  {errors.dni.message}
                </span>
              )}
            </div>

            {linkMessage && (
              <div className="rounded-md bg-secondary/15 p-3 text-sm text-secondary-foreground">
                <div className="flex items-center gap-2 font-semibold">
                  <LinkIcon className="h-4 w-4" />
                  ¡Coincidencia encontrada!
                </div>
                <p className="mt-1 opacity-90">{linkMessage}</p>
              </div>
            )}

            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input placeholder="Nombre y apellido" {...register("name")} />
              {errors.name && (
                <span className="text-xs font-medium text-red-500">
                  {errors.name.message}
                </span>
              )}
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                placeholder="paciente@correo.com"
                type="email"
                {...register("email")}
              />
              {errors.email && (
                <span className="text-xs font-medium text-red-500">
                  {errors.email.message}
                </span>
              )}
            </div>
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input placeholder="+54 9 ..." {...register("phone")} />
            </div>
            <div className="space-y-1">
              <Label>Sexo</Label>
              <Select {...register("sexo")} defaultValue="female">
                <option value="female">Femenino</option>
                <option value="male">Masculino</option>
                <option value="other">Otro</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Fecha de nacimiento</Label>
              <Input type="date" {...register("birthDate")} />
            </div>
            {perms.canAssignAnyPatient ? (
              <div className="space-y-1">
                <Label>Asignar a profesional</Label>
                <Select {...register("assignedProfessionalId")}>
                  <option value="">Sin asignar</option>
                  {professionalsQuery.data?.map((professional: UserAccount) => (
                    <option
                      key={professional.id}
                      value={accountUid(professional)}
                    >
                      {professional.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label>Notas</Label>
              <Textarea
                rows={3}
                placeholder="Notas internas"
                {...register("notes")}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                "Procesando..."
              ) : linkMessage ? (
                <>
                  <LinkIcon className="mr-2 h-4 w-4" /> Vincular a mi lista
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" /> Guardar nuevo paciente
                </>
              )}
            </Button>
            {mutation.error ? (
              <p className="text-sm text-destructive">
                No pudimos procesar la solicitud.
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

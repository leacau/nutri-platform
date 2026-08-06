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
import { useI18n } from "../../../../providers/i18n-provider";
import { usePermissions } from "../../../../hooks/use-permissions";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const accountUid = (account: UserAccount) => account.uid || account.id;

export default function PatientsPage() {
  const { activeClinicId } = useClinic();
  const { idToken } = useAuth();
  const { t } = useI18n();
  const perms = usePermissions();
  const qc = useQueryClient();

  const patientSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, t("validation.nameRequired")),
        dni: z
          .string()
          .min(7, t("validation.dniMin"))
          .max(8, t("validation.dniMax"))
          .regex(/^\d+$/, t("validation.onlyNumbers")),
        email: z.string().email(t("validation.invalidEmail")).optional().or(z.literal("")),
        phone: z.string().optional().or(z.literal("")),
        sexo: z.enum(["male", "female", "other"]),
        birthDate: z.string().optional(),
        assignedProfessionalId: z.string().optional(),
        notes: z.string().optional(),
      }),
    [t],
  );
  type PatientForm = z.infer<typeof patientSchema>;

  const patientsQuery = useAuthedQuery({
    queryKey: ["patients", activeClinicId],
    queryFn: (token, clinicId) => apiClient.patients(clinicId, token),
  });
  const professionalsQuery = useAuthedQuery({
    queryKey: ["professionals", activeClinicId],
    queryFn: (token, clinicId) => apiClient.professionals(clinicId, token),
  });

  const [search, setSearch] = useState("");
  const [selectedProfessional, setSelectedProfessional] = useState("all");
  const [linkMessage, setLinkMessage] = useState<string | null>(null);

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

  const mutation = useMutation({
    mutationFn: async (data: PatientForm) => {
      if (!activeClinicId) throw new Error("Missing active workspace");
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
      alert(t("patients.saveSuccess"));
    },
    onError: () => {
      alert(t("patients.saveError"));
    },
  });

  const portalAccessMutation = useMutation({
    mutationFn: async (data: {
      patientId: string;
      portalAccessEnabled?: boolean;
      medicalRecordAccessEnabled?: boolean;
    }) => {
      if (!activeClinicId) throw new Error("Missing active workspace");
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
      alert(t("patients.accessUpdateError"));
    },
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
          setLinkMessage(t("patients.linkSameWorkspace"));
        } else if (found.clinicId) {
          setLinkMessage(t("patients.linkOtherWorkspace"));
        } else {
          setLinkMessage(t("patients.linkPlatformPerson"));
        }
      } else {
        setLinkMessage(null);
      }
    } catch (error) {
      console.error("Patient lookup failed:", error);
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

  const professionalName = (uid: string) =>
    professionalsQuery.data?.find((professional: UserAccount) => accountUid(professional) === uid)
      ?.name ?? t("common.workspaceProfessionalUnavailable");

  const professionalNames = (uids?: string[]) => {
    if (!uids?.length) return t("patients.unassigned");
    return uids.map(professionalName).join(", ");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,400px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              {t("patients.management")}
            </p>
            <h1 className="text-2xl font-semibold text-primary">{t("nav.patients")}</h1>
          </div>
          <Badge variant="secondary">
            {patientsQuery.data?.length ?? 0} {t("patients.records")}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("patients.searchByName")}
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
              <option value="all">{t("patients.allProfessionals")}</option>
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
                    {patient.email || t("patients.noEmail")} ·{" "}
                    {patient.phone || t("patients.noPhone")}
                  </p>
                  <Badge variant="outline" className="mt-1">
                    {t("patients.assigned")}:{" "}
                    {professionalNames(patient.assignedProfessionalUids)}
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
                          ? t("patients.enablePortal")
                          : t("patients.disablePortal")}
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
                          ? t("patients.hideHistory")
                          : t("patients.allowHistory")}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/app/patients/${patient.id}`}>{t("patients.viewRecord")}</Link>
                </Button>
              </div>
            ))}
            {!patients.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("patients.emptyFilter")}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="self-start border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-4 w-4" />
            {t("patients.createOrLink")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={handleSubmit((data) => mutation.mutateAsync(data))}
          >
            <div className="space-y-1">
              <Label>{t("patients.dniIdentification")}</Label>
              <Input
                placeholder="12345678"
                {...register("dni")}
                onBlur={handleDniBlur}
              />
              {errors.dni ? (
                <span className="text-xs font-medium text-red-500">
                  {errors.dni.message}
                </span>
              ) : null}
            </div>

            {linkMessage ? (
              <div className="rounded-md bg-secondary/15 p-3 text-sm text-secondary-foreground">
                <div className="flex items-center gap-2 font-semibold">
                  <LinkIcon className="h-4 w-4" />
                  {t("patients.matchFound")}
                </div>
                <p className="mt-1 opacity-90">{linkMessage}</p>
              </div>
            ) : null}

            <div className="space-y-1">
              <Label>{t("common.name")}</Label>
              <Input placeholder={t("common.fullNamePlaceholder")} {...register("name")} />
              {errors.name ? (
                <span className="text-xs font-medium text-red-500">
                  {errors.name.message}
                </span>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                placeholder="paciente@correo.com"
                type="email"
                {...register("email")}
              />
              {errors.email ? (
                <span className="text-xs font-medium text-red-500">
                  {errors.email.message}
                </span>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>{t("common.phone")}</Label>
              <Input placeholder="+54 9 ..." {...register("phone")} />
            </div>
            <div className="space-y-1">
              <Label>{t("patients.sex")}</Label>
              <Select {...register("sexo")} defaultValue="female">
                <option value="female">{t("sex.female")}</option>
                <option value="male">{t("sex.male")}</option>
                <option value="other">{t("sex.other")}</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("common.birthDate")}</Label>
              <Input type="date" {...register("birthDate")} />
            </div>
            {perms.canAssignAnyPatient ? (
              <div className="space-y-1">
                <Label>{t("patients.assignProfessional")}</Label>
                <Select {...register("assignedProfessionalId")}>
                  <option value="">{t("patients.unassigned")}</option>
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
              <Label>{t("patients.notes")}</Label>
              <Textarea
                rows={3}
                placeholder={t("patients.internalNotes")}
                {...register("notes")}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                t("common.processing")
              ) : linkMessage ? (
                <>
                  <LinkIcon className="mr-2 h-4 w-4" /> {t("patients.linkToMyList")}
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" /> {t("patients.saveNewPatient")}
                </>
              )}
            </Button>
            {mutation.error ? (
              <p className="text-sm text-destructive">
                {t("patients.processError")}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

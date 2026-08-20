"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Save,
  Share2,
  Utensils,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Textarea } from "../../../../components/ui/textarea";
import { UserAccount } from "../../../../lib/types";
import type {
  FoodLog,
  FoodLogDayKey,
  FoodLogDays,
  FoodLogMealKey,
} from "../../../../lib/types";
import { apiClient } from "../../../../lib/api-client";
import { cn } from "../../../../lib/utils";
import { useAuth } from "../../../../providers/auth-provider";
import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { useClinic } from "../../../../providers/clinic-provider";
import { useI18n } from "../../../../providers/i18n-provider";

const dayKeys: FoodLogDayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const mealKeys: FoodLogMealKey[] = [
  "breakfast",
  "morningSnack",
  "lunch",
  "afternoonSnack",
  "dinner",
];

const accountUid = (account: UserAccount) => account.uid || account.id;

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mondayFor(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function createEmptyDays(): FoodLogDays {
  return Object.fromEntries(
    dayKeys.map((day) => [
      day,
      Object.fromEntries(
        mealKeys.map((meal) => [meal, { time: "", detail: "" }]),
      ),
    ]),
  ) as FoodLogDays;
}

function countCompletedMeals(days: FoodLogDays) {
  return dayKeys.reduce(
    (total, day) =>
      total +
      mealKeys.filter((meal) => {
        const entry = days[day][meal];
        return entry.time.trim() || entry.detail.trim();
      }).length,
    0,
  );
}

function completedMealsForDay(days: FoodLogDays, day: FoodLogDayKey) {
  return mealKeys.filter((meal) => {
    const entry = days[day][meal];
    return entry.time.trim() || entry.detail.trim();
  }).length;
}

export default function PortalFoodLogPage() {
  const { activeClinicId, me } = useClinic();
  const { idToken } = useAuth();
  const { locale, t } = useI18n();
  const qc = useQueryClient();
  const patientMembership = me?.memberships.find(
    (membership) =>
      membership.clinicId === activeClinicId && membership.role === "patient",
  );
  const patientId = patientMembership?.patientId;
  const [weekStart, setWeekStart] = useState(() => toIsoDate(mondayFor(new Date())));
  const [days, setDays] = useState<FoodLogDays>(() => createEmptyDays());
  const [sharedWithProfessionalUids, setSharedWithProfessionalUids] = useState<
    string[]
  >([]);
  const [expandedDay, setExpandedDay] = useState<FoodLogDayKey>("monday");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const patientQuery = useAuthedQuery({
    queryKey: ["portal-patient", patientId],
    queryFn: (token, clinicId) =>
      apiClient.patient(patientId!, clinicId, token, "patient"),
    enabled: Boolean(patientId),
  });

  const professionalsQuery = useAuthedQuery({
    queryKey: ["portal-professionals"],
    queryFn: (token, clinicId) =>
      apiClient.professionals(clinicId, token, "patient"),
    enabled: Boolean(patientId),
  });

  const foodLogQuery = useAuthedQuery({
    queryKey: ["portal-food-log", patientId, weekStart],
    queryFn: (token, clinicId) =>
      apiClient.foodLogs(patientId!, clinicId, token, weekStart, "patient"),
    enabled: Boolean(patientId),
  });

  const currentFoodLog = foodLogQuery.data?.[0] as FoodLog | undefined;
  const assignedProfessionals = useMemo(() => {
    const assigned = new Set(patientQuery.data?.assignedProfessionalUids ?? []);
    return (professionalsQuery.data ?? []).filter((professional: UserAccount) =>
      assigned.has(accountUid(professional)),
    );
  }, [patientQuery.data?.assignedProfessionalUids, professionalsQuery.data]);

  useEffect(() => {
    if (currentFoodLog) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDays(currentFoodLog.days);
      setSharedWithProfessionalUids(currentFoodLog.sharedWithProfessionalUids);
      return;
    }
    setDays(createEmptyDays());
    setSharedWithProfessionalUids([]);
  }, [currentFoodLog, weekStart]);

  const saveMutation = useMutation({
    mutationFn: (clinicId: string) =>
      apiClient.saveFoodLog(
        {
          patientId: patientId!,
          weekStart,
          days,
          sharedWithProfessionalUids,
        },
        clinicId,
        idToken ?? undefined,
        "patient",
      ),
    onSuccess: () => {
      setSavedAt(new Date().toISOString());
      qc.invalidateQueries({ queryKey: ["portal-food-log", patientId, weekStart] });
    },
    onError: () => {
      alert(t("foodLog.saveError"));
    },
  });

  const weekDates = useMemo(() => {
    const start = new Date(`${weekStart}T00:00:00`);
    return dayKeys.map((day, index) => ({
      day,
      date: addDays(start, index),
    }));
  }, [weekStart]);

  const updateEntry = (
    day: FoodLogDayKey,
    meal: FoodLogMealKey,
    field: "time" | "detail",
    value: string,
  ) => {
    setDays((current) => ({
      ...current,
      [day]: {
        ...current[day],
        [meal]: {
          ...current[day][meal],
          [field]: value,
        },
      },
    }));
  };

  const toggleProfessional = (uid: string) => {
    setSharedWithProfessionalUids((current) =>
      current.includes(uid)
        ? current.filter((item) => item !== uid)
        : [...current, uid],
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{t("portal.title")}</p>
          <h1 className="text-2xl font-semibold text-primary">
            {t("foodLog.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("foodLog.subtitle")}
          </p>
        </div>
        <Badge variant="secondary">
          {t("foodLog.completedMeals", { count: countCompletedMeals(days) })}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-4 w-4" />
            {t("foodLog.week")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[240px_1fr]">
          <div className="space-y-2">
            <Label>{t("foodLog.weekStart")}</Label>
            <Input
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              {t("foodLog.shareWith")}
            </Label>
            <div className="flex flex-wrap gap-2">
              {assignedProfessionals.map((professional: UserAccount) => {
                const uid = accountUid(professional);
                const active = sharedWithProfessionalUids.includes(uid);
                return (
                  <button
                    key={uid}
                    type="button"
                    onClick={() => toggleProfessional(uid)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition",
                      active
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {professional.name}
                  </button>
                );
              })}
              {!assignedProfessionals.length ? (
                <p className="text-sm text-muted-foreground">
                  {t("foodLog.noAssignedProfessionals")}
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {weekDates.map(({ day, date }) => {
          const completedMeals = completedMealsForDay(days, day);
          const isComplete = completedMeals === mealKeys.length;
          const isPartial = completedMeals > 0 && !isComplete;
          const isOpen = expandedDay === day;
          return (
          <Card key={day}>
            <CardHeader className="p-0">
              <button
                type="button"
                onClick={() => setExpandedDay(day)}
                className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left"
              >
                <span className="flex items-center gap-3">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition",
                      isOpen ? "rotate-0" : "-rotate-90",
                    )}
                  />
                  <span>
                    <span className="block text-lg font-semibold">
                      {t(`foodLog.day.${day}`)}
                    </span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {date.toLocaleDateString(locale, {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                  </span>
                </span>
                {isComplete ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                    title={t("foodLog.dayComplete")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {completedMeals}/{mealKeys.length}
                  </span>
                ) : isPartial ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"
                    title={t("foodLog.dayPartial")}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    {completedMeals}/{mealKeys.length}
                  </span>
                ) : null}
              </button>
            </CardHeader>
            {isOpen ? (
            <CardContent className="space-y-3">
              {mealKeys.map((meal) => (
                <div
                  key={`${day}-${meal}`}
                  className="grid gap-3 rounded-lg border p-3 md:grid-cols-[150px_120px_1fr]"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Utensils className="h-4 w-4 text-emerald-600" />
                    {t(`foodLog.meal.${meal}`)}
                  </div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-2][0-9]:[0-5][0-9]"
                    placeholder="HH:mm"
                    value={days[day][meal].time}
                    onChange={(event) =>
                      updateEntry(day, meal, "time", event.target.value)
                    }
                    aria-label={t("foodLog.time")}
                  />
                  <Textarea
                    value={days[day][meal].detail}
                    onChange={(event) =>
                      updateEntry(day, meal, "detail", event.target.value)
                    }
                    placeholder={t("foodLog.detailPlaceholder")}
                    className="min-h-[70px]"
                    aria-label={t("foodLog.detail")}
                  />
                </div>
              ))}
            </CardContent>
            ) : null}
          </Card>
        );
        })}
      </div>

      {currentFoodLog?.professionalNotes?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("foodLog.professionalNotes")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {currentFoodLog.professionalNotes.map((note) => (
              <div key={note.id} className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  {t(`foodLog.noteScope.${note.scope}`)}
                  {note.dayKey ? ` · ${t(`foodLog.day.${note.dayKey}`)}` : ""}
                  {note.mealKey ? ` · ${t(`foodLog.meal.${note.mealKey}`)}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">{note.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="sticky bottom-4 flex justify-end">
        <div className="flex items-center gap-3 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur">
          {savedAt ? (
            <p className="text-xs text-muted-foreground">{t("foodLog.saved")}</p>
          ) : null}
          <Button
            onClick={() =>
              saveMutation.mutate(activeClinicId || "")
            }
            disabled={!patientId || !activeClinicId || saveMutation.isPending}
          >
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? t("common.processing") : t("foodLog.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

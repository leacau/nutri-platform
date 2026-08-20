"use client";

import { MessageSquarePlus, NotebookText, Utensils } from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Badge } from "../../../../../../components/ui/badge";
import { Button } from "../../../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../../../../components/ui/dialog";
import { Label } from "../../../../../../components/ui/label";
import { Select } from "../../../../../../components/ui/select";
import { Textarea } from "../../../../../../components/ui/textarea";
import type {
  FoodLog,
  FoodLogDayKey,
  FoodLogMealKey,
} from "../../../../../../lib/types";
import { apiClient } from "../../../../../../lib/api-client";
import { useAuth } from "../../../../../../providers/auth-provider";
import { useAuthedQuery } from "../../../../../../hooks/use-authed-query";
import { useClinic } from "../../../../../../providers/clinic-provider";
import { useI18n } from "../../../../../../providers/i18n-provider";

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

function filledMeals(log: FoodLog) {
  return dayKeys.reduce(
    (total, day) =>
      total +
      mealKeys.filter((meal) => {
        const entry = log.days[day]?.[meal];
        return entry?.time?.trim() || entry?.detail?.trim();
      }).length,
    0,
  );
}

function AddFoodLogNoteDialog({ log }: { log: FoodLog }) {
  const { idToken } = useAuth();
  const { activeClinicId } = useClinic();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"week" | "day" | "meal">("week");
  const [dayKey, setDayKey] = useState<FoodLogDayKey>("monday");
  const [mealKey, setMealKey] = useState<FoodLogMealKey>("breakfast");
  const [content, setContent] = useState("");
  const [visibleToPatient, setVisibleToPatient] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.addFoodLogNote(
        log.id,
        {
          scope,
          ...(scope !== "week" ? { dayKey } : {}),
          ...(scope === "meal" ? { mealKey } : {}),
          content,
          visibleToPatient,
        },
        activeClinicId || "",
        idToken ?? undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient-food-logs", log.patientId] });
      setContent("");
      setVisibleToPatient(false);
      setScope("week");
      setOpen(false);
    },
    onError: () => alert(t("foodLog.noteSaveError")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          {t("foodLog.addNote")}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white p-6 sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("foodLog.addNoteTitle")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>{t("foodLog.noteScope")}</Label>
            <Select
              value={scope}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setScope(event.target.value as "week" | "day" | "meal")
              }
            >
              <option value="week">{t("foodLog.noteScope.week")}</option>
              <option value="day">{t("foodLog.noteScope.day")}</option>
              <option value="meal">{t("foodLog.noteScope.meal")}</option>
            </Select>
          </div>
          {scope !== "week" ? (
            <div className="grid gap-2">
              <Label>{t("foodLog.day")}</Label>
              <Select value={dayKey} onChange={(event) => setDayKey(event.target.value as FoodLogDayKey)}>
                {dayKeys.map((day) => (
                  <option key={day} value={day}>
                    {t(`foodLog.day.${day}`)}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {scope === "meal" ? (
            <div className="grid gap-2">
              <Label>{t("foodLog.meal")}</Label>
              <Select value={mealKey} onChange={(event) => setMealKey(event.target.value as FoodLogMealKey)}>
                {mealKeys.map((meal) => (
                  <option key={meal} value={meal}>
                    {t(`foodLog.meal.${meal}`)}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label>{t("foodLog.note")}</Label>
            <Textarea
              className="min-h-[150px]"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={t("foodLog.notePlaceholder")}
            />
          </div>
          <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              checked={visibleToPatient}
              onChange={(event) => setVisibleToPatient(event.target.checked)}
            />
            {t("foodLog.visibleToPatient")}
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("action.cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!content.trim() || mutation.isPending}
          >
            {mutation.isPending ? t("common.processing") : t("action.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FoodLogPanel({ patientId }: { patientId: string }) {
  const { user } = useAuth();
  const { activeClinic, activeMembership } = useClinic();
  const { t } = useI18n();
  const canView =
    activeMembership?.role === "professional" ||
    activeClinic?.ownerProfessionalUid === user?.uid;

  const foodLogsQuery = useAuthedQuery({
    queryKey: ["patient-food-logs", patientId],
    queryFn: (token, clinicId) => apiClient.foodLogs(patientId, clinicId, token),
    enabled: Boolean(patientId && canView),
    retry: false,
  });

  const logs = useMemo(
    () => (foodLogsQuery.data ?? []).slice(0, 8),
    [foodLogsQuery.data],
  );

  if (!canView) return null;

  return (
    <Card className="border-emerald-100 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <NotebookText className="h-4 w-4 text-emerald-600" />
          {t("foodLog.professionalPanelTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {foodLogsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : logs.length ? (
          logs.map((log) => (
            <div key={log.id} className="rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {t("foodLog.weekOf", { date: log.weekStart })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("foodLog.completedMeals", { count: filledMeals(log) })}
                  </p>
                </div>
                <AddFoodLogNoteDialog log={log} />
              </div>

              <div className="mt-4 grid gap-3">
                {dayKeys.map((day) => {
                  const meals = mealKeys.filter((meal) => {
                    const entry = log.days[day]?.[meal];
                    return entry?.time?.trim() || entry?.detail?.trim();
                  });
                  if (!meals.length) return null;
                  return (
                    <div key={day} className="rounded-lg bg-slate-50 p-3">
                      <p className="text-sm font-semibold">
                        {t(`foodLog.day.${day}`)}
                      </p>
                      <div className="mt-2 space-y-2">
                        {meals.map((meal) => {
                          const entry = log.days[day][meal];
                          return (
                            <div key={meal} className="text-sm">
                              <span className="font-medium">
                                <Utensils className="mr-1 inline h-3 w-3 text-emerald-600" />
                                {t(`foodLog.meal.${meal}`)}
                              </span>
                              {entry.time ? (
                                <Badge className="ml-2" variant="secondary">
                                  {entry.time}
                                </Badge>
                              ) : null}
                              <p className="mt-1 whitespace-pre-line text-muted-foreground">
                                {entry.detail}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {log.professionalNotes?.length ? (
                <div className="mt-4 space-y-2 border-t pt-3">
                  <p className="text-sm font-semibold">{t("foodLog.notes")}</p>
                  {log.professionalNotes.map((note) => (
                    <div key={note.id} className="rounded-lg bg-amber-50 p-3 text-sm">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        {t(`foodLog.noteScope.${note.scope}`)}
                        {note.dayKey ? ` · ${t(`foodLog.day.${note.dayKey}`)}` : ""}
                        {note.mealKey ? ` · ${t(`foodLog.meal.${note.mealKey}`)}` : ""}
                        {note.visibleToPatient ? ` · ${t("foodLog.patientCanSee")}` : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-line">{note.content}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("foodLog.noSharedLogs")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { useAuth } from "../../../providers/auth-provider";
import { useI18n } from "../../../providers/i18n-provider";

type ForgotForm = {
  email: string;
};

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const { t } = useI18n();
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const schema = z.object({
    email: z.string().email(t("validation.invalidEmail")),
  });
  const { register, handleSubmit, formState } = useForm<ForgotForm>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: ForgotForm) => {
    setStatus("idle");
    setError(null);
    try {
      await resetPassword(data.email);
      setStatus("sent");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError(t("auth.recoverSendError"));
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-12">
      <div className="rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 space-y-2 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-primary">
            {t("auth.security")}
          </div>
          <h1 className="text-2xl font-semibold text-primary">{t("auth.recoverPassword")}</h1>
          <p className="text-sm text-muted-foreground">{t("auth.recoverPasswordDetail")}</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" type="email" placeholder="vos@amsa.core" {...register("email")} required />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {status === "sent" ? <p className="text-sm text-emerald-600">{t("auth.recoverSent")}</p> : null}
          <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
            <Mail className="mr-2 h-4 w-4" />
            {t("auth.sendRecovery")}
          </Button>
        </form>
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("auth.rememberedPassword")}{" "}
        <Link href="/login" className="text-primary hover:underline">
          {t("auth.backToLogin")}
        </Link>
      </p>
    </div>
  );
}

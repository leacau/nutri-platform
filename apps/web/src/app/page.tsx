"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { useI18n } from "../providers/i18n-provider";

export default function Home() {
  const { t } = useI18n();

  return (
    <main className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50">
      <div className="absolute left-10 top-10 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-10 right-10 h-64 w-64 rounded-full bg-secondary/20 blur-3xl" />
      <div className="relative mx-auto flex min-h-[80vh] max-w-6xl flex-col items-start justify-center gap-10 px-6 py-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-4 py-2 text-xs font-semibold text-primary shadow-sm">
          {t("home.badge")}
        </div>
        <div className="max-w-3xl space-y-6">
          <h1 className="text-4xl font-bold leading-tight text-primary sm:text-5xl">
            {t("home.title")}
          </h1>
          <p className="text-lg text-muted-foreground sm:text-xl">
            {t("home.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button asChild size="lg">
            <Link href="/login">
              {t("home.startNow")} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/register">{t("home.createAccount")}</Link>
          </Button>
          <span className="text-sm text-muted-foreground">{t("home.stack")}</span>
        </div>
      </div>
    </main>
  );
}

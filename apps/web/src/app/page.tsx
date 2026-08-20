"use client";

import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  FileText,
  HeartPulse,
  LockKeyhole,
  MessageCircle,
  Palette,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "../components/ui/button";
import { LanguageSelector } from "../components/language-selector";
import { useI18n } from "../providers/i18n-provider";

const whatsappHref =
  "https://wa.me/5493424790708?text=Hola%2C%20quiero%20conocer%20AMSA%20Core%20para%20mi%20cl%C3%ADnica%20o%20consultorio.";

function ProductPreview() {
  const { t } = useI18n();

  return (
    <div className="overflow-hidden rounded-md border bg-white shadow-xl">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {t("common.workspace")}
          </p>
          <p className="font-semibold text-slate-900">{t("home.previewClinic")}</p>
        </div>
        <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          {t("common.active")}
        </div>
      </div>
      <div className="grid min-h-[480px] lg:grid-cols-[220px,1fr]">
        <aside className="hidden border-r bg-slate-50 p-4 lg:block">
          <div className="mb-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-emerald-100" />
            <div>
              <div className="h-3 w-24 rounded bg-slate-300" />
              <div className="mt-2 h-2 w-32 rounded bg-slate-200" />
            </div>
          </div>
          {[
            t("nav.dashboard"),
            t("nav.patients"),
            t("nav.appointments"),
            t("nav.nutritionists"),
            t("nav.compliance"),
          ].map((item, index) => (
            <div
              key={item}
              className={`mt-2 flex h-10 items-center gap-3 rounded-md px-3 text-sm ${
                index === 0 ? "bg-slate-900 text-white" : "bg-white text-slate-500"
              }`}
            >
              <span className="h-3 w-3 rounded-sm bg-current opacity-40" />
              {item}
            </div>
          ))}
        </aside>
        <div className="grid gap-4 bg-white p-5 md:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-500">{t("home.previewDashboard")}</p>
              <h2 className="text-3xl font-bold text-slate-950">AMSA Core</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                ["24", t("dashboard.totalPatients")],
                ["8", t("dashboard.todayAppointments")],
                ["3", t("dashboard.waiting")],
              ].map(([value, label]) => (
                <div key={label} className="rounded-md border bg-slate-50 p-4">
                  <p className="text-2xl font-bold text-slate-950">{value}</p>
                  <p className="mt-1 text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>
            <div className="rounded-md border bg-white p-4">
              <p className="font-semibold text-slate-950">{t("home.previewRecords")}</p>
              <div className="mt-4 space-y-3">
                <div className="h-3 w-3/4 rounded bg-slate-200" />
                <div className="h-3 w-1/2 rounded bg-slate-100" />
                <div className="h-24 rounded border bg-emerald-50" />
              </div>
            </div>
          </div>
          <div className="rounded-md border bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-950">{t("dashboard.todayAgenda")}</p>
              <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">
                {t("common.date")}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {[t("home.previewPatient"), t("home.previewProfessional"), t("home.previewWaiting")].map(
                (item, index) => (
                  <div key={item} className="rounded-md border bg-white p-3">
                    <p className="text-sm font-semibold text-slate-900">{item}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {index === 2 ? t("dashboard.ready") : t("dashboard.generalVisit")}
                    </p>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border bg-white p-6 shadow-sm">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

function PreviewCard({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-md border bg-white shadow-sm">
      <div className="border-b p-5">
        <h3 className="font-semibold text-slate-950">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{detail}</p>
      </div>
      <div className="bg-slate-50 p-5">{children}</div>
    </div>
  );
}

export default function Home() {
  const { t } = useI18n();

  return (
    <main className="bg-white text-slate-950">
      <section id="producto" className="border-b bg-white">
        <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link href="/" className="text-lg font-bold text-slate-950">
            AMSA Core
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
            <a href="#producto" className="hover:text-slate-950">
              {t("home.navProduct")}
            </a>
            <a href="#funciones" className="hover:text-slate-950">
              {t("home.navFeatures")}
            </a>
            <a href="#seguridad" className="hover:text-slate-950">
              {t("home.navSecurity")}
            </a>
            <a href="#contacto" className="hover:text-slate-950">
              {t("home.navContact")}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <Button variant="outline" size="sm" asChild>
              <Link href="/login">{t("home.login")}</Link>
            </Button>
          </div>
        </header>

        <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-14 lg:grid-cols-[0.9fr,1.1fr] lg:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              {t("home.heroKicker")}
            </p>
            <h1 className="mt-5 text-5xl font-bold leading-tight text-slate-950 md:text-6xl">
              AMSA Core
            </h1>
            <p className="mt-4 max-w-xl text-2xl font-semibold leading-snug text-slate-900">
              {t("home.title")}
            </p>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              {t("home.subtitle")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <a href={whatsappHref} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  {t("home.sales")}
                </a>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/login">
                  {t("home.startNow")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
              {[t("home.metricPatients"), t("home.metricRoles"), t("home.metricPortal")].map(
                (item) => (
                  <div key={item} className="border-l-2 border-emerald-600 pl-3 text-sm text-slate-700">
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section id="funciones" className="border-t bg-slate-50 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              {t("home.navFeatures")}
            </p>
            <h2 className="mt-3 text-3xl font-bold text-slate-950 md:text-4xl">
              {t("home.sectionOperations")}
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              {t("home.sectionOperationsDetail")}
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<CalendarClock className="h-5 w-5" />}
              title={t("home.featureAppointments")}
              detail={t("home.featureAppointmentsDetail")}
            />
            <FeatureCard
              icon={<FileText className="h-5 w-5" />}
              title={t("home.featureClinicalRecords")}
              detail={t("home.featureClinicalRecordsDetail")}
            />
            <FeatureCard
              icon={<Users className="h-5 w-5" />}
              title={t("home.featureTeam")}
              detail={t("home.featureTeamDetail")}
            />
            <FeatureCard
              icon={<ClipboardList className="h-5 w-5" />}
              title={t("home.featurePatientPortal")}
              detail={t("home.featurePatientPortalDetail")}
            />
            <FeatureCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title={t("home.featureCommercialPlans")}
              detail={t("home.featureCommercialPlansDetail")}
            />
            <FeatureCard
              icon={<Palette className="h-5 w-5" />}
              title={t("home.featureBranding")}
              detail={t("home.featureBrandingDetail")}
            />
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-3">
          <PreviewCard title={t("home.previewDashboard")} detail={t("home.previewDashboardDetail")}>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {["24", "8", "3"].map((value) => (
                  <div key={value} className="rounded-md bg-white p-3 text-center shadow-sm">
                    <p className="text-xl font-bold">{value}</p>
                    <div className="mx-auto mt-2 h-2 w-12 rounded bg-emerald-100" />
                  </div>
                ))}
              </div>
              <div className="rounded-md bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold">{t("dashboard.todayAgenda")}</p>
                <div className="mt-3 space-y-2">
                  <div className="h-8 rounded bg-emerald-50" />
                  <div className="h-8 rounded bg-white ring-1 ring-slate-200" />
                </div>
              </div>
            </div>
          </PreviewCard>

          <PreviewCard title={t("home.previewRecords")} detail={t("home.previewRecordsDetail")}>
            <div className="space-y-3">
              <div className="rounded-md border-l-4 border-blue-500 bg-white p-4 shadow-sm">
                <p className="font-semibold">{t("records.note")}</p>
                <p className="mt-2 text-sm text-slate-500">{t("records.visibleInPortalShort")}</p>
              </div>
              <div className="rounded-md border-l-4 border-emerald-500 bg-white p-4 shadow-sm">
                <p className="font-semibold">{t("records.mealPlan")}</p>
                <p className="mt-2 text-sm text-slate-500">{t("records.document")}</p>
              </div>
            </div>
          </PreviewCard>

          <PreviewCard title={t("home.previewPortal")} detail={t("home.previewPortalDetail")}>
            <div className="rounded-md bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <HeartPulse className="h-5 w-5 text-emerald-700" />
                <p className="font-semibold">{t("portal.nextAppointment")}</p>
              </div>
              <div className="space-y-2 text-sm text-slate-600">
                <p>{t("portal.appointmentHistory")}</p>
                <p>{t("portal.medicalHistory")}</p>
                <p>{t("portal.yourProfile")}</p>
              </div>
            </div>
          </PreviewCard>
        </div>
      </section>

      <section id="seguridad" className="border-y bg-slate-950 px-6 py-20 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr,1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              {t("home.navSecurity")}
            </p>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">{t("home.securityTitle")}</h2>
            <p className="mt-4 text-lg leading-8 text-slate-300">{t("home.securityDetail")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[t("home.securityRoles"), t("home.securityAudit"), t("home.securityPortal")].map(
              (item) => (
                <div key={item} className="rounded-md border border-slate-700 bg-slate-900 p-5">
                  <LockKeyhole className="mb-4 h-5 w-5 text-emerald-300" />
                  <p className="text-sm leading-6 text-slate-200">{item}</p>
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      <section id="contacto" className="px-6 py-20">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-8 rounded-md border bg-white p-8 shadow-sm md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-bold text-slate-950">{t("home.ctaTitle")}</h2>
            <p className="mt-3 max-w-2xl text-lg leading-8 text-slate-600">{t("home.ctaDetail")}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <a href={whatsappHref} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" />
                {t("home.ctaWhatsapp")}
              </a>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/login">{t("home.ctaLogin")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

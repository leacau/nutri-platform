"use client";

import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { NoriaLogo } from "../components/brand/noria-logo";
import { LanguageSelector } from "../components/language-selector";
import { Button } from "../components/ui/button";
import { useI18n } from "../providers/i18n-provider";

const whatsappHref =
  "https://wa.me/5493424790708?text=Hola%2C%20quiero%20conocer%20Noria%20para%20mi%20cl%C3%ADnica%20o%20consultorio.";

function ProductPreview() {
  const { t } = useI18n();

  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-white shadow-[0_8px_30px_rgba(14,58,71,0.08)]">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("common.workspace")}
          </p>
          <p className="font-semibold text-foreground">{t("home.previewClinic")}</p>
        </div>
        <div className="rounded-full bg-[#A8C5B1]/30 px-3 py-1 text-xs font-semibold text-primary">
          {t("common.active")}
        </div>
      </div>

      <div className="grid bg-[#F8FAFB] lg:grid-cols-[220px,1fr]">
        <aside className="hidden border-r border-border bg-white p-4 lg:block">
          <div className="mb-6 flex items-center gap-3">
            <NoriaLogo markOnly className="h-10 w-10" />
            <div>
              <p className="font-display text-sm font-semibold text-primary">Noria</p>
              <p className="text-xs text-muted-foreground">{t("home.previewClinic")}</p>
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
              className={`mt-2 flex h-10 items-center gap-3 rounded-xl px-3 text-sm ${
                index === 0 ? "bg-primary text-white" : "text-muted-foreground"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-current opacity-50" />
              {item}
            </div>
          ))}
        </aside>

        <div className="grid gap-4 p-5 md:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {t("home.previewDashboard")}
              </p>
              <h2 className="font-display text-3xl font-semibold text-foreground">
                {t("dashboard.greeting", { name: "Andrea" })}
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                ["12", t("dashboard.todayAppointments")],
                ["3", t("dashboard.waiting")],
                ["7", t("dashboard.pending")],
              ].map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-border bg-white p-4">
                  <p className="font-display text-2xl font-semibold text-primary">
                    {value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-border bg-white p-4">
              <p className="font-semibold text-foreground">{t("home.previewRecords")}</p>
              <div className="mt-4 space-y-3">
                <div className="h-3 w-3/4 rounded-full bg-[#DFE7EA]" />
                <div className="h-3 w-1/2 rounded-full bg-[#DFE7EA]" />
                <div className="rounded-xl border border-[#A8C5B1]/50 bg-[#A8C5B1]/20 p-4 text-sm text-primary">
                  {t("home.heroProof")}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">{t("dashboard.todayAgenda")}</p>
              <span className="rounded-full bg-[#F2F5F7] px-2 py-1 text-xs text-secondary">
                {t("common.date")}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {[
                ["08:30", "María López", t("dashboard.generalVisit")],
                ["10:00", "Juan Pérez", t("dashboard.ready")],
                ["11:30", "Carolina Díaz", t("dashboard.pending")],
              ].map(([time, patient, detail]) => (
                <div
                  key={`${time}-${patient}`}
                  className="rounded-xl border border-border bg-[#F8FAFB] p-3"
                >
                  <p className="text-xs font-semibold text-secondary">{time}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{patient}</p>
                  <p className="text-xs text-muted-foreground">{detail}</p>
                </div>
              ))}
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
    <div className="rounded-[20px] border border-border bg-white p-6">
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#F2F5F7] text-primary">
        {icon}
      </div>
      <h3 className="font-display text-xl font-medium text-foreground">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

function AudienceCard({
  title,
  detail,
  points,
}: {
  title: string;
  detail: string;
  points: string[];
}) {
  return (
    <div className="rounded-[24px] border border-border bg-white p-8">
      <h3 className="font-display text-2xl font-medium text-foreground">{title}</h3>
      <p className="mt-3 leading-7 text-muted-foreground">{detail}</p>
      <div className="mt-6 space-y-3">
        {points.map((point) => (
          <div key={point} className="flex items-start gap-3 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#6FA3A3]" />
            <span>{point}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const { t } = useI18n();

  return (
    <main className="bg-white text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" aria-label="Noria by AmsaCore">
            <NoriaLogo className="h-12 w-auto" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#producto" className="hover:text-primary">
              {t("home.navProduct")}
            </a>
            <a href="#funcionalidades" className="hover:text-primary">
              {t("home.navFeatures")}
            </a>
            <a href="#profesionales" className="hover:text-primary">
              {t("home.navProfessionals")}
            </a>
            <a href="#clinicas" className="hover:text-primary">
              {t("home.navClinics")}
            </a>
            <a href="#seguridad" className="hover:text-primary">
              {t("home.navSecurity")}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/login">{t("home.login")}</Link>
            </Button>
            <Button size="sm" asChild>
              <a href={whatsappHref} target="_blank" rel="noreferrer">
                {t("home.createAccount")}
              </a>
            </Button>
          </div>
        </div>
      </header>

      <section id="producto" className="px-6 py-16 md:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.92fr,1.08fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3A5F7A]">
              {t("home.heroKicker")}
            </p>
            <h1 className="mt-5 max-w-3xl font-display text-5xl font-semibold leading-tight text-foreground md:text-6xl">
              {t("home.title")}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
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
                <a href="#funcionalidades">
                  {t("home.startNow")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
            <div className="mt-10 grid max-w-2xl gap-4 sm:grid-cols-3">
              {[t("home.metricPatients"), t("home.metricRoles"), t("home.metricPortal")].map(
                (item) => (
                  <div
                    key={item}
                    className="border-l border-[#6FA3A3] pl-4 text-sm leading-6 text-muted-foreground"
                  >
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section className="border-y border-border bg-[#F8FAFB] px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
          <div className="rounded-[24px] border border-border bg-white p-8">
            <h2 className="font-display text-3xl font-medium text-foreground">
              {t("home.problemTitle")}
            </h2>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              {t("home.problemDetail")}
            </p>
          </div>
          <div className="rounded-[24px] border border-border bg-white p-8">
            <h2 className="font-display text-3xl font-medium text-foreground">
              {t("home.solutionTitle")}
            </h2>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              {t("home.solutionDetail")}
            </p>
            <div className="mt-8 grid grid-cols-5 items-center gap-2 text-center text-xs text-secondary">
              {[
                t("home.flowPatient"),
                t("home.flowAppointment"),
                t("home.flowConsultation"),
                t("home.flowRecord"),
                t("home.flowFollowUp"),
              ].map((step) => (
                <div key={step} className="rounded-full border border-border bg-[#F2F5F7] px-3 py-2">
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="funcionalidades" className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3A5F7A]">
              {t("home.navFeatures")}
            </p>
            <h2 className="mt-3 font-display text-4xl font-medium text-foreground">
              {t("home.sectionOperations")}
            </h2>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              {t("home.sectionOperationsDetail")}
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Users className="h-5 w-5" />}
              title={t("nav.patients")}
              detail={t("home.featureTeamDetail")}
            />
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
              icon={<ClipboardList className="h-5 w-5" />}
              title={t("home.featureCommercialPlans")}
              detail={t("home.featureCommercialPlansDetail")}
            />
            <FeatureCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title={t("home.featurePatientPortal")}
              detail={t("home.featurePatientPortalDetail")}
            />
            <FeatureCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              title={t("home.featureBranding")}
              detail={t("home.featureBrandingDetail")}
            />
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-[#F2F5F7] px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
          <div id="profesionales">
            <AudienceCard
              title={t("home.professionalsTitle")}
              detail={t("home.professionalsDetail")}
              points={[
                t("home.professionalsPointSchedule"),
                t("home.professionalsPointRecords"),
                t("home.professionalsPointFollowUp"),
              ]}
            />
          </div>
          <div id="clinicas">
            <AudienceCard
              title={t("home.clinicsTitle")}
              detail={t("home.clinicsDetail")}
              points={[
                t("home.clinicsPointTeam"),
                t("home.clinicsPointRoles"),
                t("home.clinicsPointTraceability"),
              ]}
            />
          </div>
        </div>
      </section>

      <section id="seguridad" className="bg-primary px-6 py-20 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr,1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#A8C5B1]">
              {t("home.navSecurity")}
            </p>
            <h2 className="mt-3 font-display text-4xl font-medium">
              {t("home.securityTitle")}
            </h2>
            <p className="mt-4 text-lg leading-8 text-white/75">
              {t("home.securityDetail")}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[t("home.securityRoles"), t("home.securityAudit"), t("home.securityPortal")].map(
              (item) => (
                <div key={item} className="rounded-[20px] border border-white/15 bg-white/5 p-5">
                  <LockKeyhole className="mb-4 h-5 w-5 text-[#A8C5B1]" />
                  <p className="text-sm leading-6 text-white/85">{item}</p>
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      <section id="contacto" className="px-6 py-20">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 rounded-[24px] bg-primary p-8 text-white md:flex-row md:items-center md:p-10">
          <div>
            <h2 className="font-display text-4xl font-medium">{t("home.ctaTitle")}</h2>
            <p className="mt-3 max-w-2xl text-lg leading-8 text-white/75">
              {t("home.ctaDetail")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Button size="lg" variant="secondary" asChild>
              <a href={whatsappHref} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" />
                {t("home.ctaWhatsapp")}
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="border-white/30 bg-transparent text-white hover:bg-white/10"
            >
              <Link href="/login">{t("home.ctaLogin")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-6 py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <NoriaLogo className="h-12 w-auto" />
            <p className="mt-3 text-sm text-muted-foreground">{t("app.descriptor")}</p>
          </div>
          <div className="flex flex-wrap gap-5 text-sm text-muted-foreground">
            <a href="#producto" className="hover:text-primary">
              {t("home.navProduct")}
            </a>
            <a href="#funcionalidades" className="hover:text-primary">
              {t("home.navFeatures")}
            </a>
            <a href="#seguridad" className="hover:text-primary">
              {t("home.navSecurity")}
            </a>
            <a href={whatsappHref} target="_blank" rel="noreferrer" className="hover:text-primary">
              {t("home.navContact")}
            </a>
            <Link href="/privacy" className="hover:text-primary">
              {t("auth.privacy")}
            </Link>
            <Link href="/terms" className="hover:text-primary">
              {t("auth.terms")}
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

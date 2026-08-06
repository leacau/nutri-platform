"use client";

import { useI18n } from "../../../providers/i18n-provider";

export default function TermsPage() {
  const { t } = useI18n();
  const sections = [
    ["legal.termsClinicalHistoryTitle", "legal.termsClinicalHistoryText"],
    ["legal.termsAccessTitle", "legal.termsAccessText"],
    ["legal.termsConsentTitle", "legal.termsConsentText"],
    ["legal.termsSessionTitle", "legal.termsSessionText"],
  ] as const;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-slate-800">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t("legal.version")}
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-primary">
        {t("legal.termsTitle")}
      </h1>
      <div className="mt-6 space-y-5 text-sm leading-6">
        <p>{t("legal.termsIntro")}</p>
        {sections.map(([titleKey, textKey]) => (
          <section key={titleKey}>
            <h2 className="text-lg font-semibold">{t(titleKey)}</h2>
            <p>{t(textKey)}</p>
          </section>
        ))}
      </div>
    </main>
  );
}

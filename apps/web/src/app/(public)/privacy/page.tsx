"use client";

import { useI18n } from "../../../providers/i18n-provider";

export default function PrivacyPage() {
  const { t } = useI18n();
  const sections = [
    ["legal.privacyDataTitle", "legal.privacyDataText"],
    ["legal.privacyPurposeTitle", "legal.privacyPurposeText"],
    ["legal.privacySecurityTitle", "legal.privacySecurityText"],
    ["legal.privacyTransfersTitle", "legal.privacyTransfersText"],
    ["legal.privacyRightsTitle", "legal.privacyRightsText"],
  ] as const;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-slate-800">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t("legal.version")}
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-primary">
        {t("legal.privacyTitle")}
      </h1>
      <div className="mt-6 space-y-5 text-sm leading-6">
        <p>{t("legal.privacyIntro")}</p>
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

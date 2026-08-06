"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { Locale, locales, messages } from "../i18n/messages";

type I18nContextValue = {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number | null | undefined>) => string;
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window === "undefined") return "es-AR";
    const stored = window.localStorage.getItem("amsa-locale") as Locale | null;
    if (stored && locales.includes(stored)) return stored;
    return "es-AR";
  });

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: (loc) => {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("amsa-locale", loc);
        }
        setLocale(loc);
      },
      t: (key, vars) => {
        let text = messages[locale][key] || messages["es-AR"][key] || key;
        if (vars) {
          Object.entries(vars).forEach(([name, value]) => {
            text = text.replaceAll(`{${name}}`, String(value ?? ""));
          });
        }
        return text;
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n debe usarse dentro de I18nProvider");
  }
  return ctx;
}

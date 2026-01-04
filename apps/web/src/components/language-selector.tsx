"use client";

import { Languages } from "lucide-react";
import { locales } from "../i18n/messages";
import { useI18n } from "../providers/i18n-provider";
import { Select } from "./ui/select";

export function LanguageSelector() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
      <Languages className="h-4 w-4 text-primary" />
      <Select value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)} className="border-none px-0 py-0 text-sm focus:ring-0">
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {loc}
          </option>
        ))}
      </Select>
    </div>
  );
}

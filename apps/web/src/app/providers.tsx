"use client";

import { QueryProvider } from "../providers/query-provider";
import { ThemeProvider } from "../providers/theme-provider";
import { AuthProvider } from "../providers/auth-provider";
import { ClinicProvider } from "../providers/clinic-provider";
import { I18nProvider } from "../providers/i18n-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <QueryProvider>
          <AuthProvider>
            <ClinicProvider>{children}</ClinicProvider>
          </AuthProvider>
        </QueryProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

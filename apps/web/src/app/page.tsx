import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";

export default function Home() {
  return (
    <main className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50">
      <div className="absolute left-10 top-10 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-10 right-10 h-64 w-64 rounded-full bg-secondary/20 blur-3xl" />
      <div className="relative mx-auto flex min-h-[80vh] max-w-6xl flex-col items-start justify-center gap-10 px-6 py-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-4 py-2 text-xs font-semibold text-primary shadow-sm">
          AMSA Core · SaaS premium
        </div>
        <div className="max-w-3xl space-y-6">
          <h1 className="text-4xl font-bold leading-tight text-primary sm:text-5xl">
            Plataforma integral para nutrición y bienestar, lista para vender hoy.
          </h1>
          <p className="text-lg text-muted-foreground sm:text-xl">
            Multi-clínica, multi-rol y conectada a tu backend actual. Login con Firebase, switcher de clínica, permisos en vivo y un diseño
            listo para tus pacientes y equipo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button asChild size="lg">
            <Link href="/login">
              Comenzar ahora <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/register">Crear cuenta nueva</Link>
          </Button>
          <span className="text-sm text-muted-foreground">Firebase Auth · React Query · Tailwind + shadcn/ui</span>
        </div>
      </div>
    </main>
  );
}

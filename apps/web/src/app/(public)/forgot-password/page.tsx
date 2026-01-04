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

const schema = z.object({
  email: z.string().email(),
});

type ForgotForm = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
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
      setError("No pudimos enviar el email. Revisá la dirección y probá de nuevo.");
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-12">
      <div className="rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 space-y-2 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-primary">Seguridad</div>
          <h1 className="text-2xl font-semibold text-primary">Recuperar contraseña</h1>
          <p className="text-sm text-muted-foreground">Enviaremos un email con instrucciones.</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="vos@amsa.core" {...register("email")} required />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {status === "sent" ? <p className="text-sm text-emerald-600">Listo, revisá tu casilla.</p> : null}
          <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
            <Mail className="mr-2 h-4 w-4" />
            Enviar recuperación
          </Button>
        </form>
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Ya recordaste tu contraseña?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Volver a login
        </Link>
      </p>
    </div>
  );
}

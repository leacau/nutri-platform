export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-slate-800">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Versión AR-2026-08
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-primary">
        Términos de uso clínico
      </h1>
      <div className="mt-6 space-y-5 text-sm leading-6">
        <p>
          AMSA Core es una herramienta de gestión clínica. La responsabilidad
          profesional por la carga, exactitud, validación y uso asistencial de la
          información corresponde a la clínica y a los profesionales
          intervinientes.
        </p>
        <section>
          <h2 className="text-lg font-semibold">Historia clínica</h2>
          <p>
            Los asientos clínicos son inalterables. Toda corrección debe
            realizarse mediante rectificación aditiva, conservando el asiento
            original, motivo, profesional responsable, fecha y trazabilidad.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Accesos y roles</h2>
          <p>
            El personal administrativo no debe acceder al contenido clínico. Los
            profesionales sólo acceden a pacientes asignados o registros
            compartidos por autorización. Los pacientes acceden al portal según
            habilitación de la clínica.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Consentimiento y portal paciente</h2>
          <p>
            El uso del portal implica aceptar el tratamiento de datos personales
            y datos sensibles de salud para las finalidades informadas. Los
            consentimientos para prácticas específicas deben gestionarse de forma
            separada cuando la normativa o criterio médico lo exija.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Seguridad de sesión</h2>
          <p>
            Las sesiones deben cerrarse al finalizar el uso. El sistema puede
            cerrar sesión por inactividad y registrar accesos, exportaciones,
            rectificaciones y cambios relevantes por razones de seguridad y
            cumplimiento.
          </p>
        </section>
      </div>
    </main>
  );
}

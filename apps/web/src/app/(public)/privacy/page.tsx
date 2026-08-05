export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-slate-800">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Versión AR-2026-08
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-primary">
        Política de privacidad y datos de salud
      </h1>
      <div className="mt-6 space-y-5 text-sm leading-6">
        <p>
          AMSA Core trata datos personales y datos sensibles de salud para
          administrar turnos, pacientes, profesionales, historia clínica,
          indicaciones y portal paciente. El tratamiento debe realizarse bajo la
          Ley 25.326, la Ley 26.529 y normativa complementaria aplicable en la
          República Argentina.
        </p>
        <section>
          <h2 className="text-lg font-semibold">Datos tratados</h2>
          <p>
            Podemos tratar datos identificatorios, contacto, DNI, sexo,
            cobertura, datos administrativos de atención y datos clínicos
            cargados por profesionales habilitados. La historia clínica se
            almacena cifrada y con trazabilidad de acceso.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Finalidad</h2>
          <p>
            Los datos se usan para prestación asistencial, gestión de turnos,
            comunicación con pacientes, auditoría, seguridad, cumplimiento legal
            y entrega de copias de historia clínica cuando corresponda.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Confidencialidad y seguridad</h2>
          <p>
            El acceso a datos clínicos está restringido por rol, clínica activa
            y relación profesional-paciente. El sistema registra accesos,
            rectificaciones, bloqueos y exportaciones con metadatos de auditoría
            e integridad criptográfica.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Transferencias internacionales</h2>
          <p>
            La plataforma puede usar proveedores cloud internacionales. Cuando
            corresponda, el responsable del tratamiento debe contar con contrato
            y cláusulas de transferencia adecuadas, e informar países de destino
            y garantías aplicables. Los proveedores no deben usar datos de salud
            para fines comerciales ni entrenamiento de IA sin base legal y
            consentimiento correspondiente.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Derechos del titular</h2>
          <p>
            El paciente puede solicitar acceso, copia, actualización,
            rectificación o bloqueo de datos según la normativa vigente. Las
            solicitudes deben canalizarse ante la clínica o responsable del
            tratamiento que administra la cuenta.
          </p>
        </section>
      </div>
    </main>
  );
}

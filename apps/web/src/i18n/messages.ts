export const locales = ["es-AR", "es", "en"] as const;
export type Locale = (typeof locales)[number];

type Messages = Record<string, string>;

const shared: Messages = {
  "nav.dashboard": "Dashboard",
  "nav.patients": "Pacientes",
  "nav.appointments": "Turnos",
  "nav.nutritionists": "Nutricionistas",
  "nav.staff": "Staff",
  "nav.settings": "Configuración",
  "nav.templates": "Plantillas",
  "nav.audit": "Auditoría",
  "nav.portal": "Portal paciente",
  "action.create": "Crear",
  "action.save": "Guardar",
  "action.cancel": "Cancelar",
  "action.logout": "Salir",
  "action.login": "Iniciar sesión",
  "action.register": "Registrarme",
  "action.forgot": "Recuperar contraseña",
};

export const messages: Record<Locale, Messages> = {
  "es-AR": {
    ...shared,
    "hero.welcome": "AMSA Core",
    "auth.subtitle": "SaaS premium para nutrición, listo para vender.",
    "auth.email": "Email",
    "auth.password": "Contraseña",
    "auth.name": "Nombre",
    "auth.google": "Continuar con Google",
    "clinic.select": "Seleccioná tu clínica activa",
    "clinic.active": "Clínica activa",
    "devtools.title": "Dev Tools (solo dev)",
    "devtools.token": "ID Token",
  },
  es: {
    ...shared,
    "hero.welcome": "AMSA Core",
    "auth.subtitle": "SaaS premium para nutrición.",
    "auth.email": "Correo",
    "auth.password": "Contraseña",
    "auth.name": "Nombre",
    "auth.google": "Entrar con Google",
    "clinic.select": "Selecciona tu clínica activa",
    "clinic.active": "Clínica activa",
    "devtools.title": "Dev Tools (solo dev)",
    "devtools.token": "ID Token",
  },
  en: {
    ...shared,
    "hero.welcome": "AMSA Core",
    "auth.subtitle": "Premium nutrition SaaS, ready to sell.",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.name": "Name",
    "auth.google": "Continue with Google",
    "clinic.select": "Pick your active clinic",
    "clinic.active": "Active clinic",
    "devtools.title": "Dev Tools (dev only)",
    "devtools.token": "ID Token",
  },
};

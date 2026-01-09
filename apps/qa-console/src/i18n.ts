export type Locale = 'es' | 'en';

export type RoleKey = 'patient' | 'professional' | 'clinic_admin' | 'platform_admin';

type BackendStateKey = 'unknown' | 'online' | 'degraded' | 'offline';

export type RoleCopy = {
	key: RoleKey;
	label: string;
	icon: string;
	description: string;
	tips: string[];
};

type AppointmentStatus = 'requested' | 'scheduled' | 'completed' | 'cancelled';

type Translation = {
	languageName: string;
	nav: {
		brand: string;
		badge: string;
		home: string;
		dashboard: string;
		login: string;
		logout: string;
		languageLabel: string;
	};
	landing: {
		eyebrow: string;
		title: string;
		lead: string;
		actions: {
			auth: string;
			dashboard: string;
		};
		howTo: {
			title: string;
			steps: string[];
		};
	};
	roleTabs: RoleCopy[];
	auth: {
		title: string;
		intro: string;
		errorSummaryTitle: string;
		emailLabel: string;
		passwordLabel: string;
		passwordToggle: string;
		emailPlaceholder: string;
		passwordPlaceholder: string;
		login: string;
		loginPending: string;
		register: string;
		registerPending: string;
		logout: string;
		infoUid: string;
		infoClaims: string;
		notLogged: string;
		refreshClaims: string;
		legalNotice: string;
		errors: {
			emailRequired: string;
			emailInvalid: string;
			passwordRequired: string;
			passwordLength: string;
		};
	};
	dashboard: {
		sessionEyebrow: string;
		roleLabel: string;
		clinicLabel: string;
		unknownEmail: string;
		noRole: string;
		noClinic: string;
		themeLight: string;
		themeDark: string;
		roleTabsLabel: string;
		roleTabsHelp: string;
		backend: {
			eyebrow: string;
			title: string;
			unknown: string;
			online: string;
			degraded: string;
			offline: string;
			errors: string;
			lastChecked: string;
			notChecked: string;
			stateLabel: Record<BackendStateKey, string>;
		};
		profile: {
			title: string;
			description: string;
			view: string;
			ping: string;
		};
		patients: {
			title: string;
			description: string;
			fields: {
				name: string;
				phone: string;
				email: string;
				clinic: string;
				clinicEmpty: string;
			};
			placeholders: {
				name: string;
				phone: string;
				email: string;
			};
			errors: {
				emailInvalid: string;
				phoneInvalid: string;
			};
			assignedNutri: string;
			missingName: string;
			missingEmail: string;
			missingPhone: string;
			missingNutri: string;
			create: string;
			refresh: string;
			assignNutri: string;
			selectNutri: string;
			onlyClinic: string;
			empty: string;
			loading: string;
			loadingHint: string;
			legalNotice: string;
		};
		appointments: {
			title: string;
			description: string;
			patientRoleReminder: string;
			tip: string;
			reminder: string;
			noAppointments: string;
			cardLabel: string;
			noId: string;
			detailLabels: {
				clinic: string;
				patient: string;
				nutri: string;
				requested: string;
				scheduled: string;
				updated: string;
				positionLabel: string;
			};
			form: {
				selectNutri: string;
				from: string;
				to: string;
				slotLabel: string;
				noSlots: string;
				noNutriOptions: string;
				refreshSlots: string;
				request: string;
				list: string;
				manualLabel: string;
				manualHelp: string;
				manualInvalid: string;
				multiSelectHint: string;
				rangeErrors: {
					invalidRange: string;
					endBeforeStart: string;
				};
				slotRequired: string;
				overlapBusy: string;
			};
			linking: {
				title: string;
				description: string;
				createAndLink: string;
				refresh: string;
				needAuth: string;
				needClinic: string;
				createError: string;
				linkError: string;
				success: string;
			};
			statusLabel: Record<AppointmentStatus, string>;
			statusIconLabel: {
				fallback: string;
			};
			filters: {
				title: string;
				status: string;
				allStatuses: string;
				patient: string;
				patientPlaceholder: string;
				nutri: string;
				nutriPlaceholder: string;
				clinic: string;
				allClinics: string;
				from: string;
				to: string;
				reset: string;
				resetHint: string;
				summary: string;
			};
			schedule: {
				title: string;
				loadSlots: string;
				program: string;
				lockNotice: string;
				permissionHint: string;
				noSlots: string;
				loadForNutri: string;
				selectNutri: string;
				selectSlot: string;
				manualFallback: string;
				manualInvalid: string;
				validDateRequired: string;
				multiSelectHint: string;
				overlapBusy: string;
				overlapSelected: string;
			};
			quickActions: {
				title: string;
				cancel: string;
				complete: string;
				auditRef: string;
			};
			loading: string;
			loadingHint: string;
			noFiltered: string;
			pagination: {
				page: string;
				prev: string;
				next: string;
				perPage: string;
				summary: string;
			};
		};
		clinicAvailability: {
			title: string;
			description: string;
			refresh: string;
			counts: string;
			empty: string;
			limited: string;
			freeLabel: string;
			busyLabel: string;
			loading: string;
			loadingHint: string;
		};
		log: {
			title: string;
			empty: string;
			hint?: string;
			ok: string;
			error: string;
			payloadLabel: string;
			dataLabel: string;
			requestLabel: string;
			responseLabel: string;
			statusLabel: string;
			durationLabel: string;
			attemptLabel: string;
			emptyPayload: string;
		};
		shortcuts: {
			title: string;
			description: string;
			items: { combo: string; label: string }[];
		};
	};
	confirm: {
		cancel: {
			title: string;
			body: string;
			confirm: string;
		};
		complete: {
			title: string;
			body: string;
			confirm: string;
		};
		back: string;
	};
	toasts: {
		sessionStarted: string;
		loginError: string;
		accountCreated: string;
		registerError: string;
		logoutSuccess: string;
		logoutError: string;
		claimsRefreshed: string;
		claimsError: string;
		patientCreated: string;
		patientError: string;
		assignSuccess: string;
		assignError: string;
		appointmentsRefreshed: string;
		appointmentRequested: string;
		appointmentsRequestedMany: string;
		linkRequired: string;
		appointmentRequestError: string;
		patientLinked: string;
		appointmentScheduled: string;
		appointmentScheduleError: string;
		appointmentCancelled: string;
		appointmentCancelError: string;
		appointmentCompleted: string;
		appointmentCompleteError: string;
		auditLogged: string;
	};
	errors: {
		unauthenticated: string;
		network: string;
		unknown: string;
		refreshSession: string;
		logoutRevoke: string;
	};
};

const translations: Record<Locale, Translation> = {
	es: {
		languageName: 'Español',
		nav: {
			brand: 'Nutri Platform',
			badge: 'Modo tester (sin Firebase real)',
			home: 'Inicio',
			dashboard: 'Dashboard',
			login: 'Ingresar',
			logout: 'Cerrar sesión',
			languageLabel: 'Idioma',
		},
		landing: {
			eyebrow: 'Modo tester',
			title: 'Nutri Platform',
			lead: 'Pantalla real de onboarding con registro, login y navegación guiada por rol. Seguimos conectando contra emuladores locales.',
			actions: {
				auth: 'Ingresar / Crear cuenta',
				dashboard: 'Ir al dashboard',
			},
			howTo: {
				title: 'Cómo probar rápido',
				steps: [
					'Creá un usuario en el emulador o logueate si ya existe.',
					'Usá el endpoint dev/set-claims con el secreto para setear rol y clinicId.',
					'Refrescá claims desde el dashboard y probá flujos según tu rol.',
				],
			},
		},
		roleTabs: [
			{
				key: 'patient',
				label: 'Paciente',
				icon: '🧍‍♀️',
				description: 'Solicitá turnos y seguí tu agenda vinculada.',
				tips: [
					'Elegí un profesional y pedí turno; si el perfil no está vinculado, crealo desde la alerta.',
					'Podés reprogramar o cancelar turnos que solicitaste.',
					'Usá el horario manual si no ves slots disponibles.',
				],
			},
			{
				key: 'professional',
				label: 'Profesional',
				icon: '🥑',
				description: 'Programá y completá consultas con tus pacientes.',
				tips: [
					'Traé los slots disponibles del profesional antes de programar.',
					'Completá turnos finalizados para marcar el seguimiento.',
					'Podés ver disponibilidad rápida de la clínica en el panel inferior.',
				],
			},
			{
				key: 'clinic_admin',
				label: 'Clínica',
				icon: '🏥',
				description: 'Gestioná pacientes y agendas de toda la clínica.',
				tips: [
					'Cargá pacientes con clínica asignada y vinculá profesionales.',
					'Programá o reprogramá turnos y mantené la disponibilidad al día.',
					'Usá la tarjeta de log para auditar llamados al backend.',
				],
			},
			{
				key: 'platform_admin',
				label: 'Platform',
				icon: '🛰️',
				description: 'Visión cross-clínica para auditar y destrabar flujos.',
				tips: [
					'Podés ver y completar turnos de todas las clínicas.',
					'Filtrá por clínica y profesional para validar aislamientos.',
					'Refrescá claims si cambiás permisos desde el emulador.',
				],
			},
		],
		auth: {
			title: 'Acceso',
			intro: 'Autenticamos contra el emulador de Firebase Auth. No se contacta producción.',
			errorSummaryTitle: 'Revisá los siguientes puntos:',
			emailLabel: 'Email',
			passwordLabel: 'Password',
			passwordToggle: 'Mostrar contraseña',
			emailPlaceholder: 'usuario@test.com',
			passwordPlaceholder: 'mínimo 6 caracteres',
			login: 'Login',
			loginPending: 'Ingresando…',
			register: 'Registrar',
			registerPending: 'Creando…',
			logout: 'Logout',
			infoUid: 'UID:',
			infoClaims: 'Claims:',
			notLogged: 'no logueado',
			refreshClaims: 'Refrescar claims',
			legalNotice: 'Usá solo datos de prueba. Las acciones sensibles quedan registradas para auditoría y verificación.',
			errors: {
				emailRequired: 'Ingresá un email',
				emailInvalid: 'Ingresá un email válido',
				passwordRequired: 'Ingresá una contraseña',
				passwordLength: 'La contraseña debe tener al menos 6 caracteres',
			},
		},
		dashboard: {
			sessionEyebrow: 'Sesión activa',
			roleLabel: 'Rol',
			clinicLabel: 'Clínica',
			unknownEmail: 'Sin email',
			noRole: 'sin rol',
			noClinic: 'n/a',
			themeLight: 'Modo claro',
			themeDark: 'Modo oscuro',
			roleTabsLabel: 'Tips por rol',
			roleTabsHelp: 'Navegá para ver ejemplos y recordatorios rápidos.',
			backend: {
				eyebrow: 'Estado backend',
				title: 'API QA',
				unknown: 'Aún no hicimos requests. Probá con health o ver perfil.',
				online: 'Backend respondiendo OK.',
				degraded: 'Detectamos errores recientes. Reintentá o revisá el log.',
				offline: 'Sin respuesta del backend (timeout/red).',
				errors: 'Errores acumulados: {{count}}',
				lastChecked: 'Último check: {{time}}',
				notChecked: 'Sin checks previos',
				stateLabel: {
					unknown: 'Sin datos',
					online: 'Operativo',
					degraded: 'Degradado',
					offline: 'Caído',
				},
			},
			profile: {
				title: 'Perfil',
				description: 'Consultá tu perfil o hacé un ping al backend.',
				view: 'Ver mi perfil',
				ping: 'Ping health',
			},
			patients: {
				title: 'Pacientes',
				description: 'Creá perfiles y asigná nutris.',
				fields: {
					name: 'Nombre',
					phone: 'Teléfono',
					email: 'Email',
					clinic: 'Clínica',
					clinicEmpty: 'Sin opciones cargadas',
				},
				placeholders: {
					name: 'Nombre y apellido',
					phone: '+54...',
					email: 'correo opcional',
				},
				errors: {
					emailInvalid: 'Ingresá un email válido o dejá el campo vacío.',
					phoneInvalid: 'Ingresá un teléfono válido (solo dígitos, espacios o +).',
				},
			assignedNutri: 'Nutri asignado',
			missingName: 'Sin nombre',
			missingEmail: 'Sin email',
			missingPhone: '—',
			missingNutri: '—',
			create: 'Crear paciente',
			refresh: 'Refrescar pacientes',
			assignNutri: 'Asignar nutri',
			selectNutri: 'Elegí un nutri',
			onlyClinic: 'Disponible para roles de clínica.',
			empty: 'Sin pacientes aún. Creá un paciente y refrescá la lista.',
			loading: 'Cargando pacientes...',
			loadingHint: 'Traemos la lista desde el backend. Podés seguir editando otros campos mientras tanto.',
			legalNotice: 'Cargá solo datos ficticios o anonimizados. La creación enlaza tu cuenta si sos paciente y registra las acciones sensibles.',
		},
		appointments: {
			title: 'Turnos',
			description: 'Flujo completo: pedir como paciente, schedule como nutri/clinic_admin, cancelar, completar.',
			patientRoleReminder: 'Para solicitar turnos necesitás rol patient. Aun así podés programar/cancelar/completar si tu rol lo permite.',
				tip: 'Tip: el backend exige que tu usuario esté vinculado a un perfil de paciente en el emulador (linkedUid). Si recibís un 403, creá o vinculá tu paciente antes de volver a pedir turno.',
				reminder: 'Recordatorio: vinculá tu usuario a un paciente antes de solicitar turnos para evitar errores.',
				noAppointments: 'No hay turnos aún. Solicitá uno como paciente (con perfil vinculado) y luego podrás elegir fecha y horario en la tarjeta del turno.',
				cardLabel: 'Turno',
				noId: 'sin-id',
				detailLabels: {
					clinic: 'Clínica',
					patient: 'Paciente',
					nutri: 'Nutri',
					requested: 'Solicitado',
					scheduled: 'Programado',
					updated: 'Actualizado',
					positionLabel: 'Orden',
				},
				form: {
					selectNutri: 'Seleccioná nutri',
					from: 'Desde',
					to: 'Hasta',
					slotLabel: 'Slots disponibles (24h)',
					noSlots: 'Sin slots libres',
					noNutriOptions: 'Sin opciones',
					refreshSlots: 'Refrescar slots',
					request: 'Solicitar turno (paciente)',
					list: 'Listar turnos',
					manualLabel: 'Horario manual',
					manualHelp: 'No hay slots libres en el rango seleccionado. Ingresá horario manual como fallback.',
					manualInvalid: 'Ingresá fecha y hora válidas (AAAA-MM-DD HH:MM).',
					multiSelectHint: 'Podés seleccionar varios slots (Ctrl/Cmd + click) para priorizar horarios.',
					rangeErrors: {
						invalidRange: 'Ingresá un rango válido para buscar slots.',
						endBeforeStart: 'La fecha “hasta” debe ser mayor a “desde”.',
					},
					slotRequired: 'Seleccioná un horario disponible o ingresá uno manual.',
					overlapBusy: 'Ese horario se superpone con un slot ocupado. Elegí otro.',
				},
				linking: {
					title: 'Necesitás vincular tu paciente',
					description: 'No encontramos un paciente vinculado. Crealo y vinculalo para continuar.',
					createAndLink: 'Crear y linkear paciente',
					refresh: 'Refrescar turnos',
					needAuth: 'Necesitás iniciar sesión para vincular tu paciente.',
					needClinic: 'Asigná un clinicId en los claims para poder crear y vincular tu paciente.',
					createError:
						'No se pudo crear ni ubicar un paciente para vincular. Revisá los datos e intentá de nuevo.',
					linkError: 'No se pudo vincular el paciente. Revisá los claims y reintentá.',
					success: 'Paciente vinculado. Reintentando solicitud de turno...',
				},
				statusLabel: {
					requested: 'Solicitado',
					scheduled: 'Programado',
					completed: 'Completado',
					cancelled: 'Cancelado',
				},
				statusIconLabel: {
					fallback: 'Estado',
				},
				filters: {
					title: 'Filtros de turnos',
					status: 'Estado',
					allStatuses: 'Todos los estados',
					patient: 'Paciente',
					patientPlaceholder: 'ID, email o nombre',
					nutri: 'Nutri',
					nutriPlaceholder: 'UID de nutri',
					clinic: 'Clínica',
					allClinics: 'Todas',
					from: 'Desde',
					to: 'Hasta',
					reset: 'Limpiar filtros',
					resetHint: 'No hay turnos con los filtros actuales. Probá limpiar la búsqueda.',
					summary: 'Mostrando {{shown}} de {{total}} turnos filtrados',
				},
				schedule: {
					title: 'Programar o reprogramar',
					loadSlots: 'Slots de nutri',
					program: 'Programar',
					lockNotice: 'Solo podés programar turnos que solicitaste vos.',
					permissionHint: 'Seleccioná fecha y nutri cuando tengas permisos de clínica/nutri.',
					noSlots: 'Sin slots libres en el rango',
					loadForNutri: 'Cargá slots para este nutri',
					selectNutri: 'Elegí nutri',
					selectSlot: 'Cargá slots para este nutri',
					manualFallback: 'Fallback manual',
					manualInvalid: 'Ingresá fecha y hora válidas (AAAA-MM-DD HH:MM).',
					validDateRequired: 'Falta fecha válida para programar',
					multiSelectHint: 'Podés elegir más de un slot para comparar horarios.',
					overlapBusy: 'El slot elegido se superpone con horarios ocupados.',
					overlapSelected: 'Ya usaste ese horario en otra selección de este nutri.',
				},
				quickActions: {
					title: 'Acciones rápidas',
					cancel: 'Cancelar',
					complete: 'Completar',
					auditRef: 'Referencia de auditoría: {{id}}',
				},
				loading: 'Cargando turnos...',
				loadingHint: 'Actualizamos el listado y los estados. Podés seguir navegando.',
				noFiltered: 'Sin resultados con los filtros aplicados.',
				pagination: {
					page: 'Página {{page}} de {{total}}',
					prev: 'Anterior',
					next: 'Siguiente',
					perPage: 'Por página',
					summary: 'Mostrando {{start}}-{{end}} de {{total}} turnos',
				},
			},
		clinicAvailability: {
			title: 'Disponibilidad de la clínica (beta)',
			description: 'Vista rápida de slots libres/ocupados para el nutri seleccionado. Próximamente podrás editar disponibilidad desde aquí.',
			refresh: 'Actualizar slots del nutri',
			counts: 'Libres: {{free}} — Ocupados: {{busy}}',
			empty: 'Sin slots en el rango actual.',
			limited: 'Mostrando solo los primeros slots.',
			freeLabel: 'Libre',
			busyLabel: 'Ocupado',
			loading: 'Cargando disponibilidad...',
			loadingHint: 'Buscamos slots libres y ocupados para el nutri seleccionado.',
		},
		log: {
			title: 'Log',
			empty: 'Sin llamadas todavía.',
			hint: 'Hacé un ping o listá pacientes/turnos para ver el detalle del request/response.',
			ok: 'OK',
			error: 'ERROR',
			payloadLabel: 'payload',
			dataLabel: 'data',
				requestLabel: 'request',
				responseLabel: 'response',
				statusLabel: 'Status',
				durationLabel: 'Duración: {{ms}}ms',
				attemptLabel: 'Intento {{attempt}} de {{total}}',
			emptyPayload: '—',
		},
		shortcuts: {
			title: 'Accesos rápidos',
			description: 'Usá Ctrl/Cmd + Shift + tecla',
			items: [
				{ combo: 'Ctrl/Cmd + Shift + T', label: 'Alternar modo claro/oscuro' },
				{ combo: 'Ctrl/Cmd + Shift + L', label: 'Ir al login y enfocar email' },
				{ combo: 'Ctrl/Cmd + Shift + D', label: 'Ir al dashboard' },
				{ combo: 'Ctrl/Cmd + Shift + P', label: 'Enfocar nombre en formulario de pacientes' },
				{ combo: 'Ctrl/Cmd + Shift + A', label: 'Enfocar selección de nutri/fecha en turnos' },
			],
		},
	},
		confirm: {
			cancel: {
				title: 'Cancelar turno',
				body: 'Esta acción marca el turno como cancelado. ¿Continuamos?',
				confirm: 'Sí, cancelar',
			},
			complete: {
				title: 'Completar turno',
				body: 'Al completar, el turno quedará marcado como finalizado.',
				confirm: 'Marcar como completado',
			},
			back: 'Volver',
		},
		toasts: {
			sessionStarted: 'Sesión iniciada',
			loginError: 'No pudimos iniciar sesión',
			accountCreated: 'Cuenta creada',
			registerError: 'No pudimos registrar el usuario',
			logoutSuccess: 'Sesión cerrada',
			logoutError: 'No pudimos cerrar sesión',
			claimsRefreshed: 'Claims actualizadas',
			claimsError: 'No pudimos refrescar claims',
			patientCreated: 'Paciente creado',
			patientError: 'No se pudo crear el paciente',
			assignSuccess: 'Nutri asignado',
			assignError: 'No se pudo asignar el nutri',
			appointmentsRefreshed: 'Turnos actualizados',
			appointmentRequested: 'Turno solicitado',
			appointmentsRequestedMany: 'Solicitamos {{count}} turnos.',
			linkRequired: 'Necesitás vincular tu paciente',
			appointmentRequestError: 'No se pudo solicitar el turno',
			patientLinked: 'Paciente vinculado',
			appointmentScheduled: 'Turno programado',
			appointmentScheduleError: 'No se pudo programar el turno',
			appointmentCancelled: 'Turno cancelado',
			appointmentCancelError: 'No se pudo cancelar el turno',
			appointmentCompleted: 'Turno completado',
			appointmentCompleteError: 'No se pudo completar el turno',
			auditLogged: 'Auditoría registrada (ref {{id}})',
		},
		errors: {
			unauthenticated: 'Usuario no autenticado',
			network: 'Error de red al llamar al backend',
			unknown: 'Error desconocido',
			refreshSession: 'No pudimos refrescar tu sesión. Volvé a iniciar sesión.',
			logoutRevoke: 'No pudimos revocar la sesión. La cerramos localmente.',
		},
	},
	en: {
		languageName: 'English',
		nav: {
			brand: 'Nutri Platform',
			badge: 'Tester mode (no real Firebase)',
			home: 'Home',
			dashboard: 'Dashboard',
			login: 'Sign in',
			logout: 'Sign out',
			languageLabel: 'Language',
		},
		landing: {
			eyebrow: 'Tester mode',
			title: 'Nutri Platform',
			lead: 'Production-like onboarding screen with sign up, login, and role-guided navigation. Still connected to local emulators.',
			actions: {
				auth: 'Sign in / Create account',
				dashboard: 'Go to dashboard',
			},
			howTo: {
				title: 'How to test quickly',
				steps: [
					'Create a user in the emulator or sign in if it already exists.',
					'Use the dev/set-claims endpoint with the secret to set role and clinicId.',
					'Refresh claims from the dashboard and try flows by role.',
				],
			},
		},
		roleTabs: [
			{
				key: 'patient',
				label: 'Patient',
				icon: '🧍‍♀️',
				description: 'Request appointments and track your linked agenda.',
				tips: [
					'Pick a professional and request a slot; if the profile is not linked, create it from the alert.',
					'You can reschedule or cancel appointments you requested.',
					'Use the manual time picker if you do not see available slots.',
				],
			},
			{
				key: 'professional',
				label: 'Professional',
				icon: '🥑',
				description: 'Schedule and complete consultations with your patients.',
				tips: [
					'Load the professional available slots before scheduling.',
					'Complete finished appointments to mark the follow-up.',
					'Check quick clinic availability in the panel below.',
				],
			},
			{
				key: 'clinic_admin',
				label: 'Clinic',
				icon: '🏥',
				description: 'Manage patients and agendas for the whole clinic.',
				tips: [
					'Create patients with clinic assigned and link professionals.',
					'Schedule or reschedule appointments and keep availability up to date.',
					'Use the log card to audit backend calls.',
				],
			},
			{
				key: 'platform_admin',
				label: 'Platform',
				icon: '🛰️',
				description: 'Cross-clinic visibility to audit and unblock flows.',
				tips: [
					'You can view and complete appointments across clinics.',
					'Filter by clinic and professional to validate isolations.',
					'Refresh claims if you change permissions from the emulator.',
				],
			},
		],
		auth: {
			title: 'Access',
			intro: 'We authenticate against the Firebase Auth emulator. Production is not contacted.',
			errorSummaryTitle: 'Check the following:',
			emailLabel: 'Email',
			passwordLabel: 'Password',
			passwordToggle: 'Show password',
			emailPlaceholder: 'user@test.com',
			passwordPlaceholder: 'minimum 6 characters',
			login: 'Login',
			loginPending: 'Signing in…',
			register: 'Register',
			registerPending: 'Creating…',
			logout: 'Logout',
			infoUid: 'UID:',
			infoClaims: 'Claims:',
			notLogged: 'not logged in',
			refreshClaims: 'Refresh claims',
			legalNotice: 'Use test data only. Sensitive actions are logged for audit with a visible reference.',
			errors: {
				emailRequired: 'Enter an email',
				emailInvalid: 'Enter a valid email',
				passwordRequired: 'Enter a password',
				passwordLength: 'Password must be at least 6 characters',
			},
		},
		dashboard: {
			sessionEyebrow: 'Active session',
			roleLabel: 'Role',
			clinicLabel: 'Clinic',
			unknownEmail: 'No email',
			noRole: 'no role',
			noClinic: 'n/a',
			themeLight: 'Light mode',
			themeDark: 'Dark mode',
			roleTabsLabel: 'Role tips',
			roleTabsHelp: 'Navigate to see quick examples and reminders.',
			backend: {
				eyebrow: 'Backend status',
				title: 'QA backend',
				unknown: 'No calls yet. Try health or profile.',
				online: 'Backend responding OK.',
				degraded: 'Recent errors detected. Retry or check the log.',
				offline: 'Backend unreachable (timeout/network).',
				errors: 'Error count: {{count}}',
				lastChecked: 'Last check: {{time}}',
				notChecked: 'No checks yet',
				stateLabel: {
					unknown: 'Unknown',
					online: 'Online',
					degraded: 'Degraded',
					offline: 'Offline',
				},
			},
			profile: {
				title: 'Profile',
				description: 'Check your profile or ping the backend.',
				view: 'View my profile',
				ping: 'Ping health',
			},
			patients: {
				title: 'Patients',
				description: 'Create profiles and assign nutritionists.',
				fields: {
					name: 'Name',
					phone: 'Phone',
					email: 'Email',
					clinic: 'Clinic',
					clinicEmpty: 'No options loaded',
				},
				placeholders: {
					name: 'Full name',
					phone: '+1...',
					email: 'optional email',
				},
				errors: {
					emailInvalid: 'Enter a valid email or leave the field empty.',
					phoneInvalid: 'Enter a valid phone (digits, spaces, or +).',
				},
			assignedNutri: 'Assigned nutri',
			missingName: 'No name',
			missingEmail: 'No email',
			missingPhone: '—',
			missingNutri: '—',
			create: 'Create patient',
			refresh: 'Refresh patients',
			assignNutri: 'Assign nutri',
			selectNutri: 'Choose a nutri',
			onlyClinic: 'Available for clinic-facing roles.',
			empty: 'No patients yet. Create one and refresh the list.',
			loading: 'Loading patients...',
			loadingHint: 'Fetching the list from the backend. You can keep editing other fields meanwhile.',
			legalNotice: 'Use fake or anonymised data only. If you are a patient, creation links your account and sensitive actions are tracked.',
		},
		appointments: {
			title: 'Appointments',
			description: 'Full flow: request as patient, schedule as nutri/clinic_admin, cancel, complete.',
			patientRoleReminder: 'To request appointments you need the patient role. You can still schedule/cancel/complete if your role allows it.',
				tip: 'Tip: the backend requires your user to be linked to a patient profile in the emulator (linkedUid). If you get a 403, create or link your patient before requesting again.',
				reminder: 'Reminder: link your user to a patient before requesting appointments to avoid errors.',
				noAppointments: 'No appointments yet. Request one as a patient (with linked profile) and then choose date/time in the card.',
				cardLabel: 'Appointment',
				noId: 'no-id',
				detailLabels: {
					clinic: 'Clinic',
					patient: 'Patient',
					nutri: 'Nutri',
					requested: 'Requested',
					scheduled: 'Scheduled',
					updated: 'Updated',
					positionLabel: 'Order',
				},
				form: {
					selectNutri: 'Select nutri',
					from: 'From',
					to: 'To',
					slotLabel: 'Available slots (24h)',
					noSlots: 'No free slots',
					noNutriOptions: 'No options',
					refreshSlots: 'Refresh slots',
					request: 'Request appointment (patient)',
					list: 'List appointments',
					manualLabel: 'Manual time',
					manualHelp: 'No free slots in the selected range. Enter a manual time as fallback.',
					manualInvalid: 'Enter a valid date and time (YYYY-MM-DD HH:MM).',
					multiSelectHint: 'You can select multiple slots (Ctrl/Cmd + click) to prioritize times.',
					rangeErrors: {
						invalidRange: 'Enter a valid range to search for slots.',
						endBeforeStart: 'The "to" date must be later than "from".',
					},
					slotRequired: 'Choose an available time or enter one manually.',
					overlapBusy: 'That time conflicts with a busy slot. Pick another one.',
				},
				linking: {
					title: 'You need to link your patient',
					description: 'We could not find a linked patient. Create and link to continue.',
					createAndLink: 'Create and link patient',
					refresh: 'Refresh appointments',
					needAuth: 'You must sign in to link your patient.',
					needClinic: 'Set a clinicId in the claims to create and link your patient.',
					createError:
						'We could not create or find a patient to link. Check the data and try again.',
					linkError: 'Could not link the patient. Check claims and retry.',
					success: 'Patient linked. Retrying appointment request...',
				},
				statusLabel: {
					requested: 'Requested',
					scheduled: 'Scheduled',
					completed: 'Completed',
					cancelled: 'Cancelled',
				},
				statusIconLabel: {
					fallback: 'Status',
				},
				filters: {
					title: 'Appointment filters',
					status: 'Status',
					allStatuses: 'All statuses',
					patient: 'Patient',
					patientPlaceholder: 'ID, email, or name',
					nutri: 'Nutri',
					nutriPlaceholder: 'Nutri UID',
					clinic: 'Clinic',
					allClinics: 'All',
					from: 'From',
					to: 'To',
					reset: 'Clear filters',
					resetHint: 'No appointments match the current filters. Try clearing the search.',
					summary: 'Showing {{shown}} of {{total}} filtered appointments',
				},
				schedule: {
					title: 'Schedule or reschedule',
					loadSlots: 'Nutri slots',
					program: 'Schedule',
					lockNotice: 'You can only schedule appointments you requested.',
					permissionHint: 'Select date and nutri when you have clinic/nutri permissions.',
					noSlots: 'No free slots in range',
					loadForNutri: 'Load slots for this nutri',
					selectNutri: 'Choose nutri',
				selectSlot: 'Load slots for this nutri',
				manualFallback: 'Manual fallback',
				manualInvalid: 'Enter a valid date and time (YYYY-MM-DD HH:MM).',
				validDateRequired: 'A valid date is required to schedule',
				multiSelectHint: 'You can pick more than one slot to compare times.',
				overlapBusy: 'The chosen slot overlaps with busy times.',
				overlapSelected: 'That time is already selected for another appointment with this nutri.',
			},
				quickActions: {
					title: 'Quick actions',
					cancel: 'Cancel',
					complete: 'Complete',
					auditRef: 'Audit reference: {{id}}',
				},
				loading: 'Loading appointments...',
				loadingHint: 'Refreshing the list and states. You can continue browsing.',
				noFiltered: 'No results for the applied filters.',
				pagination: {
					page: 'Page {{page}} of {{total}}',
					prev: 'Previous',
					next: 'Next',
					perPage: 'Per page',
					summary: 'Showing {{start}}-{{end}} of {{total}} appointments',
				},
			},
		clinicAvailability: {
			title: 'Clinic availability (beta)',
			description: 'Quick view of free/busy slots for the selected nutri. You will soon edit availability here.',
			refresh: 'Refresh nutri slots',
			counts: 'Free: {{free}} — Busy: {{busy}}',
			empty: 'No slots in the current range.',
			limited: 'Showing only the first slots.',
			freeLabel: 'Free',
			busyLabel: 'Busy',
			loading: 'Loading availability...',
			loadingHint: 'Fetching free and busy slots for the selected nutri.',
		},
		log: {
			title: 'Log',
			empty: 'No calls yet.',
			hint: 'Ping health or list patients/appointments to capture request and response payloads.',
			ok: 'OK',
			error: 'ERROR',
			payloadLabel: 'payload',
			dataLabel: 'data',
				requestLabel: 'request',
				responseLabel: 'response',
				statusLabel: 'Status',
				durationLabel: 'Duration: {{ms}}ms',
				attemptLabel: 'Attempt {{attempt}} of {{total}}',
			emptyPayload: '—',
		},
		shortcuts: {
			title: 'Keyboard shortcuts',
			description: 'Use Ctrl/Cmd + Shift + key',
			items: [
				{ combo: 'Ctrl/Cmd + Shift + T', label: 'Toggle light/dark mode' },
				{ combo: 'Ctrl/Cmd + Shift + L', label: 'Go to login and focus email' },
				{ combo: 'Ctrl/Cmd + Shift + D', label: 'Go to dashboard' },
				{ combo: 'Ctrl/Cmd + Shift + P', label: 'Focus patient form name field' },
				{ combo: 'Ctrl/Cmd + Shift + A', label: 'Focus nutri/date selectors in appointments' },
			],
		},
	},
		confirm: {
			cancel: {
				title: 'Cancel appointment',
				body: 'This action marks the appointment as cancelled. Continue?',
				confirm: 'Yes, cancel',
			},
			complete: {
				title: 'Complete appointment',
				body: 'Once completed, the appointment will be marked as finished.',
				confirm: 'Mark as completed',
			},
			back: 'Back',
		},
		toasts: {
			sessionStarted: 'Signed in',
			loginError: 'We could not sign you in',
			accountCreated: 'Account created',
			registerError: 'We could not register the user',
			logoutSuccess: 'Signed out',
			logoutError: 'We could not sign out',
			claimsRefreshed: 'Claims refreshed',
			claimsError: 'We could not refresh claims',
			patientCreated: 'Patient created',
			patientError: 'We could not create the patient',
			assignSuccess: 'Nutri assigned',
			assignError: 'Could not assign nutri',
			appointmentsRefreshed: 'Appointments updated',
			appointmentRequested: 'Appointment requested',
			appointmentsRequestedMany: 'Requested {{count}} appointments.',
			linkRequired: 'You need to link your patient',
			appointmentRequestError: 'Could not request appointment',
			patientLinked: 'Patient linked',
			appointmentScheduled: 'Appointment scheduled',
			appointmentScheduleError: 'Could not schedule appointment',
			appointmentCancelled: 'Appointment cancelled',
			appointmentCancelError: 'Could not cancel appointment',
			appointmentCompleted: 'Appointment completed',
			appointmentCompleteError: 'Could not complete appointment',
			auditLogged: 'Audit logged (ref {{id}})',
		},
		errors: {
			unauthenticated: 'User not authenticated',
			network: 'Network error while calling the backend',
			unknown: 'Unknown error',
			refreshSession: 'We could not refresh your session. Please sign in again.',
			logoutRevoke: 'We could not revoke the session. It was closed locally.',
		},
	},
};

export const supportedLocales: Locale[] = ['es', 'en'];

export function getCopy(locale: Locale): Translation {
	return translations[locale] ?? translations.es;
}

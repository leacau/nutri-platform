'use client';

import { BellRing, Building2, Loader2, Palette, Save } from 'lucide-react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../../../components/ui/card';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { apiClient } from '../../../../lib/api-client';
import { useAuth } from '../../../../providers/auth-provider';
import { useClinic } from '../../../../providers/clinic-provider';

export default function SettingsPage() {
	const { activeClinicId, activeClinic } = useClinic();
	const { idToken } = useAuth();
	const qc = useQueryClient();

	// Estado local para los campos del formulario
	const [accentColor, setAccentColor] = useState('#2F8F7B');
	const [logoUrl, setLogoUrl] = useState('');
	const [whatsappEnabled, setWhatsappEnabled] = useState(true);
	const [emailEnabled, setEmailEnabled] = useState(true);

	// Traer la configuración actual
	const { data: settings, isLoading } = useQuery({
		queryKey: ['clinic-settings', activeClinicId],
		queryFn: () =>
			apiClient.clinicSettings(activeClinicId!, idToken ?? undefined),
		enabled: Boolean(activeClinicId && idToken),
	});

	// Rellenar el formulario cuando llegan los datos
	useEffect(() => {
		if (settings) {
			if (settings.branding?.accentColor)
				setAccentColor(settings.branding.accentColor);
			if (settings.branding?.logoUrl) setLogoUrl(settings.branding.logoUrl);
			if (settings.reminderPreferences) {
				setWhatsappEnabled(settings.reminderPreferences.whatsappEnabled);
				setEmailEnabled(settings.reminderPreferences.emailEnabled);
			}
		}
	}, [settings]);

	// Guardar los cambios
	const mutation = useMutation({
		mutationFn: async () => {
			return apiClient.saveClinicSettings(
				activeClinicId!,
				{
					branding: { accentColor, logoUrl: logoUrl || null },
					reminderPreferences: { whatsappEnabled, emailEnabled },
				},
				idToken ?? undefined,
			);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['clinic-settings', activeClinicId] });
			alert('¡Configuración guardada con éxito!');
		},
		onError: () => {
			alert('Hubo un error al guardar. Revisá tus permisos.');
		},
	});

	if (isLoading) {
		return (
			<div className='flex justify-center py-20'>
				<Loader2 className='h-8 w-8 animate-spin text-primary' />
			</div>
		);
	}

	return (
		<main className='mx-auto max-w-4xl px-6 py-8'>
			<div className='mb-8'>
				<h1 className='text-3xl font-bold text-slate-900 tracking-tight'>
					Configuración
				</h1>
				<p className='text-slate-500 mt-1'>
					Personalizá la identidad y reglas de {activeClinic?.name}
				</p>
			</div>

			<div className='space-y-6'>
				{/* TARJETA 1: BRANDING (Marca) */}
				<Card className='border-slate-200 shadow-sm'>
					<CardHeader className='bg-slate-50/50 border-b border-slate-100 pb-4'>
						<CardTitle className='text-lg flex items-center gap-2'>
							<Palette className='h-5 w-5 text-blue-600' /> Identidad Visual
						</CardTitle>
						<CardDescription>
							Personalizá los colores y el logo de tu plataforma.
						</CardDescription>
					</CardHeader>
					<CardContent className='p-6 space-y-6'>
						<div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
							<div className='space-y-2'>
								<Label>Color Principal (Acento)</Label>
								<div className='flex items-center gap-3'>
									<Input
										type='color'
										value={accentColor}
										onChange={(e) => setAccentColor(e.target.value)}
										className='w-14 h-10 p-1 cursor-pointer'
									/>
									<Input
										type='text'
										value={accentColor}
										onChange={(e) => setAccentColor(e.target.value)}
										className='font-mono uppercase'
									/>
								</div>
								<p className='text-xs text-muted-foreground mt-1'>
									Este color se usará en botones y detalles PDF.
								</p>
							</div>

							<div className='space-y-2'>
								<Label>URL del Logo</Label>
								<Input
									type='url'
									placeholder='https://ejemplo.com/mi-logo.png'
									value={logoUrl}
									onChange={(e) => setLogoUrl(e.target.value)}
								/>
								<p className='text-xs text-muted-foreground mt-1'>
									Pegá el link directo a la imagen de tu logo.
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* TARJETA 2: RECORDATORIOS */}
				<Card className='border-slate-200 shadow-sm'>
					<CardHeader className='bg-slate-50/50 border-b border-slate-100 pb-4'>
						<CardTitle className='text-lg flex items-center gap-2'>
							<BellRing className='h-5 w-5 text-amber-500' /> Recordatorios de
							Turnos
						</CardTitle>
						<CardDescription>
							Configurá cómo se avisa a los pacientes sobre sus citas.
						</CardDescription>
					</CardHeader>
					<CardContent className='p-6 space-y-6'>
						<div className='flex items-center justify-between p-4 border border-slate-200 rounded-lg'>
							<div>
								<p className='font-semibold text-slate-900'>
									Recordatorios por WhatsApp
								</p>
								<p className='text-sm text-slate-500'>
									Enviar mensaje automático 24hs antes del turno.
								</p>
							</div>
							<label className='relative inline-flex items-center cursor-pointer'>
								<input
									type='checkbox'
									className='sr-only peer'
									checked={whatsappEnabled}
									onChange={() => setWhatsappEnabled(!whatsappEnabled)}
								/>
								<div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
							</label>
						</div>

						<div className='flex items-center justify-between p-4 border border-slate-200 rounded-lg'>
							<div>
								<p className='font-semibold text-slate-900'>
									Recordatorios por Email
								</p>
								<p className='text-sm text-slate-500'>
									Enviar correo con botón para confirmar o cancelar.
								</p>
							</div>
							<label className='relative inline-flex items-center cursor-pointer'>
								<input
									type='checkbox'
									className='sr-only peer'
									checked={emailEnabled}
									onChange={() => setEmailEnabled(!emailEnabled)}
								/>
								<div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
							</label>
						</div>
					</CardContent>
				</Card>

				<div className='flex justify-end pt-4'>
					<Button
						size='lg'
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending}
						className='px-8'
					>
						{mutation.isPending ? (
							<Loader2 className='mr-2 h-5 w-5 animate-spin' />
						) : (
							<Save className='mr-2 h-5 w-5' />
						)}
						Guardar Configuración
					</Button>
				</div>
			</div>
		</main>
	);
}

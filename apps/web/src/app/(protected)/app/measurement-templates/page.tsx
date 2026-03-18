'use client';

import {
	Activity,
	Calculator,
	Hash,
	LayoutTemplate,
	Loader2,
	Plus,
	Save,
	Trash2,
	Type,
} from 'lucide-react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../../../components/ui/card';
import { TemplateField, TemplateFieldType } from '../../../../lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { apiClient } from '../../../../lib/api-client';
import { useAuth } from '../../../../providers/auth-provider';
import { useClinic } from '../../../../providers/clinic-provider';
import { useState } from 'react';

// Generador automático de IDs seguros (ej: "Peso Corporal" -> "peso_corporal")
const generateSafeId = (label: string) => {
	return label
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_|_$/g, '');
};

export default function MeasurementTemplatesPage() {
	const { activeClinicId } = useClinic();
	const { idToken } = useAuth();
	const qc = useQueryClient();

	const [isCreating, setIsCreating] = useState(false);
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [fields, setFields] = useState<TemplateField[]>([]);

	const { data: templates, isLoading } = useQuery({
		queryKey: ['measurement-templates', activeClinicId],
		queryFn: () =>
			apiClient.getTemplates(activeClinicId!, idToken ?? undefined),
		enabled: Boolean(activeClinicId && idToken),
	});

	const createMutation = useMutation({
		mutationFn: async () => {
			if (!name) throw new Error('El nombre es obligatorio');
			if (fields.length === 0)
				throw new Error('Debes agregar al menos un campo');

			// Forzamos los IDs para que sean seguros antes de enviar
			const safeFields = fields.map((f: TemplateField) => ({
				...f,
				id: generateSafeId(f.label) || f.id,
			}));

			return apiClient.createTemplate(
				{ name, description, fields: safeFields },
				activeClinicId!,
				idToken ?? undefined,
			);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['measurement-templates'] });
			setIsCreating(false);
			setName('');
			setDescription('');
			setFields([]);
		},
		onError: (err: any) =>
			alert(err.message || 'Error al guardar la plantilla'),
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.deleteTemplate(id, activeClinicId!, idToken ?? undefined),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ['measurement-templates'] }),
	});

	const addField = (type: TemplateFieldType) => {
		const newField: TemplateField = {
			id: `campo_${Date.now()}`,
			label: '',
			type,
			required: false,
			unit: '',
			decimals: type === 'formula' || type === 'number' ? 2 : undefined,
		};
		setFields([...fields, newField]);
	};

	const updateField = (index: number, updates: Partial<TemplateField>) => {
		const newFields = [...fields];
		newFields[index] = { ...newFields[index], ...updates };
		setFields(newFields);
	};

	const removeField = (index: number) => {
		setFields(fields.filter((_, i) => i !== index));
	};

	if (isLoading)
		return (
			<div className='flex justify-center py-20'>
				<Loader2 className='h-8 w-8 animate-spin text-primary' />
			</div>
		);

	return (
		<main className='mx-auto max-w-5xl px-6 py-8'>
			<div className='mb-8 flex justify-between items-center'>
				<div>
					<h1 className='text-3xl font-bold text-slate-900 flex items-center gap-3'>
						<Activity className='h-8 w-8 text-primary' /> Plantillas de Medición
					</h1>
					<p className='text-slate-500 mt-1'>
						Creá mediciones personalizadas y fórmulas automáticas para la ficha
						clínica.
					</p>
				</div>
				{!isCreating && (
					<Button
						onClick={() => setIsCreating(true)}
						className='bg-primary hover:bg-primary/90'
					>
						<Plus className='h-4 w-4 mr-2' /> Nueva Plantilla
					</Button>
				)}
			</div>

			{isCreating ? (
				<div className='space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500'>
					<Card className='border-primary/20 shadow-md'>
						<CardHeader className='bg-slate-50/50 border-b border-slate-100'>
							<CardTitle>Configuración de la Plantilla</CardTitle>
							<CardDescription>
								Nombrá esta plantilla (ej: Antropometría Completa)
							</CardDescription>
						</CardHeader>
						<CardContent className='p-6 space-y-4'>
							<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label>Nombre de la Plantilla</Label>
									<Input
										value={name}
										onChange={(e) => setName(e.target.value)}
										placeholder='Ej: Pliegues y Perímetros'
									/>
								</div>
								<div className='space-y-2'>
									<Label>Descripción (Opcional)</Label>
									<Input
										value={description}
										onChange={(e) => setDescription(e.target.value)}
										placeholder='Ej: Para pacientes de alto rendimiento'
									/>
								</div>
							</div>
						</CardContent>
					</Card>

					<div className='space-y-4'>
						<h3 className='text-lg font-semibold text-slate-800'>
							Campos Dinámicos
						</h3>

						{fields.map((field, index) => (
							<Card key={index} className='border-slate-200 overflow-hidden'>
								<div className='flex flex-col md:flex-row items-stretch'>
									{/* Indicador visual de tipo */}
									<div
										className={`w-full md:w-2 ${field.type === 'formula' ? 'bg-purple-500' : field.type === 'number' ? 'bg-blue-500' : 'bg-slate-300'}`}
									></div>

									<div className='flex-1 p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-start'>
										<div className='md:col-span-4 space-y-2'>
											<Label>Nombre del Campo</Label>
											<Input
												value={field.label}
												onChange={(e) =>
													updateField(index, { label: e.target.value })
												}
												placeholder={
													field.type === 'formula'
														? 'Ej: IMC'
														: 'Ej: Peso Actual'
												}
											/>
											{field.label && (
												<p className='text-[10px] text-slate-400 font-mono'>
													Variable: {'{'} {generateSafeId(field.label)} {'}'}
												</p>
											)}
										</div>

										{field.type === 'number' && (
											<div className='md:col-span-3 space-y-2'>
												<Label>Unidad de medida</Label>
												<Input
													value={field.unit || ''}
													onChange={(e) =>
														updateField(index, { unit: e.target.value })
													}
													placeholder='Ej: kg, cm'
												/>
											</div>
										)}

										{field.type === 'formula' && (
											<div className='md:col-span-6 space-y-2'>
												<Label className='text-purple-700'>
													Ecuación Matemática
												</Label>
												<Input
													value={field.formula || ''}
													onChange={(e) =>
														updateField(index, { formula: e.target.value })
													}
													placeholder='Ej: {peso} / (({altura}/100) * ({altura}/100))'
													className='font-mono text-sm border-purple-200 bg-purple-50 focus-visible:ring-purple-500'
												/>
												<p className='text-xs text-muted-foreground'>
													Usá las variables entre llaves {'{}'} de los otros
													campos numéricos.
												</p>
											</div>
										)}

										{(field.type === 'formula' || field.type === 'number') && (
											<div className='md:col-span-2 space-y-2'>
												<Label>Decimales</Label>
												<Input
													type='number'
													min='0'
													max='4'
													value={field.decimals || 0}
													onChange={(e) =>
														updateField(index, {
															decimals: parseInt(e.target.value),
														})
													}
												/>
											</div>
										)}

										<div className='md:col-span-1 flex justify-end pt-8'>
											<Button
												variant='ghost'
												size='icon'
												className='text-red-500 hover:text-red-700 hover:bg-red-50'
												onClick={() => removeField(index)}
											>
												<Trash2 className='h-4 w-4' />
											</Button>
										</div>
									</div>
								</div>
							</Card>
						))}

						<div className='flex flex-wrap gap-3 pt-2'>
							<Button
								variant='outline'
								onClick={() => addField('number')}
								className='border-blue-200 text-blue-700 hover:bg-blue-50'
							>
								<Hash className='mr-2 h-4 w-4' /> Agregar Número
							</Button>
							<Button
								variant='outline'
								onClick={() => addField('text')}
								className='border-slate-200 text-slate-700 hover:bg-slate-50'
							>
								<Type className='mr-2 h-4 w-4' /> Agregar Texto
							</Button>
							<Button
								variant='outline'
								onClick={() => addField('formula')}
								className='border-purple-200 text-purple-700 hover:bg-purple-50'
							>
								<Calculator className='mr-2 h-4 w-4' /> Agregar Fórmula Mágica
							</Button>
						</div>
					</div>

					<div className='flex justify-end gap-3 pt-6 border-t'>
						<Button variant='ghost' onClick={() => setIsCreating(false)}>
							Cancelar
						</Button>
						<Button
							onClick={() => createMutation.mutate()}
							disabled={
								createMutation.isPending || fields.length === 0 || !name
							}
						>
							{createMutation.isPending ? (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							) : (
								<Save className='mr-2 h-4 w-4' />
							)}
							Guardar Plantilla
						</Button>
					</div>
				</div>
			) : (
				<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
					{templates?.map((template) => (
						<Card
							key={template.id}
							className='border-slate-200 hover:border-primary/30 transition-colors shadow-sm group'
						>
							<CardHeader>
								<CardTitle className='text-lg flex justify-between items-start'>
									<span className='truncate'>{template.name}</span>
									<Button
										variant='ghost'
										size='icon'
										className='h-8 w-8 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-all'
										onClick={() => {
											if (
												confirm(
													'¿Borrar plantilla? Esto no borrará los registros clínicos de los pacientes, solo el molde.',
												)
											)
												deleteMutation.mutate(template.id);
										}}
									>
										<Trash2 className='h-4 w-4' />
									</Button>
								</CardTitle>
								{template.description && (
									<CardDescription className='truncate'>
										{template.description}
									</CardDescription>
								)}
							</CardHeader>
							<CardContent>
								<div className='flex flex-wrap gap-2'>
									<Badge
										variant='secondary'
										className='bg-slate-100 text-slate-600'
									>
										{template.fields.length} campos
									</Badge>
									{template.fields.some((f) => f.type === 'formula') && (
										<Badge
											variant='outline'
											className='border-purple-200 text-purple-700 bg-purple-50'
										>
											<Calculator className='h-3 w-3 mr-1' /> Autocalculable
										</Badge>
									)}
								</div>
							</CardContent>
						</Card>
					))}
					{templates?.length === 0 && (
						<div className='col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50'>
							<LayoutTemplate className='h-10 w-10 text-slate-300 mx-auto mb-3' />
							<h3 className='text-lg font-medium text-slate-700'>
								Sin plantillas médicas
							</h3>
							<p className='text-sm text-slate-500 mt-1'>
								Creá tu primer molde de mediciones (ej: Antropometría) para usar
								en la Historia Clínica.
							</p>
						</div>
					)}
				</div>
			)}
		</main>
	);
}

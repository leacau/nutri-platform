import { useId } from 'react';
import type { User } from 'firebase/auth';
import type { Dispatch, SetStateAction } from 'react';
import type { getCopy } from '../i18n';
import type {
	AuthedFetchResult,
	Claims,
	ConfirmAction,
	LogEntry,
	RoleTab,
} from '../types/app';
import { DATETIME_LOCAL_PATTERN, EMAIL_PATTERN, PHONE_PATTERN } from '../utils/validation';

type Copy = ReturnType<typeof getCopy>;

type ScheduleSelection = { when: string; manualWhen?: string; nutri: string };
type PatientFieldErrors = { email: string | null; phone: string | null };

type DashboardProps = {
	copy: Copy;
	user: User | null;
	claims: Claims;
	roleTabs: RoleTab[];
	activeRoleTab: RoleTab['key'];
	activeRoleContent: RoleTab;
	setActiveRoleTab: Dispatch<SetStateAction<RoleTab['key']>>;
	toggleTheme: () => void;
	isDark: boolean;
	loading: boolean;
	loadingSlots: boolean;
	handleRefreshClaims: () => Promise<void>;
	handleLogout: () => Promise<void>;
	handleGetMe: () => Promise<void>;
	authedFetch: (
		method: 'GET' | 'POST' | 'PATCH',
		endpoint: string,
		body?: unknown
	) => Promise<AuthedFetchResult>;
	pName: string;
	setPName: Dispatch<SetStateAction<string>>;
	pEmail: string;
	setPEmail: Dispatch<SetStateAction<string>>;
	pPhone: string;
	setPPhone: Dispatch<SetStateAction<string>>;
	patientErrors: PatientFieldErrors;
	selectedClinicForNewPatient: string;
	setSelectedClinicForNewPatient: Dispatch<SetStateAction<string>>;
	clinicOptions: string[];
	handleCreatePatient: () => Promise<void>;
	patients: unknown[];
	patientAssignSelections: Record<string, string>;
	setPatientAssignSelections: Dispatch<SetStateAction<Record<string, string>>>;
	knownNutris: string[];
	handleAssignNutri: (patientId: string) => Promise<void>;
	handleListPatients: () => Promise<void>;
	appointments: unknown[];
	handleScheduleAppointment: (apptId: string) => Promise<void>;
	apptRequestNutriUid: string;
	setApptRequestNutriUid: Dispatch<SetStateAction<string>>;
	slotRangeFrom: string;
	setSlotRangeFrom: Dispatch<SetStateAction<string>>;
	slotRangeTo: string;
	setSlotRangeTo: Dispatch<SetStateAction<string>>;
	apptRequestSlot: string;
	setApptRequestSlot: Dispatch<SetStateAction<string>>;
	apptManualSlot: string;
	setApptManualSlot: Dispatch<SetStateAction<string>>;
	handleLoadSlots: (
		nutriUid?: string,
		range?: { fromIso?: string | null; toIso?: string | null }
	) => Promise<void>;
	handleRequestAppointment: () => Promise<void>;
	handleListAppointments: () => Promise<void>;
	slotRangeError: string | null;
	appointmentFormError: string | null;
	apptSlots: string[];
	apptBusySlots: string[];
	linkRequired: { active: boolean; reason?: string };
	linkFlowMessage: string | null;
	linking: boolean;
	handleLinkPatientAndRetry: () => Promise<void>;
	scheduleSelections: Record<string, ScheduleSelection>;
	setScheduleSelections: Dispatch<SetStateAction<Record<string, ScheduleSelection>>>;
	scheduleErrors: Record<string, string | null>;
	setScheduleErrors: Dispatch<SetStateAction<Record<string, string | null>>>;
	currentSlotsNutri: string;
	formatSlotLabel: (iso: string) => string;
	toReadableDate: (value: unknown) => string;
	toIsoFromDatetimeLocal: (value: string) => string | null;
	setConfirmAction: Dispatch<SetStateAction<ConfirmAction | null>>;
	reversedLogs: LogEntry[];
};

export default function Dashboard({
	copy,
	user,
	claims,
	roleTabs,
	activeRoleTab,
	activeRoleContent,
	setActiveRoleTab,
	toggleTheme,
	isDark,
	loading,
	loadingSlots,
	handleRefreshClaims,
	handleLogout,
	handleGetMe,
	authedFetch,
	pName,
	setPName,
	pEmail,
	setPEmail,
	pPhone,
	setPPhone,
	patientErrors,
	selectedClinicForNewPatient,
	setSelectedClinicForNewPatient,
	clinicOptions,
	handleCreatePatient,
	patients,
	patientAssignSelections,
	setPatientAssignSelections,
	knownNutris,
	handleAssignNutri,
	handleListPatients,
	appointments,
	handleScheduleAppointment,
	apptRequestNutriUid,
	setApptRequestNutriUid,
	slotRangeFrom,
	setSlotRangeFrom,
	slotRangeTo,
	setSlotRangeTo,
	apptRequestSlot,
	setApptRequestSlot,
	apptManualSlot,
	setApptManualSlot,
	handleLoadSlots,
	handleRequestAppointment,
	handleListAppointments,
	slotRangeError,
	appointmentFormError,
	apptSlots,
	apptBusySlots,
	linkRequired,
	linkFlowMessage,
	linking,
	handleLinkPatientAndRetry,
	scheduleSelections,
	setScheduleSelections,
	scheduleErrors,
	setScheduleErrors,
	currentSlotsNutri,
	formatSlotLabel,
	toReadableDate,
	toIsoFromDatetimeLocal,
	setConfirmAction,
	reversedLogs,
}: DashboardProps) {
	const role = claims.role;
	const canClinic = role === 'clinic_admin' || role === 'nutri' || role === 'staff';
	const isPlatform = role === 'platform_admin';
	const isPatient = role === 'patient';
	const displayEmail = user?.email ?? copy.dashboard.unknownEmail;
	const roleLabelValue = role ?? copy.dashboard.noRole;
	const clinicLabelValue = claims.clinicId ?? copy.dashboard.noClinic;
	const roleTabListId = useId();
	const tabPanelId = useId();
	const patientPhoneErrorId = useId();
	const patientEmailErrorId = useId();
	const slotRangeErrorId = useId();
	const manualSlotErrorId = useId();
	const handleRoleTabKeyDown = (
		event: React.KeyboardEvent<HTMLButtonElement>,
		index: number
	) => {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		event.preventDefault();
		const offset = event.key === 'ArrowRight' ? 1 : -1;
		const nextIndex = (index + offset + roleTabs.length) % roleTabs.length;
		setActiveRoleTab(roleTabs[nextIndex]?.key ?? activeRoleTab);
	};

	return (
		<div className='page'>
			<header className='subheader'>
				<div>
					<p className='eyebrow'>{copy.dashboard.sessionEyebrow}</p>
					<div className='inline-heading'>
						<h2>{displayEmail}</h2>
						<span className='pill subtle'>
							{activeRoleContent.icon} {activeRoleContent.label}
						</span>
					</div>
					<p className='muted'>
						{copy.dashboard.roleLabel}: <strong>{roleLabelValue}</strong> — {copy.dashboard.clinicLabel}:{' '}
						<strong>{clinicLabelValue}</strong>
					</p>
				</div>
				<div className='actions'>
					<button className='btn ghost' onClick={toggleTheme}>
						{isDark ? '🌙' : '☀️'} {isDark ? copy.dashboard.themeDark : copy.dashboard.themeLight}
					</button>
					<button className='btn ghost' disabled={loading} onClick={handleRefreshClaims}>
						{copy.auth.refreshClaims}
					</button>
					<button className='btn' disabled={loading} onClick={handleLogout}>
						{copy.nav.logout}
					</button>
				</div>
			</header>

			<div className='card tabs-card'>
				<div className='inline-heading'>
					<h3>{copy.dashboard.roleTabsLabel}</h3>
					<span className='pill subtle'>{copy.dashboard.roleTabsHelp}</span>
				</div>
				<div className='tabs' role='tablist' aria-label={copy.dashboard.roleTabsLabel} id={roleTabListId}>
					{roleTabs.map((tab, idx) => (
						<button
							key={tab.key}
							id={`${roleTabListId}-${tab.key}`}
							className={`tab ${activeRoleTab === tab.key ? 'is-active' : ''}`}
							onClick={() => setActiveRoleTab(tab.key)}
							onKeyDown={(event) => handleRoleTabKeyDown(event, idx)}
							role='tab'
							aria-selected={activeRoleTab === tab.key}
							tabIndex={activeRoleTab === tab.key ? 0 : -1}
							aria-controls={tabPanelId}
						>
							<span className='tab-icon' aria-hidden>
								{tab.icon}
							</span>
							<span>{tab.label}</span>
						</button>
					))}
				</div>
				<div className='tab-panel' role='tabpanel' id={tabPanelId} aria-labelledby={`${roleTabListId}-${activeRoleTab}`}>
					<p className='muted'>{activeRoleContent.description}</p>
					<ul className='muted'>
						{activeRoleContent.tips.map((tip, idx) => (
							<li key={idx}>{tip}</li>
						))}
					</ul>
				</div>
			</div>

			<div className='grid two'>
				<div className='card'>
					<h3>{copy.dashboard.profile.title}</h3>
					<p className='muted'>{copy.dashboard.profile.description}</p>
					<div className='actions'>
						<button className='btn primary' disabled={loading} onClick={() => handleGetMe()}>
							{copy.dashboard.profile.view}
						</button>
						<button className='btn' disabled={loading} onClick={() => authedFetch('GET', '/health')}>
							{copy.dashboard.profile.ping}
						</button>
					</div>
				</div>

				<div className='card'>
					<h3>{copy.dashboard.patients.title}</h3>
					{canClinic || isPlatform ? (
						<>
							<div className='grid two'>
								<label className='field'>
									<span>{copy.dashboard.patients.fields.name}</span>
									<input
										value={pName}
										onChange={(e) => setPName(e.target.value)}
										placeholder={copy.dashboard.patients.placeholders.name}
									/>
								</label>
								<label className='field'>
									<span>{copy.dashboard.patients.fields.phone}</span>
									<input
										type='tel'
										inputMode='tel'
										pattern={PHONE_PATTERN.source}
										value={pPhone}
										onChange={(e) => setPPhone(e.target.value)}
										placeholder={copy.dashboard.patients.placeholders.phone}
										aria-invalid={!!patientErrors.phone}
										aria-describedby={patientErrors.phone ? patientPhoneErrorId : undefined}
									/>
									{patientErrors.phone && (
										<p className='error-text' id={patientPhoneErrorId} role='status' aria-live='polite'>
											{patientErrors.phone}
										</p>
									)}
								</label>
							</div>
							<div className='grid two'>
								<label className='field'>
									<span>{copy.dashboard.patients.fields.email}</span>
									<input
										type='email'
										inputMode='email'
										pattern={EMAIL_PATTERN.source}
										value={pEmail}
										onChange={(e) => setPEmail(e.target.value)}
										placeholder={copy.dashboard.patients.placeholders.email}
										aria-invalid={!!patientErrors.email}
										aria-describedby={patientErrors.email ? patientEmailErrorId : undefined}
									/>
									{patientErrors.email && (
										<p className='error-text' id={patientEmailErrorId} role='status' aria-live='polite'>
											{patientErrors.email}
										</p>
									)}
								</label>
								<label className='field'>
									<span>{copy.dashboard.patients.fields.clinic}</span>
									<select
										value={selectedClinicForNewPatient}
										onChange={(e) => setSelectedClinicForNewPatient(e.target.value)}
										disabled={clinicOptions.length === 0}
									>
										{clinicOptions.map((cid) => (
											<option key={cid} value={cid}>
												{cid}
											</option>
										))}
										{clinicOptions.length === 0 && (
											<option value=''>{copy.dashboard.patients.fields.clinicEmpty}</option>
										)}
									</select>
								</label>
								<div className='actions end'>
									<button className='btn primary' disabled={loading} onClick={handleCreatePatient}>
										{copy.dashboard.patients.create}
									</button>
								</div>
							</div>

							<div className='divider' />

							{patients.length > 0 && (
								<div className='list'>
									{patients.map((p, idx) => {
										const patientRecord = p as Record<string, unknown>;
										const patientId = (patientRecord.id as string) ?? String(idx);
										const patientName =
											(patientRecord.name as string) ?? copy.dashboard.patients.missingName;
										const patientEmail =
											(patientRecord.email as string) ?? copy.dashboard.patients.missingEmail;
										const patientClinic =
											(patientRecord.clinicId as string) ?? copy.dashboard.noClinic;
										const patientPhone =
											(patientRecord.phone as string) ?? copy.dashboard.patients.missingPhone;
										const assignedNutri =
											(patientRecord.assignedNutriUid as string) ?? '';
										const selectedNutri = patientAssignSelections[patientId] ?? assignedNutri;
										return (
											<div className='card' key={patientId}>
												<div className='inline-info'>
													<div>
														<strong>{patientName}</strong>
														<div className='muted'>{patientEmail}</div>
													</div>
													<div>
														<small>{copy.dashboard.patients.fields.clinic}</small>
														<div className='muted'>{patientClinic}</div>
													</div>
												</div>
												<div className='inline-info'>
													<div>
														<small>{copy.dashboard.patients.fields.phone}</small>
														<div className='muted'>{patientPhone}</div>
													</div>
													<div>
														<small>{copy.dashboard.patients.assignedNutri}</small>
														<div className='muted'>
															{assignedNutri || copy.dashboard.patients.missingNutri}
														</div>
													</div>
												</div>
												<div className='actions'>
													<select
														value={selectedNutri}
														onChange={(e) =>
															setPatientAssignSelections((prev) => ({
																...prev,
																[patientId]: e.target.value,
															}))
														}
													>
														<option value=''>{copy.dashboard.patients.selectNutri}</option>
														{knownNutris.map((n) => (
															<option key={n} value={n}>
																{n}
															</option>
														))}
													</select>
													<button
														className='btn'
														disabled={loading || !selectedNutri}
														onClick={() => handleAssignNutri(patientId)}
													>
														{copy.dashboard.patients.assignNutri}
													</button>
												</div>
											</div>
										);
									})}
								</div>
							)}
							<button className='btn ghost' disabled={loading} onClick={handleListPatients}>
								{copy.dashboard.patients.refresh}
							</button>
						</>
					) : (
						<p className='muted'>{copy.dashboard.patients.onlyClinic}</p>
					)}
				</div>
			</div>

			<div className='card'>
				<h3>{copy.dashboard.appointments.title}</h3>
				<p className='muted'>{copy.dashboard.appointments.description}</p>
				{!isPatient && <p className='muted'>{copy.dashboard.appointments.patientRoleReminder}</p>}
				<p className='muted'>{copy.dashboard.appointments.tip}</p>
				<div
					className='muted'
					style={{
						padding: 12,
						borderRadius: 8,
						border: '1px solid #f3c96b',
						background: '#fff7e0',
						marginBottom: 16,
					}}
				>
					{copy.dashboard.appointments.reminder}
				</div>
				{appointments.length === 0 && <p className='muted'>{copy.dashboard.appointments.noAppointments}</p>}
				<div className='grid three'>
					<label className='field'>
						<span>{copy.dashboard.appointments.form.selectNutri}</span>
						<select value={apptRequestNutriUid} onChange={(e) => setApptRequestNutriUid(e.target.value)}>
							{knownNutris.map((n) => (
								<option key={n} value={n}>
									{n}
								</option>
							))}
							{knownNutris.length === 0 && (
								<option value=''>{copy.dashboard.appointments.form.noNutriOptions}</option>
							)}
						</select>
					</label>
					<label className='field'>
						<span>{copy.dashboard.appointments.form.from}</span>
						<input
							type='datetime-local'
							inputMode='numeric'
							pattern={DATETIME_LOCAL_PATTERN.source}
							value={slotRangeFrom}
							onChange={(e) => setSlotRangeFrom(e.target.value)}
							aria-invalid={!!slotRangeError}
							aria-describedby={slotRangeError ? slotRangeErrorId : undefined}
						/>
					</label>
					<label className='field'>
						<span>{copy.dashboard.appointments.form.to}</span>
						<input
							type='datetime-local'
							inputMode='numeric'
							pattern={DATETIME_LOCAL_PATTERN.source}
							value={slotRangeTo}
							onChange={(e) => setSlotRangeTo(e.target.value)}
							aria-invalid={!!slotRangeError}
							aria-describedby={slotRangeError ? slotRangeErrorId : undefined}
						/>
					</label>
					<label className='field'>
						<span>{copy.dashboard.appointments.form.slotLabel}</span>
						<select
							value={apptRequestSlot}
							onChange={(e) => setApptRequestSlot(e.target.value)}
							disabled={loadingSlots || apptSlots.length === 0}
						>
							{apptSlots.length === 0 && (
								<option value=''>{copy.dashboard.appointments.form.noSlots}</option>
							)}
							{apptSlots.map((slot) => (
								<option key={slot} value={slot}>
									{formatSlotLabel(slot)}
								</option>
							))}
						</select>
					</label>
					<button
						className='btn ghost'
						disabled={loadingSlots || !apptRequestNutriUid}
						onClick={() => handleLoadSlots(apptRequestNutriUid)}
					>
						{copy.dashboard.appointments.form.refreshSlots}
					</button>
					<button
						className='btn primary'
						disabled={loading || linking || !isPatient || knownNutris.length === 0 || !apptRequestSlot}
						onClick={handleRequestAppointment}
					>
						{copy.dashboard.appointments.form.request}
					</button>
					<button className='btn ghost' disabled={loading} onClick={handleListAppointments}>
						{copy.dashboard.appointments.form.list}
					</button>
				</div>

				{slotRangeError && (
					<p className='muted' role='status' aria-live='assertive' id={slotRangeErrorId}>
						{slotRangeError}
					</p>
				)}

				{apptSlots.length === 0 && (
					<div className='card' style={{ background: '#f7f7f7', border: '1px dashed #ccc' }}>
						<p className='muted'>{copy.dashboard.appointments.form.manualHelp}</p>
						<label className='field'>
							<span>{copy.dashboard.appointments.form.manualLabel}</span>
							<input
								type='datetime-local'
								inputMode='numeric'
								pattern={DATETIME_LOCAL_PATTERN.source}
								value={apptManualSlot}
								onChange={(e) => setApptManualSlot(e.target.value)}
								aria-invalid={!!appointmentFormError}
								aria-describedby={appointmentFormError ? manualSlotErrorId : undefined}
							/>
							{appointmentFormError && (
								<p className='error-text' id={manualSlotErrorId} role='status' aria-live='assertive'>
									{appointmentFormError}
								</p>
							)}
						</label>
					</div>
				)}

				{linkRequired.active && (
					<div className='card' style={{ background: '#fff7e0', border: '1px solid #f3c96b' }}>
						<h4>{copy.dashboard.appointments.linking.title}</h4>
						<p className='muted'>{linkRequired.reason ?? copy.dashboard.appointments.linking.description}</p>
						<div className='actions'>
							<button className='btn primary' disabled={loading || linking} onClick={handleLinkPatientAndRetry}>
								{copy.dashboard.appointments.linking.createAndLink}
							</button>
							<button className='btn ghost' disabled={loading} onClick={handleListAppointments}>
								{copy.dashboard.appointments.linking.refresh}
							</button>
						</div>
						{linkFlowMessage && (
							<p className='muted' role='status' aria-live='polite'>
								{linkFlowMessage}
							</p>
						)}
					</div>
				)}

				{appointments.length > 0 && (
					<div className='appointments'>
						{appointments.map((a, idx) => {
							const appt = a as Record<string, unknown>;
							const appointmentId = (appt.id as string) ?? undefined;
							const appointmentKey = appointmentId ?? String(idx);
							const appointmentNutri = (appt.nutriUid as string) ?? '';
							const appointmentPatientUid = appt.patientUid as string | undefined;
							const appointmentPatientId =
								(appt.patientId as string) ?? appointmentPatientUid ?? '—';
							const appointmentClinic = (appt.clinicId as string) ?? copy.dashboard.noClinic;
							const appointmentStatus = (appt.status as string) ?? 'requested';
							const sched =
								scheduleSelections[appointmentKey] ?? {
									when: '',
									manualWhen: '',
									nutri: appointmentNutri || apptRequestNutriUid || '',
								};
							const canSchedule =
								role === 'nutri' ||
								role === 'clinic_admin' ||
								(role === 'patient' && appointmentPatientUid === user?.uid);
							const canComplete = role === 'nutri' || role === 'clinic_admin' || role === 'platform_admin';
							const lockNutri = role === 'patient';
							const status: string = appointmentStatus;
							const statusTone =
								status === 'completed'
									? 'success'
									: status === 'cancelled'
									? 'danger'
									: status === 'scheduled'
									? 'warn'
									: 'info';
							const statusIcon: Record<string, string> = {
								requested: '⏳',
								scheduled: '📅',
								completed: '✅',
								cancelled: '🚫',
							};
							const scheduleErrorMessage = scheduleErrors[appointmentKey] ?? null;
							const scheduleErrorId = `schedule-error-${appointmentKey}`;
							return (
								<div className='appt-card' key={appointmentKey}>
									<div className='appt-head'>
										<div className='appt-headline'>
											<p className='eyebrow'>{copy.dashboard.appointments.cardLabel}</p>
											<strong>{appointmentId ?? copy.dashboard.appointments.noId}</strong>
										</div>
										<div className='appt-meta'>
											<span className={`pill status status-${statusTone}`}>
												<span aria-hidden>{statusIcon[status] ?? '📌'}</span>{' '}
												{copy.dashboard.appointments.statusLabel[
													status as keyof typeof copy.dashboard.appointments.statusLabel
												] ?? status}
											</span>
											<span className='pill subtle' aria-label={`${copy.dashboard.appointments.detailLabels.positionLabel} ${idx + 1}`}>
												#{idx + 1}
											</span>
										</div>
									</div>
									<div className='appt-grid'>
										<div>
											<small>{copy.dashboard.appointments.detailLabels.clinic}</small>
											<div className='muted'>{appointmentClinic}</div>
										</div>
										<div>
											<small>{copy.dashboard.appointments.detailLabels.patient}</small>
											<div className='muted'>{appointmentPatientId}</div>
										</div>
										<div>
											<small>{copy.dashboard.appointments.detailLabels.nutri}</small>
											<div className='muted'>{appointmentNutri || copy.dashboard.patients.missingNutri}</div>
										</div>
										<div>
											<small>{copy.dashboard.appointments.detailLabels.requested}</small>
											<div className='muted'>{toReadableDate(appt.requestedAt)}</div>
										</div>
										<div>
											<small>{copy.dashboard.appointments.detailLabels.scheduled}</small>
											<div className='muted'>{toReadableDate(appt.scheduledFor)}</div>
										</div>
										<div>
											<small>{copy.dashboard.appointments.detailLabels.updated}</small>
											<div className='muted'>{toReadableDate(appt.updatedAt)}</div>
										</div>
									</div>
									{!canSchedule && (
										<p className='muted' style={{ marginTop: 8 }}>
											{role === 'patient'
												? copy.dashboard.appointments.schedule.lockNotice
												: copy.dashboard.appointments.schedule.permissionHint}
										</p>
									)}
									<div className='appt-actions'>
										{canSchedule && (
											<div className='appt-action-block'>
												<p className='muted small'>{copy.dashboard.appointments.schedule.title}</p>
												<div className='appt-action-grid'>
													<select
														value={sched.nutri}
														disabled={lockNutri}
														onChange={(e) => {
															setScheduleErrors((prev) => ({ ...prev, [appointmentKey]: null }));
															setScheduleSelections((prev) => ({
																...prev,
																[appointmentKey]: {
																	...prev[appointmentKey],
																	when: '',
																	manualWhen: '',
																	nutri: e.target.value,
																},
															}));
														}}
													>
														<option value=''>{copy.dashboard.appointments.schedule.selectNutri}</option>
														{knownNutris.map((n) => (
															<option key={n} value={n}>
																{n}
															</option>
														))}
													</select>
													<select
														value={sched.when}
														disabled={
															loadingSlots ||
															!sched.nutri ||
															currentSlotsNutri !== sched.nutri ||
															apptSlots.length === 0
														}
														onChange={(e) => {
															setScheduleErrors((prev) => ({ ...prev, [appointmentKey]: null }));
															setScheduleSelections((prev) => ({
																...prev,
																[appointmentKey]: {
																	...prev[appointmentKey],
																	when: e.target.value,
																	nutri: sched.nutri,
																},
															}));
														}}
													>
														{currentSlotsNutri !== sched.nutri && (
															<option value=''>{copy.dashboard.appointments.schedule.selectSlot}</option>
														)}
														{currentSlotsNutri === sched.nutri && apptSlots.length === 0 && (
															<option value=''>{copy.dashboard.appointments.schedule.noSlots}</option>
														)}
														{currentSlotsNutri === sched.nutri &&
															apptSlots.map((slot) => (
																<option key={slot} value={slot}>
																	{formatSlotLabel(slot)}
																</option>
															))}
													</select>
													<input
														type='datetime-local'
														inputMode='numeric'
														pattern={DATETIME_LOCAL_PATTERN.source}
														value={sched.manualWhen ?? ''}
														onChange={(e) => {
															setScheduleErrors((prev) => ({ ...prev, [appointmentKey]: null }));
															setScheduleSelections((prev) => ({
																...prev,
																[appointmentKey]: {
																	...prev[appointmentKey],
																	manualWhen: e.target.value,
																	nutri: sched.nutri,
																},
															}));
														}}
														placeholder={copy.dashboard.appointments.schedule.manualFallback}
														aria-invalid={!!scheduleErrorMessage}
														aria-describedby={scheduleErrorMessage ? scheduleErrorId : undefined}
													/>
													{scheduleErrorMessage && (
														<p className='error-text' id={scheduleErrorId} role='status' aria-live='assertive'>
															{scheduleErrorMessage}
														</p>
													)}
												</div>
												<div className='actions wrap'>
													<button
														className='btn ghost'
														disabled={loadingSlots || !sched.nutri}
														onClick={() =>
															handleLoadSlots(sched.nutri || apptRequestNutriUid, {
																fromIso: toIsoFromDatetimeLocal(slotRangeFrom),
																toIso: toIsoFromDatetimeLocal(slotRangeTo),
															})
														}
													>
														{copy.dashboard.appointments.schedule.loadSlots}
													</button>
													<button
														className='btn'
														disabled={loading || (!sched.when && !sched.manualWhen)}
														onClick={() => handleScheduleAppointment(appointmentKey)}
													>
														{copy.dashboard.appointments.schedule.program}
													</button>
												</div>
											</div>
										)}
										<div className='appt-action-block secondary'>
											<p className='muted small'>{copy.dashboard.appointments.quickActions.title}</p>
											<div className='actions wrap'>
												<button
													className='btn ghost'
													disabled={loading}
													onClick={() => setConfirmAction({ type: 'cancel', apptId: appointmentKey })}
												>
													{copy.dashboard.appointments.quickActions.cancel}
												</button>
												{canComplete && (
													<button
														className='btn success'
														disabled={loading}
														onClick={() => setConfirmAction({ type: 'complete', apptId: appointmentKey })}
													>
														{copy.dashboard.appointments.quickActions.complete}
													</button>
												)}
											</div>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{(role === 'clinic_admin' || role === 'nutri') && (
				<div className='card'>
					<h3>{copy.dashboard.clinicAvailability.title}</h3>
					<p className='muted'>{copy.dashboard.clinicAvailability.description}</p>
					<div className='actions wrap'>
						<button
							className='btn'
							disabled={loadingSlots || !apptRequestNutriUid}
							onClick={() => handleLoadSlots(apptRequestNutriUid)}
						>
							{copy.dashboard.clinicAvailability.refresh}
						</button>
						<span className='pill'>
							{copy.dashboard.clinicAvailability.counts
								.replace('{{free}}', String(apptSlots.length))
								.replace('{{busy}}', String(apptBusySlots.length))}
						</span>
					</div>
					{apptSlots.length === 0 && apptBusySlots.length === 0 ? (
						<p className='muted'>{copy.dashboard.clinicAvailability.empty}</p>
					) : (
						<div className='list'>
							{apptSlots.slice(0, 6).map((slot) => (
								<div className='inline-info' key={`free-${slot}`}>
									<div>
										<small>{copy.dashboard.clinicAvailability.freeLabel}</small>
										<div>{formatSlotLabel(slot)}</div>
									</div>
								</div>
							))}
							{apptBusySlots.slice(0, 6).map((slot) => (
								<div className='inline-info' key={`busy-${slot}`}>
									<div>
										<small>{copy.dashboard.clinicAvailability.busyLabel}</small>
										<div className='muted'>{formatSlotLabel(slot)}</div>
									</div>
								</div>
							))}
							{apptSlots.length + apptBusySlots.length > 12 && (
								<p className='muted'>{copy.dashboard.clinicAvailability.limited}</p>
							)}
						</div>
					)}
				</div>
			)}

			<div className='card'>
				<h3>{copy.dashboard.log.title}</h3>
				{reversedLogs.length === 0 ? (
					<p className='muted'>{copy.dashboard.log.empty}</p>
				) : (
					<ul className='log'>
						{reversedLogs.map((l, idx) => (
							<li key={idx}>
								<div className='log-head'>
									<code>{l.ts}</code>
									<strong>{l.endpoint}</strong>
									<span className={l.ok ? 'pill ok' : 'pill error'}>
										{l.ok ? copy.dashboard.log.ok : copy.dashboard.log.error}
									</span>
								</div>
								{l.payload !== undefined && (
									<div className='log-body'>
										<small>{copy.dashboard.log.payloadLabel}</small> <code>{JSON.stringify(l.payload)}</code>
									</div>
								)}
								<div className='log-body'>
									<small>{l.ok ? copy.dashboard.log.dataLabel : copy.dashboard.log.error}</small>{' '}
									<code>{l.ok ? JSON.stringify(l.data) : l.error}</code>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

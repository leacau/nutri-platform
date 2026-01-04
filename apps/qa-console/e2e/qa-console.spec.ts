import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill('qa1@test.com');
	await page.getByLabel('Password').fill('Passw0rd!');
	await page.getByRole('button', { name: 'Login' }).click();
	await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('QA Console E2E (stubbed)', () => {
	test('permite login y creación de paciente usando labels accesibles', async ({ page }) => {
		await signIn(page);

		const pacientesCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Pacientes' }) });
		await expect(pacientesCard).toBeVisible();

		await pacientesCard.getByLabel('Nombre').fill('Paciente de prueba');
		await pacientesCard.getByLabel('Teléfono').fill('+549111111111');
		await pacientesCard.getByLabel('Email').fill('paciente.e2e@example.com');
		await pacientesCard.getByRole('button', { name: 'Crear paciente' }).click();

		await expect(pacientesCard.getByText('Paciente de prueba')).toBeVisible();
	});

	test('agenda rápidamente un turno usando slots disponibles', async ({ page }) => {
		await signIn(page);

		const turnosCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Turnos' }) });
		await turnosCard.getByRole('button', { name: 'Listar turnos' }).click();

		const appointmentCard = turnosCard.locator('.appt-card').first();
		await expect(appointmentCard).toBeVisible();

		await appointmentCard.getByRole('button', { name: 'Slots de nutri' }).click();

		const slotSelect = appointmentCard.locator('select[multiple]');
		const firstOption = slotSelect.locator('option').first();
		await expect(firstOption).toBeVisible();
		const value = await firstOption.getAttribute('value');
		if (value) {
			await slotSelect.selectOption(value);
		}

		await appointmentCard.getByRole('button', { name: 'Programar' }).click();
		const statusBadge = appointmentCard.locator('span').filter({ hasText: 'Programado' }).first();
		await expect(statusBadge).toBeVisible();
	});

	test('el modal de confirmación mantiene el foco atrapado', async ({ page }) => {
		await signIn(page);

		const turnosCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Turnos' }) });
		await turnosCard.getByRole('button', { name: 'Listar turnos' }).click();

		const appointmentCard = turnosCard.locator('.appt-card').first();
		await appointmentCard.getByRole('button', { name: 'Cancelar' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();

		const modalButtons = dialog.getByRole('button');
		await expect(modalButtons.first()).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(modalButtons.nth(1)).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(modalButtons.first()).toBeFocused();

		await modalButtons.first().click();
		await expect(dialog).toBeHidden();
	});
});

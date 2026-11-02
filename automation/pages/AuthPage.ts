import type { Locator, Page } from '@playwright/test';
import type { SignupInput } from '../data/factories.js';

export class AuthPage {
  readonly heading: Locator;
  readonly fullNameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly createAccountButton: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Create your account.' });
    this.fullNameInput = page.getByLabel('Full name');
    this.emailInput = page.getByLabel('Email address');
    this.passwordInput = page.getByLabel('Password', { exact: true });
    this.confirmPasswordInput = page.getByLabel('Confirm password');
    this.createAccountButton = page.getByRole('button', { name: 'Create account' });
  }

  async gotoSignup(): Promise<void> {
    await this.page.goto('/auth?mode=signup');
  }

  async signUp(credentials: SignupInput): Promise<void> {
    await this.fullNameInput.fill(credentials.fullName);
    await this.emailInput.fill(credentials.email);
    await this.passwordInput.fill(credentials.password);
    await this.confirmPasswordInput.fill(credentials.password);
    await this.createAccountButton.click();
  }
}

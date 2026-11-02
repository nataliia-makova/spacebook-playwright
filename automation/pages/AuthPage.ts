import type { Locator, Page } from '@playwright/test';
import type { SignupInput } from '../data/factories.js';

export class AuthPage {
  readonly heading: Locator;
  readonly signinHeading: Locator;
  readonly fullNameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly confirmPasswordError: Locator;
  readonly message: Locator;
  readonly createAccountButton: Locator;
  readonly signinButton: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Create your account.' });
    this.signinHeading = page.getByRole('heading', { name: 'Welcome back.' });
    this.fullNameInput = page.getByLabel('Full name');
    this.emailInput = page.getByLabel('Email address');
    this.passwordInput = page.getByLabel('Password', { exact: true });
    this.confirmPasswordInput = page.getByLabel('Confirm password');
    this.confirmPasswordError = page.locator('#confirmPassword-error');
    this.message = page.getByRole('alert');
    this.createAccountButton = page.getByRole('button', { name: 'Create account' });
    this.signinButton = page.getByRole('button', { name: 'Sign in', exact: true });
  }

  async gotoSignup(): Promise<void> {
    await this.page.goto('/auth?mode=signup');
  }

  async gotoSignin(): Promise<void> {
    await this.page.goto('/auth?mode=signin');
  }

  async signUp(credentials: SignupInput, confirmationPassword = credentials.password): Promise<void> {
    await this.fullNameInput.fill(credentials.fullName);
    await this.emailInput.fill(credentials.email);
    await this.passwordInput.fill(credentials.password);
    await this.confirmPasswordInput.fill(confirmationPassword);
    await this.createAccountButton.click();
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signinButton.click();
  }
}

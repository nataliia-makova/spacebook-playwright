import type { Locator, Page } from '@playwright/test';

export class SpaceCatalogPage {
  readonly heading: Locator;
  readonly typeFilter: Locator;
  readonly capacityFilter: Locator;
  readonly accountLink: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Find room for your next idea.' });
    this.typeFilter = page.getByLabel('Space type');
    this.capacityFilter = page.getByLabel('Minimum capacity');
    this.accountLink = page.getByRole('link', { name: 'Account', exact: true });
  }

  spaceHeading(name: string): Locator {
    return this.page.getByRole('heading', { name, exact: true });
  }

  async goto(): Promise<void> {
    await this.page.goto('/spaces');
  }

  async filterBy(type: string, minimumCapacity: number): Promise<void> {
    await this.typeFilter.selectOption(type);
    await this.capacityFilter.selectOption(String(minimumCapacity));
  }
}

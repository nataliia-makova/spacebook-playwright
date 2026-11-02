import { expect, test, type Page } from '@playwright/test';
import type { Space } from '../../shared/contracts.js';
import { SpaceCatalogPage } from '../pages/SpaceCatalogPage.js';

export type CatalogScenario = {
  matchingSpace: Space;
  sameTypeButTooSmall: Space;
  largeSpaceOfAnotherType: Space;
  filterType: Space['type'];
  minimumCapacity: number;
};

export class SpaceCatalogFlow {
  constructor(private readonly page: Page) {}

  async filterByTypeAndCapacity(scenario: CatalogScenario): Promise<void> {
    await test.step('Filter the space catalog by type and capacity as a guest', async () => {
      const catalog = new SpaceCatalogPage(this.page);
      await catalog.goto();
      await expect(catalog.heading).toBeVisible();
      await expect(catalog.accountLink, 'The catalog should remain available to a guest.')
        .toBeVisible();

      await catalog.filterBy(scenario.filterType, scenario.minimumCapacity);
      await expect(catalog.typeFilter).toHaveValue(scenario.filterType);
      await expect(catalog.capacityFilter).toHaveValue(String(scenario.minimumCapacity));
      await expect(
        catalog.spaceHeading(scenario.matchingSpace.name),
        'The space matching both filters should remain visible.'
      ).toBeVisible();
      await expect(
        catalog.spaceHeading(scenario.sameTypeButTooSmall.name),
        'A space below the capacity filter should be excluded.'
      ).toHaveCount(0);
      await expect(
        catalog.spaceHeading(scenario.largeSpaceOfAnotherType.name),
        'A space of another type should be excluded.'
      ).toHaveCount(0);
    });
  }
}

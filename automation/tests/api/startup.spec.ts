
import { test, expect } from '@playwright/test';

test('SpaceBook API is available', async ({ request }) => {
  const response = await request.get('/api/spaces');

  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.spaces).toBeInstanceOf(Array);
});

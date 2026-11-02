
import { test, expect } from '../../fixtures/guest-fixtures.js';

test('SpaceBook API and test-data setup are available', async ({ request, testDataManager }) => {
  await testDataManager.createAccount();
  const space = await testDataManager.createSpace();

  const response = await request.get('/api/spaces');

  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.spaces).toBeInstanceOf(Array);
  expect(body.spaces).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: space.id })
  ]));
});

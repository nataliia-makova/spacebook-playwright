import type { APIResponse } from '@playwright/test';

export async function expectApiStatus(
  response: APIResponse,
  status: number,
  action: string
): Promise<void> {
  if (response.status() !== status) {
    throw new Error(`${action} failed with status ${response.status()}: ${await response.text()}`);
  }
}

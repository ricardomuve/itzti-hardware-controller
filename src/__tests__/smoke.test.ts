import { describe, it, expect } from 'vitest';

describe('Project setup', () => {
  it('vitest is configured and running', () => {
    expect(true).toBe(true);
  });

  it('fast-check is available', async () => {
    const fc = await import('fast-check');
    expect(fc).toBeDefined();
  });
});

import { describe, it, expect } from 'vitest';

describe('Client smoke test', () => {
  it('should pass a trivial assertion', () => {
    expect(1 + 1).toBe(2);
  });
});

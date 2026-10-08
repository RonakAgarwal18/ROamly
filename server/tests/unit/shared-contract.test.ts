import { describe, it, expect } from 'vitest';
// Smoke test: proves the server toolchain (tsx / vitest) resolves @roamly/shared.
import { idParamSchema, paginationQuerySchema } from '@roamly/shared';

describe('@roamly/shared resolves in the server toolchain', () => {
  it('imports and uses a shared schema', () => {
    expect(idParamSchema.parse('7')).toBe(7);
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, perPage: 50 });
  });
});

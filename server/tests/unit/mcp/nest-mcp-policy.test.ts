/**
 * Unit tests for the ROamly access-group boot gate in
 * server/src/mcp/nest-mcp-policy.ts. Pure functions + a bare registry — no DB.
 *
 * The compile-time half of the group typing (McpAccessGroup === ScopeGroup)
 * is asserted in src by MCP_ACCESS_GROUPS_MATCH_SCOPE_GROUPS, which
 * `npm run typecheck` covers — tests are not typechecked, so the bad-group
 * case below has to cast its way past the union on purpose.
 */
import { describe, it, expect } from 'vitest';
import { createTestRegistry, McpController, Tool, type McpDeclarativeAccess } from '../../../src/nest-mcp';
import {
  MCP_ACCESS_GROUPS_MATCH_SCOPE_GROUPS,
  roamlyMcpAccessPolicy,
  roamlyMcpValidateAccess,
} from '../../../src/mcp/nest-mcp-policy';
import { ALL_SCOPES, type ScopeGroup } from '../../../src/mcp/scopes';

const listing = { kind: 'tool' as const, name: 'x', className: 'X', methodName: 'x' };

describe('roamlyMcpValidateAccess', () => {
  it('accepts every {group, mode} combination that resolves to a real scope', () => {
    const combos = ALL_SCOPES.filter((s) => s.endsWith(':read') || s.endsWith(':write')).map((s) => {
      const [group, mode] = s.split(':');
      return { group, mode } as McpDeclarativeAccess;
    });
    expect(combos.length).toBeGreaterThan(0);
    for (const access of combos) {
      expect(roamlyMcpValidateAccess(access, listing)).toBeNull();
    }
  });

  it('rejects an unknown group', () => {
    const access = { group: 'budgets', mode: 'write' } as unknown as McpDeclarativeAccess;
    expect(roamlyMcpValidateAccess(access, listing)).toBe("no 'budgets:write' scope in SCOPES");
  });

  it('rejects write mode on the read-only geo and weather groups', () => {
    expect(roamlyMcpValidateAccess({ group: 'geo', mode: 'write' }, listing)).toBe("no 'geo:write' scope in SCOPES");
    expect(roamlyMcpValidateAccess({ group: 'weather', mode: 'write' }, listing)).toBe(
      "no 'weather:write' scope in SCOPES",
    );
    expect(roamlyMcpValidateAccess({ group: 'geo', mode: 'read' }, listing)).toBeNull();
    expect(roamlyMcpValidateAccess({ group: 'weather', mode: 'read' }, listing)).toBeNull();
  });

  it('fails createTestRegistry construction for a bad group, naming the entry', () => {
    @McpController()
    class BadGroupMcp {
      @Tool({ name: 'bad_tool', access: { group: 'budgets' as ScopeGroup, mode: 'write' } })
      bad() {}
    }
    expect(() =>
      createTestRegistry([new BadGroupMcp()], {
        accessPolicy: roamlyMcpAccessPolicy,
        validateAccess: roamlyMcpValidateAccess,
      }),
    ).toThrow(
      /invalid access declarations: tool "bad_tool" \(BadGroupMcp\.bad\): no 'budgets:write' scope in SCOPES/,
    );
  });

  it('has a compile-checked group union (runtime touchpoint)', () => {
    expect(MCP_ACCESS_GROUPS_MATCH_SCOPE_GROUPS).toBe(true);
  });
});

describe('roamlyMcpAccessPolicy', () => {
  it('keeps the null-scopes (static token) full-access contract', () => {
    const ctx = { userId: 1, scopes: null, isStaticToken: true };
    expect(roamlyMcpAccessPolicy({ group: 'vacay', mode: 'write' }, ctx)).toBe(true);
    expect(roamlyMcpAccessPolicy({ group: 'trips', mode: 'read' }, ctx)).toBe(true);
  });

  it('resolves scoped sessions with the scopes.ts semantics', () => {
    const ctx = { userId: 1, scopes: ['budget:write'], isStaticToken: false };
    expect(roamlyMcpAccessPolicy({ group: 'budget', mode: 'write' }, ctx)).toBe(true);
    expect(roamlyMcpAccessPolicy({ group: 'budget', mode: 'read' }, ctx)).toBe(true);
    expect(roamlyMcpAccessPolicy({ group: 'trips', mode: 'read' }, ctx)).toBe(false);
  });
});

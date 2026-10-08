import { nowISO, requireRole } from '../src/util';
import { createMockContext } from './mockContext';
describe('Publication invariants', () => {
  test('timestamp follows the transaction, not the peer clock', () => {
    const ctx = createMockContext();
    expect(nowISO(ctx)).toBe('2026-05-11T10:00:00.123Z');
    expect(nowISO(ctx)).toBe(nowISO(ctx));
  });
  test('missing role attribute API is refused', () => {
    const ctx = createMockContext(); delete ctx.clientIdentity.getAttributeValue;
    expect(() => requireRole(ctx, ['admin'])).toThrow('role attributes');
  });
  test('missing and unauthorized roles are refused', () => {
    const ctx = createMockContext();
    ctx.clientIdentity.getAttributeValue = () => null;
    expect(() => requireRole(ctx, ['admin'])).toThrow('Missing client role');
    ctx.clientIdentity.getAttributeValue = () => 'patient';
    expect(() => requireRole(ctx, ['admin'])).toThrow('not allowed');
  });
});

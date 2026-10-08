import { Context } from 'fabric-contract-api';

export function nowISO(ctx: Context): string {
  const timestamp = ctx.stub.getTxTimestamp();
  const millis = Number(BigInt(String(timestamp.seconds)) * 1000n + BigInt(timestamp.nanos) / 1000000n);
  if (!Number.isSafeInteger(millis)) throw new Error('Invalid transaction timestamp');
  return new Date(millis).toISOString();
}

export function getClientId(ctx: Context): string {
  try {
    return ctx.clientIdentity.getID();
  } catch {
    return 'unknown-client';
  }
}

export function requireRole(ctx: Context, roles: readonly string[]): void {
  const identity = ctx.clientIdentity as unknown as { getAttributeValue?: (name: string) => string | null };
  if (typeof identity.getAttributeValue !== 'function') {
    throw new Error('Client identity does not expose role attributes');
  }

  const rawRoles = identity.getAttributeValue('roles') ?? identity.getAttributeValue('role');
  if (!rawRoles) {
    throw new Error(`Missing client role attribute; requires one of: ${roles.join(', ')}`);
  }

  const actual = rawRoles.split(',').map((role) => role.trim()).filter(Boolean);
  if (!actual.some((role) => roles.includes(role))) {
    throw new Error(`Client role ${rawRoles} is not allowed; requires one of: ${roles.join(', ')}`);
  }
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required and must be a non-empty string`);
  }
  return value.trim();
}

export function requireArray<T>(value: unknown, field: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} is required and must be an array`);
  }
  return value as T[];
}

export function parseJson<T>(payload: string, name: string): T {
  try {
    return JSON.parse(payload) as T;
  } catch (error) {
    throw new Error(`${name} must be a valid JSON string`);
  }
}

export function emitEvent(ctx: Context, eventName: string, payload: Record<string, unknown>): void {
  ctx.stub.setEvent(eventName, Buffer.from(JSON.stringify(payload)));
}

export async function getStateJson<T>(ctx: Context, key: string): Promise<T | null> {
  const bytes = await ctx.stub.getState(key);
  if (!bytes || bytes.length === 0) return null;
  return JSON.parse(bytes.toString()) as T;
}

export async function putStateJson(ctx: Context, key: string, value: unknown): Promise<void> {
  await ctx.stub.putState(key, Buffer.from(JSON.stringify(value)));
}

export async function queryAll<T>(ctx: Context, query: Record<string, unknown>): Promise<T[]> {
  const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
  const results: T[] = [];
  while (true) {
    const res = await iterator.next();
    if (res.value && res.value.value) {
      results.push(JSON.parse(res.value.value.toString()) as T);
    }
    if (res.done) {
      await iterator.close();
      return results;
    }
  }
}

export function validateStatus(value: string, allowed: readonly string[], field = 'status'): void {
  if (!allowed.includes(value)) {
    throw new Error(`${field} must be one of: ${allowed.join(', ')}`);
  }
}

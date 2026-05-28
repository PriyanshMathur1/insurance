import { describe, it, expect, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/auth';

describe('auth', () => {
  it('hashPassword should generate a hash', async () => {
    const hash = await hashPassword('password123');
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(hash).not.toBe('password123');
  });

  it('verifyPassword should return true for correct password', async () => {
    const password = 'my-secret-password';
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('verifyPassword should return false for incorrect password', async () => {
    const password = 'my-secret-password';
    const hash = await hashPassword(password);
    const isValid = await verifyPassword('wrong-password', hash);
    expect(isValid).toBe(false);
  });
});

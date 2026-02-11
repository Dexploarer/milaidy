import { describe, it, expect, vi, afterEach } from 'vitest';
import { isAuthorized } from './server';
import http from 'http';

describe('isAuthorized (Security)', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('denies access when token is NOT set and request is external', () => {
    delete process.env.MILAIDY_API_TOKEN;
    const req = {
      socket: { remoteAddress: '1.2.3.4' }, // External IP
      headers: {}
    } as unknown as http.IncomingMessage;

    // This should be false to be secure.
    expect(isAuthorized(req)).toBe(false);
  });

  it('allows access when token is NOT set and request is local (127.0.0.1)', () => {
    delete process.env.MILAIDY_API_TOKEN;
    const req = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: {}
    } as unknown as http.IncomingMessage;

    expect(isAuthorized(req)).toBe(true);
  });

  it('allows access when token is NOT set and request is local (::1)', () => {
    delete process.env.MILAIDY_API_TOKEN;
    const req = {
      socket: { remoteAddress: '::1' },
      headers: {}
    } as unknown as http.IncomingMessage;

    expect(isAuthorized(req)).toBe(true);
  });

  it('denies access when token IS set but not provided', () => {
    process.env.MILAIDY_API_TOKEN = 'secret';
    const req = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: {}
    } as unknown as http.IncomingMessage;

    expect(isAuthorized(req)).toBe(false);
  });

  it('allows access when token IS set and provided correctly', () => {
    process.env.MILAIDY_API_TOKEN = 'secret';
    const req = {
      socket: { remoteAddress: '1.2.3.4' },
      headers: { authorization: 'Bearer secret' }
    } as unknown as http.IncomingMessage;

    expect(isAuthorized(req)).toBe(true);
  });
});

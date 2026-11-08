import { describe, expect, it, vi } from 'vitest';
import { checkToken } from './cloudflare-token';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('checkToken', () => {
  it('reports an active user token with its expiry', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      json({ success: true, result: { status: 'active', expires_on: '2027-04-30T00:00:00Z' } }),
    );
    expect(await checkToken('tok', 'acc', fetch)).toEqual({ status: 'active', expiresOn: '2027-04-30T00:00:00Z' });
    expect(fetch.mock.calls[0]![0]).toBe('https://api.cloudflare.com/client/v4/user/tokens/verify');
    expect((fetch.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('falls back to the account endpoint for account-owned tokens', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ success: false }, 401))
      .mockResolvedValueOnce(json({ success: true, result: { status: 'active' } }));
    expect(await checkToken('tok', 'acc', fetch)).toEqual({ status: 'active' });
    expect(fetch.mock.calls[1]![0]).toBe('https://api.cloudflare.com/client/v4/accounts/acc/tokens/verify');
  });

  it('reports disabled or expired tokens', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ success: true, result: { status: 'expired' } }));
    expect(await checkToken('tok', '', fetch)).toEqual({ status: 'inactive', detail: 'expired' });
  });

  it('reports rejected tokens as invalid, and empty input without a request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ success: false }, 401));
    expect(await checkToken('bad', 'acc', fetch)).toEqual({ status: 'invalid' });
    const none = vi.fn<typeof globalThis.fetch>();
    expect(await checkToken('  ', 'acc', none)).toEqual({ status: 'invalid' });
    expect(none).not.toHaveBeenCalled();
  });

  it('reports network failures separately', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('offline'));
    expect(await checkToken('tok', 'acc', fetch)).toEqual({ status: 'unreachable' });
  });
});

/** Checks a Cloudflare API token as the user types it, like Refined GitHub does for GitHub tokens. */

export type TokenCheck =
  | { status: 'active'; expiresOn?: string }
  | { status: 'inactive'; detail: string }
  | { status: 'invalid' }
  | { status: 'unreachable' };

interface VerifyBody {
  success?: boolean;
  result?: { status?: string; expires_on?: string };
}

async function verifyAt(url: string, token: string, fetch: typeof globalThis.fetch): Promise<TokenCheck | null> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403 || response.status === 400) return null;
  const body = (await response.json().catch(() => null)) as VerifyBody | null;
  const status = body?.result?.status;
  if (!body?.success || !status) return null;
  if (status !== 'active') return { status: 'inactive', detail: status };
  return { status: 'active', ...(body.result?.expires_on && { expiresOn: body.result.expires_on }) };
}

export async function checkToken(
  token: string,
  accountId: string,
  fetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
): Promise<TokenCheck> {
  const t = token.trim();
  if (!t) return { status: 'invalid' };
  try {
    // User tokens verify at /user; account-owned tokens at /accounts/{id}.
    const asUser = await verifyAt('https://api.cloudflare.com/client/v4/user/tokens/verify', t, fetch);
    if (asUser) return asUser;
    if (accountId.trim()) {
      const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId.trim())}/tokens/verify`;
      const asAccount = await verifyAt(url, t, fetch);
      if (asAccount) return asAccount;
    }
    return { status: 'invalid' };
  } catch {
    return { status: 'unreachable' };
  }
}

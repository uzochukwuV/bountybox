// Bridge a Privy identity to a Supabase session.
//
// Supabase does not natively accept Privy tokens, so a trusted server step is
// required. Two serverless options are wired here, chosen by VITE_PRIVY_SESSION_URL:
//
//   1. Edge Function (preferred, cross-device): POST the Privy access token to
//      the function, which verifies it against Privy's JWKS and returns a
//      Supabase `{ access_token, refresh_token }` session.
//   2. Local HS256 mint (no Edge Function): sign a short-lived Supabase-compatible
//      JWT in the browser from VITE_SUPABASE_JWT_SECRET. This is only as private
//      as the bundle — for development, not production.
//
// If neither is configured the caller falls back to an anonymous Supabase
// session (see AuthContext), which must be enabled in Supabase Auth settings.

const SESSION_URL = import.meta.env.VITE_PRIVY_SESSION_URL || '';
const JWT_SECRET = import.meta.env.VITE_SUPABASE_JWT_SECRET || '';

export const hasServerBridge = !!SESSION_URL;
export const hasLocalMint = !SESSION_URL && !!JWT_SECRET;

/* ------------------------------------------------------------------ */
/* Local HS256 mint (development only)                                 */
/* ------------------------------------------------------------------ */

const encoder = new TextEncoder();

function base64url(bytes) {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlString(value) {
  return base64url(encoder.encode(value));
}

// RFC 4122 v5 (SHA-1, name-based). Supabase requires `sub` to be a UUID, so the
// stable business key (the Privy DID) is hashed into one: same DID -> same id.
const UUID_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // RFC 4122 DNS namespace

async function uuidv5(name) {
  const nsBytes = new Uint8Array(16);
  UUID_NS.replace(/-/g, '').match(/.{2}/g).forEach((hex, i) => {
    nsBytes[i] = parseInt(hex, 16);
  });
  const nameBytes = encoder.encode(name);
  const input = new Uint8Array(nsBytes.length + nameBytes.length);
  input.set(nsBytes, 0);
  input.set(nameBytes, nsBytes.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', input)).slice(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50; // version 5
  digest[8] = (digest[8] & 0x3f) | 0x80; // RFC variant
  const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function hmacSha256(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

async function mintLocalSession(identity) {
  const now = Math.floor(Date.now() / 1000);
  const sub = await uuidv5(identity.did || identity.walletAddress);
  const header = base64urlString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64urlString(
    JSON.stringify({
      aud: 'authenticated',
      role: 'authenticated',
      sub,
      iat: now,
      exp: now + 60 * 60,
      email: identity.email || undefined,
      privy_did: identity.did,
      wallet: (identity.walletAddress || '').toLowerCase(),
    })
  );
  const signature = base64url(await hmacSha256(JWT_SECRET, `${header}.${payload}`));
  return { access_token: `${header}.${payload}.${signature}`, refresh_token: '' };
}

/* ------------------------------------------------------------------ */
/* Server bridge                                                       */
/* ------------------------------------------------------------------ */

async function fetchServerSession(identity) {
  const response = await fetch(SESSION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: identity.accessToken }),
  });
  if (!response.ok) throw new Error(`Session bridge failed (${response.status})`);
  const session = await response.json();
  if (!session?.access_token) throw new Error('Session bridge returned no access_token');
  return session;
}

/** Returns a Supabase session for `identity`, or null when no bridge is set up. */
export async function bridgeSession(identity) {
  if (!identity) return null;
  if (hasServerBridge) return fetchServerSession(identity);
  if (hasLocalMint) return mintLocalSession(identity);
  return null;
}

/** The Supabase user id the bridge will use, for debugging/UI. */
export async function derivedUserId(identity) {
  return uuidv5(identity?.did || identity?.walletAddress || '');
}

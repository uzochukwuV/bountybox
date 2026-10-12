// Privy -> Supabase session bridge.
//
// Verifies a Privy access token against Privy's JWKS, then returns a Supabase
// session for a user id derived deterministically from the Privy DID
// (uuid v5). Identity authority stays with Privy; Supabase just mints a session
// whose `sub` is that derived id, so the existing RLS policies apply unchanged.
//
// Deploy:
//   supabase functions deploy privy-session --project-ref <ref> --no-verify-jwt
//   supabase secrets set PRIVY_APP_ID=<app id>
//   supabase secrets set BRIDGE_JWT_SECRET=<project JWT secret>
//   # (SUPABASE_JWT_SECRET cannot be set: the CLI reserves the SUPABASE_ prefix.)
//
// Request:  POST { accessToken: "<privy access token>" }
// Response: { access_token, refresh_token }

const PRIVY_APP_ID = Deno.env.get('PRIVY_APP_ID') ?? '';
const PRIVY_JWKS_URL = 'https://auth.privy.io/api/v1/apps/' + PRIVY_APP_ID + '/jwks.json';
const JWT_SECRET = Deno.env.get('BRIDGE_JWT_SECRET') ?? Deno.env.get('SUPABASE_JWT_SECRET') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/* ---- base64url helpers ---- */
const enc = new TextEncoder();
const b64uBytes = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64uStr = (value) => b64uBytes(enc.encode(value));
const fromB64u = (value) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

/* ---- uuid v5 (SHA-1, DNS namespace) — must match the client helper ---- */
async function uuidv5(name) {
  const ns = Uint8Array.from(
    '6ba7b8109dad11d180b400c04fd430c8'.match(/.{2}/g).map((h) => parseInt(h, 16))
  );
  const nameBytes = enc.encode(name);
  const input = new Uint8Array(ns.length + nameBytes.length);
  input.set(ns, 0);
  input.set(nameBytes, ns.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', input)).slice(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/* ---- verify the Privy token against its JWKS ---- */
let jwksCache = { at: 0, keys: [] };
async function privyKeys() {
  if (Date.now() - jwksCache.at < 60 * 60 * 1000 && jwksCache.keys.length) return jwksCache.keys;
  const res = await fetch(PRIVY_JWKS_URL);
  if (!res.ok) throw new Error('Cannot fetch Privy JWKS (' + res.status + ')');
  const { keys } = await res.json();
  jwksCache = { at: Date.now(), keys: keys || [] };
  return jwksCache.keys;
}

async function verifyPrivyToken(token) {
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !signatureB64) throw new Error('Malformed token');
  const header = JSON.parse(new TextDecoder().decode(fromB64u(headerB64)));
  const payload = JSON.parse(new TextDecoder().decode(fromB64u(payloadB64)));

  const key = (await privyKeys()).find((k) => k.kid === header.kid) || (await privyKeys())[0];
  if (!key) throw new Error('No matching JWKS key');

  // Privy signs with ES256 (P-256 ECDSA). JWS ECDSA signatures are raw r||s,
  // which is exactly the format WebCrypto's verify() expects.
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    key,
    { name: 'ECDSA', namedCurve: key.crv || 'P-256' },
    false,
    ['verify']
  );
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    fromB64u(signatureB64),
    enc.encode(`${headerB64}.${payloadB64}`)
  );
  if (!ok) throw new Error('Invalid token signature');
  if (payload.aud && payload.aud !== PRIVY_APP_ID) throw new Error('Token audience mismatch');
  if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error('Token expired');
  return payload;
}

/* ---- mint a Supabase session ---- */
async function signJwt(payload) {
  const header = b64uStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64uStr(JSON.stringify(payload));
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(`${header}.${body}`))
  );
  return `${header}.${body}.${b64uBytes(sig)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { accessToken } = await req.json().catch(() => ({}));
    if (!accessToken) return json({ error: 'accessToken is required' }, 400);

    const claims = await verifyPrivyToken(accessToken);
    const did = claims.sub;
    const sub = await uuidv5(did);
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600;

    const access_token = await signJwt({
      aud: 'authenticated',
      role: 'authenticated',
      sub,
      iat: now,
      exp: now + expiresIn,
      privy_did: did,
    });

    // Refresh token: a long-lived JWT of the same shape. The client refreshes by
    // re-POSTing its (Privy-refreshed) access token, so this only needs to keep
    // gotrue's auto-refresh quiet between Privy token rotations.
    const refresh_token = await signJwt({
      aud: 'authenticated',
      role: 'authenticated',
      sub,
      iat: now,
      exp: now + 30 * 24 * 3600,
      privy_did: did,
    });

    return json({ access_token, refresh_token, expires_in: expiresIn, token_type: 'bearer' });
  } catch (error) {
    return json({ error: error?.message ?? 'Session bridge failed' }, 401);
  }
});

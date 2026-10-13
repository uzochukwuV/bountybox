// Configuration resolution for the app.
//
// At build time Vite replaces `import.meta.env.VITE_*` with literal values.
// In a container the image is built without secrets, so those values are empty
// and the real ones arrive at runtime: entrypoint.sh injects them into
// index.html as window.__ENV__, which this helper reads.
//
// Do not destructure `import.meta.env` (it breaks Vite's static replacement).

const runtime = (typeof window !== 'undefined' && window.__ENV__) || {};

const read = (key) => {
  const built = import.meta.env[key];
  if (built !== undefined && built !== null && built !== '') return built;
  return runtime[key] || '';
};

export const env = {
  SUPABASE_URL: read('VITE_SUPABASE_URL'),
  SUPABASE_ANON_KEY: read('VITE_SUPABASE_ANON_KEY'),
  SUPABASE_BUCKET: read('VITE_SUPABASE_BUCKET') || 'box',
  PRIVY_APP_ID: read('VITE_PRIVY_APP_ID'),
  PRIVY_SESSION_URL: read('VITE_PRIVY_SESSION_URL'),
  BOUNTYBOARD_ADDRESS: read('VITE_BOUNTYBOARD_ADDRESS'),
  // Dev-only in-browser mint; never injected at runtime (must not ship in prod).
  SUPABASE_JWT_SECRET: import.meta.env.VITE_SUPABASE_JWT_SECRET || '',
  // Vite sets this statically; privySupabase.js uses it to disable the dev mint.
  PROD: import.meta.env.PROD,
};

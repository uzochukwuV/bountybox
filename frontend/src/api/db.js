// Supabase-backed data layer.
//
// Mirrors the small slice of the old entity SDK the UI used, so pages keep the
// same call shapes: `db.entities.<Table>.filter(query, { sort, limit })`,
// `.count`, `.aggregate`, `.bulkUpdate`, plus `db.auth.*` and `db.app.*`.
// Content lives here; the escrow contract only ever sees addresses and hashes.

import { supabase, STORAGE_BUCKET } from '@/api/supabaseClient';

const TABLES = {
  Bounty: 'bounties',
  BountyWorker: 'bounty_workers',
  BountyComment: 'bounty_comments',
  Submission: 'submissions',
  BountyEvent: 'bounty_events',
  User: 'profiles',
};

const tableName = (key) => TABLES[key] || key;

// ---------------------------------------------------------------------------
// Query translation: MongoDB-ish filters -> PostgREST.
// ---------------------------------------------------------------------------
function quote(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function applyFilter(builder, column, condition) {
  if (condition === null) return builder.is(column, null);
  if (Array.isArray(condition)) return builder.in(column, condition);
  if (typeof condition === 'object') {
    if ('$in' in condition) return builder.in(column, condition.$in);
    if ('$ne' in condition) return builder.neq(column, condition.$ne);
    if ('$gt' in condition) return builder.gt(column, condition.$gt);
    if ('$gte' in condition) return builder.gte(column, condition.$gte);
    if ('$lt' in condition) return builder.lt(column, condition.$lt);
    if ('$lte' in condition) return builder.lte(column, condition.$lte);
    if ('$regex' in condition) {
      const flags = condition.$options || '';
      const operator = flags.includes('i') ? 'ilike' : 'like';
      return builder[operator](column, `%${condition.$regex}%`);
    }
    return builder.eq(column, condition);
  }
  return builder.eq(column, condition);
}

function applyQuery(builder, query = {}) {
  let next = builder;
  for (const [column, condition] of Object.entries(query)) {
    next = applyFilter(next, column, condition);
  }
  return next;
}

function applySort(builder, sort) {
  if (!sort) return builder;
  const descending = sort.startsWith('-');
  const column = descending ? sort.slice(1) : sort;
  return builder.order(column, { ascending: !descending });
}

function fail(error) {
  if (error) throw new Error(error.message || 'Supabase request failed');
}

// ---------------------------------------------------------------------------
// Entity surface
// ---------------------------------------------------------------------------
function makeEntity(key) {
  const table = tableName(key);
  return {
    async filter(query = {}, { sort, limit } = {}) {
      let builder = applyQuery(supabase.from(table).select('*'), query);
      builder = applySort(builder, sort);
      if (limit) builder = builder.limit(limit);
      const { data, error } = await builder;
      fail(error);
      return { items: data || [] };
    },

    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
      fail(error);
      if (!data) throw new Error(`${key} not found`);
      return data;
    },

    async create(values) {
      const { data, error } = await supabase.from(table).insert(values).select().single();
      fail(error);
      return data;
    },

    async bulkCreate(rows) {
      const { data, error } = await supabase.from(table).insert(rows).select();
      fail(error);
      return data || [];
    },

    async update(id, patch) {
      const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single();
      fail(error);
      return data;
    },

    async bulkUpdate(rows) {
      const results = [];
      for (const { id, ...patch } of rows) {
        const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single();
        fail(error);
        results.push(data);
      }
      return results;
    },

    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      fail(error);
      return { id };
    },

    async count(query = {}) {
      let builder = applyQuery(
        supabase.from(table).select('*', { count: 'exact', head: true }),
        query
      );
      const { count, error } = await builder;
      fail(error);
      return count || 0;
    },

    async aggregate({ query = {}, sum = [], count: countColumn } = {}) {
      let builder = applyQuery(supabase.from(table).select('*'), query);
      const { data, error } = await builder;
      fail(error);
      const items = data || [];
      const row = {};
      for (const column of sum) {
        row[`sum_${column}`] = items.reduce((total, item) => total + (Number(item[column]) || 0), 0);
      }
      if (countColumn) row[`count_${countColumn}`] = items.length;
      return { rows: [row] };
    },
  };
}

const entities = new Proxy({}, { get: (_target, key) => makeEntity(key) });

// ---------------------------------------------------------------------------
// Auth surface
// ---------------------------------------------------------------------------
async function profileFor(user) {
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: data?.email || user.email,
    full_name: data?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0],
    privy_did: data?.privy_did || null,
    wallet_address: data?.wallet_address || null,
    role: data?.role || 'user',
    created_date: data?.created_date || user.created_at,
  };
}

const auth = {
  async me() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      const err = new Error(error?.message || 'Not authenticated');
      err.status = 401;
      throw err;
    }
    return profileFor(data.user);
  },

  async isAuthenticated() {
    const { data } = await supabase.auth.getSession();
    return !!data?.session;
  },

  // Mirror the Privy identity onto the current profile row. Upsert (not update)
  // so bridged identities, which have no auth.users-triggered row, still get one.
  async ensureProfile(identity) {
    const { data: current } = await supabase.auth.getUser();
    const id = current?.user?.id;
    if (!id) return null;
    const { data, error } = await supabase
      .from('profiles')
      .upsert(
        {
          id,
          privy_did: identity.did || null,
          wallet_address: (identity.wallet_address || '').toLowerCase() || null,
          email: identity.email || null,
          full_name: identity.full_name || null,
        },
        { onConflict: 'id' }
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  // The session is established by the Privy -> Supabase bridge (see
  // lib/privySupabase.js), not by email/password. These helpers remain for the
  // bridge and for sign-out only.
  async setSession(session) {
    const { data, error } = await supabase.auth.setSession(session);
    if (error) throw new Error(error.message);
    return data;
  },

  async logout() {
    await supabase.auth.signOut();
  },
};

// ---------------------------------------------------------------------------
// App surface (settings the UI only uses to gate the loading spinner).
// ---------------------------------------------------------------------------
const app = {
  async getPublicSettings() {
    return { id: 'bountybox', public_settings: {} };
  },
};

// ---------------------------------------------------------------------------
// Integrations: private file upload + signed URLs (Supabase Storage).
// ---------------------------------------------------------------------------
function safeFileName(name) {
  return (name || 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
}

const integrations = {
  Core: {
    async UploadPrivateFile({ file }) {
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
      const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
        upsert: false,
      });
      if (error) throw new Error(error.message);
      return { file_uri: path };
    },

    async CreateFileSignedUrl({ file_uri }) {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(file_uri, 60 * 60);
      if (error) throw new Error(error.message);
      return { signed_url: data.signedUrl };
    },
  },
};

export const db = { auth, app, entities, integrations };
export default db;

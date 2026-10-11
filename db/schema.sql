-- BountyBoard offchain database schema (PostgreSQL).
--
-- The chain (contracts/BountyBoard.sol) is the source of truth for money and
-- permissions. This database is the source of truth for content: titles,
-- descriptions, files, submissions, comments, tags, profiles, and moderation.
-- Rows link to the chain via bounty_id / content_hash / submission_ref.
--
-- An indexer watches the contract events and reconciles the cached lifecycle
-- columns (status, worker_count, winner_count, reward_per_winner, max_winners,
-- deadlines, timestamps).

CREATE TYPE bounty_status AS ENUM (
  'open', 'completed', 'cancelled', 'expired'
);

CREATE TYPE submission_status AS ENUM ('pending', 'accepted', 'rejected');

-- ---------------------------------------------------------------------------
-- Identity (content, not authority). Wallet address is the bridge to onchain.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id           BIGSERIAL PRIMARY KEY,
  wallet       TEXT NOT NULL UNIQUE,           -- lowercase 0x address
  handle       TEXT UNIQUE,
  display_name TEXT,
  bio          TEXT,
  avatar_url   TEXT,
  ui_prefs     JSONB NOT NULL DEFAULT '{}',    -- theme, notifications, filters
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aliases for readability; wallet is the authoritative identity.
CREATE VIEW wallet_profiles AS
  SELECT wallet, handle, display_name, avatar_url FROM users;

-- ---------------------------------------------------------------------------
-- Tasks == onchain bounties. Content here; money facts are mirrored, not owned.
-- ---------------------------------------------------------------------------
CREATE TABLE tasks (
  id                   BIGSERIAL PRIMARY KEY,
  bounty_id            BIGINT UNIQUE,          -- onchain id; NULL until indexed
  content_hash         BYTEA,                  -- matches Bounty.contentHash
  creator_wallet       TEXT NOT NULL REFERENCES users(wallet),
  title                TEXT NOT NULL,
  description          TEXT,
  category             TEXT,
  instructions         TEXT,
  -- Mirrored from chain by the indexer (display + filtering only):
  reward_per_winner    NUMERIC(78, 0),         -- USDC base units (6 decimals)
  max_winners          INT,
  application_deadline TIMESTAMPTZ,
  submission_deadline  TIMESTAMPTZ,
  status               bounty_status,
  worker_count         INT NOT NULL DEFAULT 0, -- distinct workers who started
  winner_count         INT NOT NULL DEFAULT 0, -- winners paid so far
  chain_tx_hash        TEXT,                   -- creation tx
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tasks_status_idx ON tasks (status);
CREATE INDEX tasks_category_idx ON tasks (category);
CREATE INDEX tasks_creator_idx ON tasks (creator_wallet);

-- The onchain "working on it" set. One row per (task, worker). Populated from
-- WorkStarted events so the UI can show "N working" without replaying logs.
CREATE TABLE bounty_workers (
  task_id       BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  worker_wallet TEXT NOT NULL REFERENCES users(wallet),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, worker_wallet)
);

CREATE INDEX bounty_workers_task_idx ON bounty_workers (task_id);

-- Large/binary content lives in object storage; we keep references + metadata.
CREATE TABLE task_attachments (
  id            BIGSERIAL PRIMARY KEY,
  task_id       BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,                 -- image | file | link
  url           TEXT NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT,
  position      INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Full work submissions. One per worker attempt. When the creator accepts a
-- worker onchain (BountyWinnerPaid), the matching row is marked 'accepted' and
-- its submission_ref records the anchored hash.
CREATE TABLE submissions (
  id             BIGSERIAL PRIMARY KEY,
  task_id        BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  worker_wallet  TEXT NOT NULL REFERENCES users(wallet),
  submission_ref BYTEA UNIQUE,                 -- optional onchain anchor
  body           TEXT,                         -- full write-up
  status         submission_status NOT NULL DEFAULT 'pending',
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, worker_wallet)
);

CREATE INDEX submissions_task_idx ON submissions (task_id);
CREATE INDEX submissions_status_idx ON submissions (status);

CREATE TABLE submission_attachments (
  id            BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,                 -- image | file | link
  url           TEXT NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT
);

CREATE TABLE comments (
  id             BIGSERIAL PRIMARY KEY,
  task_id        BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  submission_id  BIGINT REFERENCES submissions(id) ON DELETE CASCADE,
  author_wallet  TEXT NOT NULL REFERENCES users(wallet),
  body           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comments_task_idx ON comments (task_id);

-- ---------------------------------------------------------------------------
-- Search / discovery
-- ---------------------------------------------------------------------------
CREATE TABLE tags (
  id    BIGSERIAL PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE
);

CREATE TABLE task_tags (
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  BIGINT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (task_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Moderation & notifications (private operational data)
-- ---------------------------------------------------------------------------
CREATE TABLE moderation_records (
  id             BIGSERIAL PRIMARY KEY,
  task_id        BIGINT REFERENCES tasks(id) ON DELETE CASCADE,
  comment_id     BIGINT REFERENCES comments(id) ON DELETE CASCADE,
  moderator      TEXT NOT NULL,
  action         TEXT NOT NULL,                -- hide|remove|warn|ban|approve
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id             BIGSERIAL PRIMARY KEY,
  user_wallet    TEXT NOT NULL REFERENCES users(wallet),
  task_id        BIGINT REFERENCES tasks(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,                -- started|accepted|completed|cancelled|expired
  payload        JSONB NOT NULL DEFAULT '{}',
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_idx ON notifications (user_wallet, read_at);

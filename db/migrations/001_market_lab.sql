CREATE TABLE IF NOT EXISTS atlas_schema_migrations (
  name text PRIMARY KEY,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE market_lab_revisions (
  revision text PRIMARY KEY CHECK (revision ~ '^[a-f0-9]{64}$'),
  canonical_body text NOT NULL,
  model_version text NOT NULL,
  generated_at timestamptz NOT NULL,
  first_published_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE market_lab_sources (
  revision text NOT NULL REFERENCES market_lab_revisions(revision),
  source_id text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  released_at timestamptz,
  metadata jsonb NOT NULL,
  PRIMARY KEY (revision, source_id)
);

-- Each revision preserves its original provider definitions and observations.
-- observation_date is a period/session label, never an invented release instant.
CREATE TABLE market_lab_observations (
  revision text NOT NULL,
  series_key text NOT NULL,
  source_id text NOT NULL,
  observation_date date NOT NULL,
  value double precision NOT NULL CHECK (value NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)),
  PRIMARY KEY (revision, series_key, observation_date),
  FOREIGN KEY (revision, source_id) REFERENCES market_lab_sources(revision, source_id)
);

CREATE TABLE market_lab_publications (
  channel text PRIMARY KEY CHECK (channel = 'market-lab'),
  revision text NOT NULL REFERENCES market_lab_revisions(revision),
  published_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

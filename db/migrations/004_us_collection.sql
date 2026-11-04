CREATE TABLE market_lab_collection_runs (
  id uuid PRIMARY KEY,
  run_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running','published','unchanged','failed','interrupted')),
  revision text REFERENCES market_lab_revisions(revision),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  CHECK ((status='running')=(finished_at IS NULL))
);
CREATE TABLE market_lab_source_payloads (
  sha256 text PRIMARY KEY CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  url text NOT NULL,
  acquired_at timestamptz NOT NULL,
  body text NOT NULL CHECK (octet_length(body)<=1048576)
);

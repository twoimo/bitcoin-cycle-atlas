CREATE TABLE theme_revisions (
  revision text PRIMARY KEY CHECK (revision ~ '^[a-f0-9]{64}$'),
  canonical_body text NOT NULL,
  generated_at timestamptz NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE theme_publications (
  channel text PRIMARY KEY CHECK(channel='themes'),
  revision text NOT NULL REFERENCES theme_revisions(revision)
);
CREATE TABLE theme_judgments (
  request_id uuid PRIMARY KEY,
  revision text NOT NULL REFERENCES theme_revisions(revision),
  input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  record_hash text NOT NULL CHECK(record_hash ~ '^[a-f0-9]{64}$'),
  canonical_body text NOT NULL,
  recorded_at timestamptz NOT NULL
);
CREATE INDEX theme_judgments_revision ON theme_judgments(revision,recorded_at);

CREATE TABLE housing_revisions (
  revision text PRIMARY KEY CHECK (revision ~ '^[a-f0-9]{64}$'),
  canonical_body text NOT NULL,
  generated_at timestamptz NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE housing_publications (
  channel text PRIMARY KEY CHECK (channel='housing'),
  revision text NOT NULL REFERENCES housing_revisions(revision),
  published_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

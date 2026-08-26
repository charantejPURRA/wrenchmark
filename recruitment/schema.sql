-- Wrenchmark mechanic recruitment
-- Pipeline: APPLIED -> SCREENED -> INTERVIEWED -> BACKGROUND -> REGISTERED -> ACTIVE
-- REGISTERED costs the mechanic nothing. ACTIVE requires verified insurance.

CREATE TABLE IF NOT EXISTS recruits (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  ref                    TEXT    UNIQUE NOT NULL,
  created_at             TEXT    NOT NULL,
  updated_at             TEXT    NOT NULL,

  -- identity
  full_name              TEXT    NOT NULL,
  phone                  TEXT    NOT NULL,
  email                  TEXT    NOT NULL,
  home_zip               TEXT    NOT NULL,
  zip_cluster            TEXT,

  -- operator profile
  operator_type          TEXT,              -- solo_mobile | shop_tech | grad | other
  years_experience       INTEGER DEFAULT 0,
  ase_certified          INTEGER DEFAULT 0,
  ase_detail             TEXT,
  service_radius_mi      INTEGER DEFAULT 15,

  -- capability
  vehicle                TEXT,
  has_scan_tool          INTEGER DEFAULT 0,
  tool_notes             TEXT,
  services               TEXT,              -- JSON array
  availability           TEXT,              -- JSON array
  hours_per_week         INTEGER DEFAULT 0,

  -- insurance (the activation gate)
  ins_cgl                INTEGER DEFAULT 0,
  ins_garagekeepers      INTEGER DEFAULT 0,
  ins_commercial_auto    INTEGER DEFAULT 0,
  ins_additional_insured INTEGER DEFAULT 0,
  ins_carrier            TEXT,
  ins_policy_ref         TEXT,
  ins_expires_on         TEXT,              -- YYYY-MM-DD
  ins_verified_at        TEXT,              -- set only when COI confirmed with broker
  ins_verified_by        TEXT,

  -- pipeline
  status                 TEXT    NOT NULL DEFAULT 'APPLIED',
  bg_check_status        TEXT    DEFAULT 'NOT_STARTED',
  interview_at           TEXT,
  reject_reason          TEXT,
  notes                  TEXT,

  -- attribution
  source                 TEXT    DEFAULT 'direct',
  source_detail          TEXT
);

CREATE TABLE IF NOT EXISTS recruit_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  recruit_id  INTEGER NOT NULL REFERENCES recruits(id) ON DELETE CASCADE,
  at          TEXT    NOT NULL,
  actor       TEXT    NOT NULL,
  kind        TEXT    NOT NULL,             -- status | note | insurance | bgcheck
  detail      TEXT
);

CREATE INDEX IF NOT EXISTS idx_recruits_status  ON recruits(status);
CREATE INDEX IF NOT EXISTS idx_recruits_cluster ON recruits(zip_cluster);
CREATE INDEX IF NOT EXISTS idx_events_recruit   ON recruit_events(recruit_id);

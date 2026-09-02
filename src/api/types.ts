/*
 * Response shapes of the Fleet control-plane API.
 *
 * Every field name here is copied from the Go JSON tag that produces it
 * (`fleet/api/*.go` in the server repo), which is why they are all snake_case.
 */

/** Traffic light from `fleet/health`. */
export type Health = "green" | "yellow" | "red" | "unknown" | "revoked";

export interface FleetStatus {
  activated: boolean;
}

/** `adminOut` in admin_admins.go. */
export interface Admin {
  id: number;
  email: string;
  role: string;
  created_at: string;
}

/** `agentOut` in admin_agents.go. */
export interface AgentOut {
  id: string;
  name: string;
  hostname: string;
  os: string;
  arch: string;
  version: string;
  scope: string;
  group_id: number;
  enrolled_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  health: Health;
}

/** `store.Report`; its JSON tags are the report table's column names. */
export interface Report {
  id: number;
  agent_id: string;
  task_id: string;
  kind: string;
  source: string;
  started_at: string;
  finished_at: string;
  status: string;
  bytes: number;
  files: number;
  snapshot_id: string;
  stderr: string;
}

/** GET /agents/{id}: agentOut flattened alongside the last 20 reports. */
export interface AgentDetail extends AgentOut {
  reports: Report[] | null;
}

/** `groupOut` in admin_groups.go. */
export interface Group {
  id: number;
  name: string;
  target_id: number;
  template_id: number;
}

/**
 * `templateOut` in admin_templates.go. `policy` is a raw Kopia policy object;
 * the server validates it, the UI edits it as JSON.
 */
export interface Template {
  id: number;
  name: string;
  sources: string[];
  policy: unknown;
}

export interface TemplateInput {
  name: string;
  sources: string[];
  policy: unknown;
}

/** `targetOut` in admin_targets.go. Credentials are never returned. */
export interface Target {
  id: number;
  name: string;
  kind: "b2" | "filesystem";
  bucket?: string;
  region?: string;
  path?: string;
  object_lock_verified_at?: string | null;
}

export interface TargetInput {
  name: string;
  kind: "b2" | "filesystem";
  bucket?: string;
  region?: string;
  path?: string;
  key_id?: string;
  key?: string;
}

/** One row of GET /groups/{id}/tokens. The token itself is never re-shown. */
export interface TokenOut {
  id: number;
  expires_at: string;
  max_uses: number;
  uses: number;
  revoked_at: string | null;
}

/** POST /tokens - the only time the plaintext token exists. */
export interface CreatedToken {
  id: number;
  token: string;
  expires_at: string;
  max_uses: number;
}

export interface Created {
  id: number;
}

export interface CreatedTarget extends Created {
  object_lock_verified: boolean;
}

export interface Activated {
  admin_id: number;
}

/** One hour of the overview's 24 h timeline. */
export interface OverviewBucket {
  hour: string;
  ok: number;
  failed: number;
}

export interface OverviewDevice {
  id: string;
  name: string;
  group: string;
  health: Health;
  /** Server-computed relative time since the last good snapshot, e.g. "2 h ago". */
  last: string;
  size_bytes: number;
  /** 30 days, oldest first. */
  days: ("good" | "warn" | "bad" | "none")[];
}

export interface Overview {
  fleet_name: string;
  counts: {
    agents: number;
    green: number;
    yellow: number;
    red: number;
    unknown: number;
    targets: number;
  };
  stored_bytes: number;
  dedup_ratio: number | null;
  last24h: {
    completed: number;
    failed: number;
    buckets: OverviewBucket[];
  };
  latest_failure: {
    agent_id: string;
    name: string;
    finished_at: string;
    stderr: string;
  } | null;
  devices: OverviewDevice[];
}

/**
 * The two settings the server exposes (`fleet/api/admin_settings.go`). The
 * settings table holds more - seal_salt among them - which the endpoint
 * deliberately neither reads back nor accepts.
 */
export interface Settings {
  fleet_name: string;
  /** Agent check-in interval in seconds; the server clamps it to 15..3600. */
  poll_interval: number;
}

/**
 * The parts of Kopia's `policy.Policy` the template form edits, by their Go
 * JSON tags (`snapshot/policy`). Everything else a policy can carry rides
 * along in the index signature, so editing a template through the form never
 * drops a section the JSON editor (or a future Kopia) put there.
 */
export interface KopiaPolicy {
  files?: { ignore?: string[]; [key: string]: unknown };
  scheduling?: {
    intervalSeconds?: number;
    timeOfDay?: { hour: number; min: number }[];
    manual?: boolean;
    [key: string]: unknown;
  };
  retention?: {
    keepLatest?: number;
    keepDaily?: number;
    keepWeekly?: number;
    keepMonthly?: number;
    [key: string]: unknown;
  };
  compression?: { compressorName?: string; [key: string]: unknown };
  [key: string]: unknown;
}

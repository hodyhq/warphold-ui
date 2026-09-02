/*
 * The simple template form and Kopia's policy object, in both directions.
 *
 * The server stores a template's policy as a raw Kopia `policy.Policy`
 * (fleet/api/admin_templates.go validates it by unmarshalling into one), and
 * the Advanced drawer edits that JSON directly. The five form controls cover
 * the parts a family fleet actually sets; everything else a policy carries -
 * including sections this UI has never heard of - is passed through untouched,
 * so switching between the form and the JSON can never drop a setting.
 */
import type { KopiaPolicy } from "../../api/types";

/** Scheduling shapes the form can express. `custom` is read-only. */
export type ScheduleKind = "hourly" | "daily" | "manual" | "custom";

export type Compression = "zstd" | "none" | "auto";

export interface PolicyForm {
  schedule: ScheduleKind;
  /** "HH:MM" - only meaningful when schedule is `daily`. */
  time: string;
  /** One glob per line. */
  exclude: string;
  /** Kept as text: an empty field means "not set", which is not the same as 0. */
  keepLatest: string;
  keepDaily: string;
  keepWeekly: string;
  keepMonthly: string;
  compression: Compression;
}

const HOURLY_SECONDS = 3600;
const DEFAULT_TIME = "03:00";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function num(v: number | undefined): string {
  return typeof v === "number" ? String(v) : "";
}

/**
 * A policy section as read back from the Advanced drawer. `policyFromJSON`
 * only checks that the top level is an object, so every section below it can
 * be any JSON value; anything that is not a plain object reads as an empty
 * section rather than throwing during Templates' render.
 */
function section<T>(v: unknown): Partial<T> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Partial<T>) : {};
}

function isTimeOfDay(t: unknown): t is { hour: number; min: number } {
  const v = t as { hour?: unknown; min?: unknown } | null;
  return typeof v === "object" && v !== null && typeof v.hour === "number" && typeof v.min === "number";
}

/** The form's view of a policy. */
export function formFromPolicy(p: KopiaPolicy): PolicyForm {
  const s = section<NonNullable<KopiaPolicy["scheduling"]>>(p.scheduling);
  const raw: unknown = s.timeOfDay;
  const times = (Array.isArray(raw) ? raw : []).filter(isTimeOfDay);
  // A timeOfDay the form cannot read - not an array, or an entry without a
  // numeric hour/min - is hand-edited JSON it must not rewrite either.
  const unreadable = raw !== undefined && (!Array.isArray(raw) || times.length !== raw.length);
  let schedule: ScheduleKind = "manual";
  let time = DEFAULT_TIME;
  if (unreadable) {
    schedule = "custom";
  } else if (s.intervalSeconds === HOURLY_SECONDS && times.length === 0) {
    schedule = "hourly";
  } else if (times.length === 1 && !s.intervalSeconds) {
    schedule = "daily";
    time = `${pad(times[0].hour)}:${pad(times[0].min)}`;
  } else if (s.intervalSeconds || times.length > 0 || (s.cron as string[] | undefined)?.length) {
    // A schedule this form cannot express (a custom interval, several times a
    // day, a cron line): shown as such rather than rounded to something the
    // form can draw, which saving would then write back as the real schedule.
    schedule = "custom";
  }
  const r = section<NonNullable<KopiaPolicy["retention"]>>(p.retention);
  const ignore: unknown = section<NonNullable<KopiaPolicy["files"]>>(p.files).ignore;
  const compressor = section<NonNullable<KopiaPolicy["compression"]>>(p.compression).compressorName;
  return {
    schedule,
    time,
    exclude: (Array.isArray(ignore) ? ignore.filter((g) => typeof g === "string") : []).join("\n"),
    keepLatest: num(r.keepLatest),
    keepDaily: num(r.keepDaily),
    keepWeekly: num(r.keepWeekly),
    keepMonthly: num(r.keepMonthly),
    compression: compressor === "zstd" ? "zstd" : compressor === "none" ? "none" : "auto",
  };
}

/** Lines of a textarea, trimmed, with the blanks dropped. */
export function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

/** Drops a section that ended up empty, so the JSON stays as small as it reads. */
function prune<T extends object>(obj: T): T | undefined {
  return Object.keys(obj).length === 0 ? undefined : obj;
}

function withKey<T extends object>(obj: T, key: keyof T, value: unknown): T {
  const next = { ...obj };
  if (value === undefined) {
    delete next[key];
  } else {
    next[key] = value as T[keyof T];
  }
  return next;
}

function intOrUndefined(text: string): number | undefined {
  const t = text.trim();
  if (t === "") {
    return undefined;
  }
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * `policy` with the form's five settings applied. Sections the form does not
 * own (errorHandling, upload, actions, ...) and unknown keys inside the ones
 * it does are preserved.
 */
export function policyWithForm(policy: KopiaPolicy, form: PolicyForm): KopiaPolicy {
  const next: KopiaPolicy = { ...policy };

  // Scheduling: `custom` means "leave whatever is in the JSON alone".
  if (form.schedule !== "custom") {
    let scheduling = { ...section<NonNullable<KopiaPolicy["scheduling"]>>(policy.scheduling) };
    // A cron line is the other half of a custom schedule: left in place it
    // would keep running the schedule the admin just replaced, and would read
    // straight back as "custom".
    delete scheduling.cron;
    scheduling = withKey(scheduling, "intervalSeconds", form.schedule === "hourly" ? HOURLY_SECONDS : undefined);
    let [hour, min] = form.time.split(":").map((v) => Number(v));
    if (!Number.isInteger(hour) || !Number.isInteger(min)) {
      // A cleared or half-typed time input must not turn a daily schedule into
      // no schedule at all.
      [hour, min] = DEFAULT_TIME.split(":").map((v) => Number(v));
    }
    scheduling = withKey(scheduling, "timeOfDay", form.schedule === "daily" ? [{ hour, min }] : undefined);
    scheduling = withKey(scheduling, "manual", form.schedule === "manual" ? true : undefined);
    next.scheduling = prune(scheduling);
  }

  const files = withKey(
    { ...section<NonNullable<KopiaPolicy["files"]>>(policy.files) },
    "ignore",
    lines(form.exclude).length ? lines(form.exclude) : undefined,
  );
  next.files = prune(files);

  let retention = { ...section<NonNullable<KopiaPolicy["retention"]>>(policy.retention) };
  retention = withKey(retention, "keepLatest", intOrUndefined(form.keepLatest));
  retention = withKey(retention, "keepDaily", intOrUndefined(form.keepDaily));
  retention = withKey(retention, "keepWeekly", intOrUndefined(form.keepWeekly));
  retention = withKey(retention, "keepMonthly", intOrUndefined(form.keepMonthly));
  next.retention = prune(retention);

  const compression = withKey(
    { ...section<NonNullable<KopiaPolicy["compression"]>>(policy.compression) },
    "compressorName",
    form.compression === "auto" ? undefined : form.compression,
  );
  next.compression = prune(compression);

  // An undefined section would serialize as a missing key anyway; deleting it
  // keeps the object the JSON editor shows identical to what is sent.
  for (const key of ["scheduling", "files", "retention", "compression"] as const) {
    if (next[key] === undefined) {
      delete next[key];
    }
  }
  return next;
}

/** The policy as the Advanced drawer shows it. */
export function policyToJSON(p: KopiaPolicy): string {
  return JSON.stringify(p, null, 2);
}

/**
 * Parses the Advanced drawer's text. A policy has to be a JSON object: the
 * server unmarshals it into a policy.Policy, and an array or a bare number
 * would be rejected there with a much worse message.
 */
export function policyFromJSON(text: string): { policy?: KopiaPolicy; error?: string } {
  if (text.trim() === "") {
    return { policy: {} };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "A policy must be a JSON object." };
    }
    return { policy: parsed as KopiaPolicy };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid JSON." };
  }
}

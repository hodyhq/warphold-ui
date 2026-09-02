import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Eyebrow, Kpi, Strip, Table, Toast, toneText } from "../../design/components";
import type { StripTone, TableRow } from "../../design/components";
import { engine, logText } from "../../api/engine";
import type { SchedulingPolicy, Snapshot, SourceStatus, TaskInfo } from "../../api/engineTypes";
import { apiError } from "../../api/fleet";
import { formatBytes, formatDuration, relativeTime, splitBytes } from "../../lib/format";
import { Mark } from "../fleet/Mark";

/**
 * How often the page re-reads the engine.
 *
 * ponytail: one poll is one /sources + /tasks + a /snapshots per source, and
 * /snapshots loads every manifest for that source. That is fine for the one to
 * three sources a device has; give the strip its own slower cadence if a
 * machine ever carries dozens.
 */
const POLL_MS = 30_000;

const STRIP_DAYS = 30;
const DAY_MS = 86_400_000;

/** How many runs the history shows; the engine keeps its task list in memory. */
const MAX_RUNS = 12;

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/** A clock time, e.g. "21:00", in the device's own timezone. */
function clockTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** A schedule interval as words, e.g. "45 min", "1 h", "2 d". */
function interval(seconds: number): string {
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min`;
  }
  if (seconds < 86_400) {
    return `${Math.round(seconds / 3600)} h`;
  }
  return `${Math.round(seconds / 86_400)} d`;
}

/**
 * What a source is told to do, in the words of the policy the fleet admin set.
 * Never the target: this page says when, not where.
 */
function scheduleLabel(s: SchedulingPolicy | undefined): string {
  if (!s || s.manual) {
    return "manual only";
  }
  const parts: string[] = [];
  if (s.intervalSeconds) {
    parts.push(`every ${interval(s.intervalSeconds)}`);
  }
  if (s.timeOfDay?.length) {
    parts.push(`at ${s.timeOfDay.map((t) => `${two(t.hour)}:${two(t.min)}`).join(", ")}`);
  }
  if (s.cron?.length) {
    parts.push(s.cron.join(", "));
  }
  return parts.join(" · ") || "on the fleet schedule";
}

/**
 * The 30-day heartbeat: one cell per day, oldest first. A day with a complete
 * snapshot is good; a day whose only snapshots were interrupted is a warning;
 * a day with none is blank.
 */
function stripFromSnapshots(snapshots: Snapshot[], now: number = Date.now()): StripTone[] {
  const days: StripTone[] = Array.from({ length: STRIP_DAYS }, () => "none");
  const start = Math.floor(now / DAY_MS) * DAY_MS - (STRIP_DAYS - 1) * DAY_MS;
  for (const s of snapshots) {
    const i = Math.floor((new Date(s.endTime).getTime() - start) / DAY_MS);
    if (i < 0 || i >= STRIP_DAYS) {
      continue;
    }
    if (!s.incomplete) {
      days[i] = "good";
    } else if (days[i] === "none") {
      days[i] = "warn";
    }
  }
  return days;
}

interface Headline {
  ok: boolean;
  /** The line under the headline: why it says what it says. */
  note: string;
}

/**
 * The whole screen in two words. ATTENTION is deliberately narrow - a machine
 * that has backed up recently and whose last run succeeded is OK, whatever
 * else the task list remembers.
 */
function headline(
  sources: SourceStatus[],
  tasks: TaskInfo[],
  bySource: Snapshot[][],
  now: number = Date.now(),
): Headline {
  if (sources.length === 0) {
    return { ok: false, note: "no sources are configured for this machine" };
  }

  // A source is protected once it has any complete snapshot: an interrupted
  // latest run is a run problem, which the failed-task rule below reports, not
  // proof that nothing was ever backed up.
  const never = sources.filter((_, i) => !(bySource[i] ?? []).some((s) => !s.incomplete));
  if (never.length === sources.length) {
    return { ok: false, note: "nothing has been backed up yet" };
  }
  if (never.length > 0) {
    return { ok: false, note: `${never.length} of ${sources.length} sources have no good backup yet` };
  }

  // The newest finished snapshot task is the machine's last word on itself; an
  // older failure that a later run made good must not keep the page red.
  const lastRun = tasks
    .filter((t) => t.kind === "Snapshot" && t.endTime)
    .sort((a, b) => new Date(b.endTime as string).getTime() - new Date(a.endTime as string).getTime())[0];
  if (lastRun?.status === "FAILED") {
    return { ok: false, note: lastRun.errorMessage || "the last backup run failed" };
  }

  const newest = Math.max(
    ...bySource
      .flat()
      .filter((s) => !s.incomplete)
      .map((s) => new Date(s.endTime).getTime()),
  );
  return { ok: true, note: `last good backup ${relativeTime(new Date(newest).toISOString(), now)}` };
}

/** Vault label: `group · name`, the name alone, or the product name. */
export function vaultLabel(group: string, name: string): string {
  if (!name) {
    return "WarpHold";
  }
  return group ? `${group} · ${name}` : name;
}

const RESULT: Record<string, { text: string; tone: "good" | "warn" | "bad" | "ink" }> = {
  SUCCESS: { text: "ok", tone: "good" },
  FAILED: { text: "failed", tone: "bad" },
  CANCELED: { text: "cancelled", tone: "warn" },
  CANCELING: { text: "cancelling", tone: "warn" },
  RUNNING: { text: "running", tone: "ink" },
};

function runLabel(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * The source a task ran against. Kopia describes a snapshot task as
 * "<user>@<host>:<path> at <time>", so matching the known sources beats
 * picking the string apart - a path can contain both "@" and ":".
 */
function taskSource(task: TaskInfo, sources: SourceStatus[]): string {
  for (const s of sources) {
    const { userName, host, path } = s.source;
    if (task.description.startsWith(`${userName}@${host}:${path} `)) {
      return path;
    }
  }
  return task.kind;
}

function runRows(tasks: TaskInfo[], sources: SourceStatus[]): TableRow[] {
  return tasks.map((t) => {
    const result = RESULT[t.status] ?? { text: t.status.toLowerCase(), tone: "ink" as const };
    const uploaded = t.counters?.["Uploaded Bytes"]?.value ?? 0;
    return {
      key: t.id,
      cells: [
        <span key="when" className="font-mono text-[12px]">
          {runLabel(t.startTime)}
        </span>,
        <span key="source" className="truncate font-mono text-[12px]">
          {taskSource(t, sources)}
        </span>,
        <span key="result" className={clsx("font-mono text-[12px]", toneText[result.tone])}>
          {result.text}
        </span>,
        <span key="took" className="font-mono text-[12px] text-muted">
          {t.endTime ? formatDuration(t.startTime, t.endTime) : "—"}
        </span>,
        <span key="uploaded" className="font-mono text-[12px] text-muted">
          {uploaded > 0 ? formatBytes(uploaded) : "—"}
        </span>,
      ],
    };
  });
}

interface Loaded {
  vault: string;
  sources: SourceStatus[];
  tasks: TaskInfo[];
  /** Snapshots per source, index-aligned with `sources` (one query each). */
  snapshots: Snapshot[][];
}

/**
 * The agent screen (Agent.dc.html): what this one machine's backups are doing,
 * for the person sitting at it. It answers three questions - am I protected,
 * when does it next run, what happened lately - and offers the two things that
 * person may do: run it now, or stop it for a while.
 *
 * The target, its bucket and its credentials are never shown. They are the
 * fleet admin's, and the device holds keys it must not put on screen.
 */
export function AgentHome() {
  const [data, setData] = useState<Loaded | null>(null);
  const [stale, setStale] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [log, setLog] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; bad: boolean } | null>(null);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    async function load(): Promise<Loaded> {
      const [info, sourcesResponse, taskList] = await Promise.all([
        // A vault with no name is not an error: the engine can run before the
        // device is enrolled, and the label falls back to the product name.
        engine.localInfo().catch(() => ({ name: "", group: "" })),
        engine.sources(),
        engine.tasks(),
      ]);
      const sources = sourcesResponse.sources;
      const perSource = await Promise.all(sources.map((s) => engine.snapshots(s.source)));
      return {
        vault: vaultLabel(info.group, info.name),
        sources,
        tasks: taskList.tasks,
        snapshots: perSource.map((r) => r.snapshots),
      };
    }
    // Two polls can overlap on a slow engine, and an action re-reads out of
    // band; only the newest request may write, or an older answer lands last.
    let generation = 0;
    function run() {
      const mine = ++generation;
      load().then(
        (d) => {
          if (live && mine === generation) {
            setData(d);
            setStale(false);
          }
        },
        () => live && mine === generation && setStale(true),
      );
    }
    run();
    const timer = setInterval(run, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [attempt]);

  // The log is fetched on demand, not with the poll: it is only on screen for
  // the one run the reader opened.
  useEffect(() => {
    if (expanded === null) {
      return;
    }
    let live = true;
    // The fetched log carries the id it belongs to, so a log that arrives
    // after the reader opened a different run is simply not the one on screen.
    engine.taskLog(expanded).then(
      (r) => live && setLog({ id: expanded, text: logText(r) || "This run wrote no log." }),
      () => live && setLog({ id: expanded, text: "The log for this run is no longer available." }),
    );
    return () => {
      live = false;
    };
  }, [expanded]);

  const sources = useMemo(() => data?.sources ?? [], [data]);
  const days = useMemo(() => stripFromSnapshots((data?.snapshots ?? []).flat()), [data]);
  const state = useMemo(() => headline(sources, data?.tasks ?? [], data?.snapshots ?? []), [sources, data]);

  const act = useCallback(
    (action: () => Promise<void>, done: string, failed: string) => {
      setBusy(true);
      action().then(
        () => {
          setToast({ message: done, bad: false });
          setBusy(false);
          reload();
        },
        (err: unknown) => {
          setToast({ message: apiError(err, failed), bad: true });
          setBusy(false);
        },
      );
    },
    [reload],
  );

  if (!data) {
    if (!stale) {
      return null;
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="m-0">Cannot reach the backup agent on this machine.</p>
        <Button onClick={reload}>Try again</Button>
      </div>
    );
  }

  const protectedBytes = sources.reduce((sum, s) => sum + (s.lastSnapshot?.stats?.totalSize ?? 0), 0);
  const [protectedValue, protectedUnit] = splitBytes(protectedBytes);
  // The soonest run across every source is what "Next" means to the reader.
  const nextAt = sources
    .map((s) => s.nextSnapshotTime)
    .filter((t): t is string => Boolean(t))
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)[0];
  const next = nextAt === undefined ? "—" : clockTime(new Date(nextAt).toISOString());
  const goodDays = days.filter((d) => d === "good").length;
  // Kopia's pause has no duration, so the button is a toggle: once every source
  // is paused the only thing left to offer is Resume.
  const paused = sources.length > 0 && sources.every((s) => s.status === "PAUSED");
  const runs = [...data.tasks]
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, MAX_RUNS);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="bg-panel pointer-events-none absolute top-0 left-[-120px] hidden h-full w-[520px] -skew-x-12 md:block"
      />
      <header className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 md:flex-nowrap md:px-11 md:py-[22px]">
        <Mark />
        <span className="font-display text-[15px] font-extrabold">WARPHOLD</span>
        <span className="font-mono text-[12px] text-dim">agent · {window.location.host}</span>
        <div className="grow" />
        <span className="font-mono text-[12px] text-muted">{data.vault}</span>
      </header>

      <div className="relative grid min-h-0 grow grid-cols-1 gap-8 px-5 pt-[10px] pb-8 md:grid-cols-[1fr_1.4fr] md:gap-11 md:px-11">
        <section className="flex flex-col gap-[22px]">
          <div>
            <Eyebrow>This machine</Eyebrow>
            <h1 className="font-display m-0 mt-2 text-[38px] leading-[0.98] font-extrabold tracking-[-0.02em] md:text-[52px]">
              <span className={state.ok ? toneText.good : toneText.bad}>{state.ok ? "OK" : "ATTENTION"}</span>
              <br />
              <span className="text-[20px] font-semibold text-ink-soft md:text-[24px]">{state.note}</span>
            </h1>
          </div>

          <div className="grid grid-cols-2 gap-px border border-line bg-line">
            <div className="bg-ground px-3 py-3 md:px-4 md:py-[14px]" data-testid="kpi-protected">
              <Kpi label="Protected" value={protectedValue} unit={protectedUnit} />
            </div>
            <div className="bg-ground px-3 py-3 md:px-4 md:py-[14px]">
              <Eyebrow>Next</Eyebrow>
              <div className="font-display mt-2 text-[22px] leading-none font-extrabold text-ember md:text-[28px]">
                {next}
              </div>
            </div>
          </div>

          <div>
            <Eyebrow>Last 30 days</Eyebrow>
            <Strip className="mt-[10px]" days={days} height={18} />
            <div className="mt-[6px] font-mono text-[12px] text-dim">
              {goodDays} of {STRIP_DAYS} days with a good backup
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => act(() => engine.backupNow(), "Backup started.", "Could not start a backup.")}
            >
              Back up now
            </Button>
            {paused ? (
              <Button
                disabled={busy}
                onClick={() => act(() => engine.resume(), "Scheduled backups resumed.", "Could not resume backups.")}
              >
                Resume
              </Button>
            ) : (
              <Button
                disabled={busy || sources.length === 0}
                onClick={() => act(() => engine.pause(), "Scheduled backups paused.", "Could not pause backups.")}
              >
                Pause
              </Button>
            )}
          </div>

          <div className="font-mono text-[12px] text-dim">
            {paused
              ? "Backups stay paused until you resume them."
              : "Policy and destination are set by your fleet admin."}
          </div>
        </section>

        <section className="min-w-0">
          <div data-testid="sources">
            <Eyebrow className="block border-b border-line-strong pb-[6px]">Sources</Eyebrow>
            {sources.length === 0 ? (
              <p className="m-0 pt-3 text-muted">No sources are configured for this machine yet.</p>
            ) : (
              sources.map((s) => (
                <div
                  key={`${s.source.userName}@${s.source.host}:${s.source.path}`}
                  className="flex justify-between gap-4 border-b border-line py-3"
                >
                  <span className="truncate font-mono text-[12px]">{s.source.path}</span>
                  <span className="shrink-0 font-mono text-[12px] text-muted">
                    {s.status === "PAUSED" ? "paused" : scheduleLabel(s.schedule)}
                  </span>
                </div>
              ))
            )}
          </div>

          <Eyebrow className="mt-[22px] block border-b border-line-strong pb-[6px]">Recent runs</Eyebrow>
          {runs.length === 0 ? (
            <p className="m-0 pt-3 text-muted">Nothing has run yet.</p>
          ) : (
            <Table
              className="mt-1"
              template="1fr 1.2fr 0.7fr 0.7fr 0.8fr"
              columns={[
                { key: "when", label: "When" },
                { key: "source", label: "Source" },
                { key: "result", label: "Result" },
                { key: "took", label: "Took" },
                { key: "uploaded", label: "Uploaded" },
              ]}
              rows={runRows(runs, sources)}
              onRowClick={(key) => setExpanded((cur) => (cur === key ? null : key))}
            />
          )}
          {expanded !== null && (
            <pre
              data-testid="run-log"
              className="m-0 mt-[10px] border-l-[3px] border-warn bg-warn-panel px-3 py-[10px] font-mono text-[12px] whitespace-pre-wrap text-[#c9b48f]"
            >
              {log?.id === expanded ? log.text : "Loading the log…"}
            </pre>
          )}
        </section>
      </div>

      {stale && (
        <p className="relative m-0 px-5 pb-6 font-mono text-[12px] text-dim md:px-11">
          Cannot reach the agent; showing the last state.
        </p>
      )}

      {toast && <Toast message={toast.message} tone={toast.bad ? "bad" : "ink"} onDismiss={() => setToast(null)} />}
    </div>
  );
}

export default AgentHome;

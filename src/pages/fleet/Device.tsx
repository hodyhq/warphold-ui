import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import clsx from "clsx";
import {
  Button,
  Card,
  Dialog,
  Eyebrow,
  Field,
  HealthBar,
  Input,
  Strip,
  Table,
  Toast,
  toneText,
} from "../../design/components";
import type { StripTone, TableRow } from "../../design/components";
import { apiError, fleet, type CommandKind } from "../../api/fleet";
import type { AgentDetail, Report, Template } from "../../api/types";
import { formatBytes, formatDuration, relativeTime } from "../../lib/format";
import { HEALTH_TEXT, HEALTH_TONE } from "./health";

/** How often the detail re-reads the device; the other Fleet screens match. */
const POLL_MS = 30_000;

const STRIP_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * The 30-day heartbeat, folded out of the reports the detail endpoint returns.
 * A day with any successful snapshot is good, a day with only errors is bad.
 *
 * ponytail: the endpoint returns the last 20 reports, so a busy device's strip
 * only covers as far back as those reach; widen it when GET /agents/{id} grows
 * a windowed report query.
 */
function stripFromReports(reports: Report[], now: number = Date.now()): StripTone[] {
  const days: StripTone[] = Array.from({ length: STRIP_DAYS }, () => "none");
  const start = Math.floor(now / DAY_MS) * DAY_MS - (STRIP_DAYS - 1) * DAY_MS;
  for (const r of reports) {
    if (r.kind !== "snapshot") {
      continue;
    }
    const i = Math.floor((new Date(r.finished_at).getTime() - start) / DAY_MS);
    if (i < 0 || i >= STRIP_DAYS) {
      continue;
    }
    if (r.status === "ok") {
      days[i] = "good";
    } else if (days[i] === "none") {
      days[i] = "bad";
    }
  }
  return days;
}

function startedLabel(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function runRows(reports: Report[]): TableRow[] {
  return reports.map((r) => ({
    key: String(r.id),
    cells: [
      <span key="started" className="font-mono text-[12px]">
        {startedLabel(r.started_at)}
      </span>,
      <span key="source" className="truncate font-mono text-[12px]">
        {r.source || r.kind}
      </span>,
      <span key="result" className={clsx("font-mono text-[12px]", r.status === "ok" ? toneText.good : toneText.bad)}>
        {r.status}
      </span>,
      <span key="duration" className="font-mono text-[12px] text-muted">
        {formatDuration(r.started_at, r.finished_at)}
      </span>,
      <span key="uploaded" className="font-mono text-[12px] text-muted">
        {r.bytes > 0 ? formatBytes(r.bytes) : "—"}
      </span>,
    ],
  }));
}

/** The template's source list, which is what a device in this group is told to back up. */
function Sources({ template }: { template: Template | undefined }) {
  const sources = template?.sources ?? [];
  return (
    <div data-testid="sources">
      <Eyebrow className="block border-b border-line-strong pb-[6px]">Sources</Eyebrow>
      {sources.length === 0 ? (
        <p className="m-0 pt-3 text-muted">This group&apos;s template lists no sources.</p>
      ) : (
        sources.map((path) => (
          <div key={path} className="border-b border-line py-3">
            <div className="font-mono break-all">{path}</div>
            <div className="mt-1 text-muted">
              {/* Fleet has no per-agent source list yet: the template is pushed
                  verbatim and the agent expands ~ against its own user. */}
              {path.startsWith("~") ? "~ expands on the device" : "absolute path on the device"}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Device detail, the Main.dc.html drawer as a full screen: what this machine
 * is, what it backs up, what it has done lately, and the four things an admin
 * can do to it. Revoking is the one destructive action, so it asks for the
 * device name to be typed before it will fire.
 */
export function Device() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [groupName, setGroupName] = useState("");
  const [template, setTemplate] = useState<Template | undefined>();
  const [stale, setStale] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [toast, setToast] = useState<{ message: string; bad: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    function load() {
      // The group names the device and picks its template; both are small
      // list endpoints, so this is three calls per poll, not one per source.
      Promise.all([fleet.agent(id), fleet.groups(), fleet.templates()]).then(
        ([a, gs, ts]) => {
          if (!live) {
            return;
          }
          const group = gs.find((g) => g.id === a.group_id);
          setDetail(a);
          setGroupName(group?.name ?? "");
          setTemplate(ts.find((t) => t.id === group?.template_id));
          setStale(false);
        },
        // A 401 has already sent the browser to the login page from the
        // client's interceptor; anything else is the server being unreachable.
        () => live && setStale(true),
      );
    }
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id, attempt]);

  const reports = useMemo(() => detail?.reports ?? [], [detail]);
  const days = useMemo(() => stripFromReports(reports), [reports]);

  const command = useCallback(
    (kind: CommandKind, label: string) => {
      fleet.agentCommand(id, kind).then(
        () => setToast({ message: `${label} queued; it runs at the device's next check-in.`, bad: false }),
        (err: unknown) => setToast({ message: apiError(err, `Could not queue ${label.toLowerCase()}.`), bad: true }),
      );
    },
    [id],
  );

  // Both entry points reset the typed name: a cancelled dialog that kept it
  // would reopen with the confirm button already armed.
  const openConfirm = useCallback(() => {
    setTypedName("");
    setConfirming(true);
  }, []);
  const closeConfirm = useCallback(() => {
    setTypedName("");
    setConfirming(false);
  }, []);

  const revoke = useCallback(() => {
    fleet.revokeAgent(id).then(
      () => navigate("/fleet/devices"),
      (err: unknown) => {
        setConfirming(false);
        setToast({ message: apiError(err, "Could not revoke the device."), bad: true });
      },
    );
  }, [id, navigate]);

  if (!detail) {
    if (!stale) {
      return null;
    }
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="m-0">Cannot reach the WarpHold server.</p>
        <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
      </div>
    );
  }

  const lastOK = reports.find((r) => r.kind === "snapshot" && r.status === "ok");
  const goodDays = days.filter((d) => d === "good").length;
  const revoked = detail.revoked_at !== null;
  const openReport = expanded === null ? undefined : reports.find((r) => String(r.id) === expanded);

  return (
    <div className="flex min-h-0 grow flex-col gap-[18px]">
      <Link to="/fleet/devices" className="font-mono text-muted hover:text-ink">
        ← Devices
      </Link>

      <div className="flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
        <div>
          <div data-testid="device-facts">
            <Eyebrow>
              {[groupName, `agent ${detail.version}`, detail.os, `${detail.scope} scope`].filter(Boolean).join(" · ")}
            </Eyebrow>
          </div>
          <h1 className="font-display m-0 mt-2 flex items-center gap-4 text-[28px] leading-none font-extrabold tracking-[-0.02em] md:text-[40px]">
            <HealthBar tone={HEALTH_TONE[detail.health]} height={36} />
            {detail.name}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Button variant="primary" disabled={revoked} onClick={() => command("snapshot-now", "Snapshot")}>
            Snapshot now
          </Button>
          <Button disabled={revoked} onClick={() => command("pause", "Pause")}>
            Pause
          </Button>
          <Button disabled={revoked} onClick={() => command("resume", "Resume")}>
            Resume
          </Button>
          <Button disabled title="Runs from Fleet in a later version">
            Verify
          </Button>
          <Button disabled title="Recovery kits arrive with Plan 3">
            Recovery kit
          </Button>
          <Button variant="danger" disabled={revoked} onClick={openConfirm}>
            Revoke
          </Button>
        </div>
      </div>

      {revoked && (
        <Card tone="bad" className="py-3">
          <span>
            This device was revoked on {new Date(detail.revoked_at as string).toLocaleDateString()}. It can no longer
            reach the repository; its snapshots stay in the target.
          </span>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-3">
        <Card data-testid="kpi-last">
          <Eyebrow>Last snapshot</Eyebrow>
          <div
            className={clsx(
              "font-display text-[28px] leading-none font-extrabold",
              toneText[HEALTH_TEXT[detail.health]],
            )}
          >
            {lastOK ? relativeTime(lastOK.finished_at) : "never"}
          </div>
          <div className="font-mono text-[12px] text-dim">The schedule comes from the group&apos;s policy.</div>
        </Card>
        <Card data-testid="kpi-stored">
          <Eyebrow>Stored</Eyebrow>
          {/* Repository stats arrive with Plan 3; an em dash beats inventing a
              number out of the bytes these runs happened to upload. */}
          <div className="font-display text-[28px] leading-none font-extrabold">—</div>
          <div className="font-mono text-[12px] text-dim">Repository stats arrive in a later version.</div>
        </Card>
        <Card data-testid="kpi-days">
          <Eyebrow>Last 30 days</Eyebrow>
          <Strip days={days} height={22} />
          <div className="font-mono text-[12px] text-dim">{goodDays} of 30 days with a good snapshot</div>
        </Card>
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-6 md:grid-cols-[0.9fr_1.6fr]">
        <Sources template={template} />
        <div className="min-w-0">
          {reports.length === 0 ? (
            <>
              <Eyebrow className="block border-b border-line-strong pb-[6px]">Recent runs</Eyebrow>
              <p className="m-0 pt-3 text-muted">No runs reported yet.</p>
            </>
          ) : (
            <Table
              template="1fr 1.2fr 0.8fr 0.8fr 0.8fr"
              columns={[
                { key: "started", label: "Started" },
                { key: "source", label: "Source" },
                { key: "result", label: "Result" },
                { key: "duration", label: "Duration" },
                { key: "uploaded", label: "Uploaded" },
              ]}
              rows={runRows(reports)}
              onRowClick={(key) => setExpanded((cur) => (cur === key ? null : key))}
            />
          )}
          {openReport && (
            <pre
              data-testid="run-stderr"
              className="m-0 mt-3 border-l-[3px] border-bad bg-bad-panel px-[14px] py-3 font-mono text-[12px] whitespace-pre-wrap text-[#c9a0a0]"
            >
              {openReport.stderr || "This run wrote nothing to stderr."}
            </pre>
          )}
        </div>
      </div>

      {stale && <p className="m-0 font-mono text-[12px] text-dim">Cannot reach the server; showing the last state.</p>}

      <Dialog open={confirming} onClose={closeConfirm} title={`Revoke ${detail.name}?`}>
        <p className="m-0 text-ink-soft">
          The device loses its repository credentials at once and stops backing up. Snapshots it already took stay in
          the target. This cannot be undone from Fleet.
        </p>
        <Field label={`Type ${detail.name} to confirm`}>
          <Input value={typedName} autoComplete="off" onChange={(e) => setTypedName(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={closeConfirm}>Cancel</Button>
          {/* The typed name is a speed bump, not authorization: the server
              still checks the session and the CSRF token on the POST. */}
          <Button variant="danger" disabled={typedName !== detail.name} onClick={revoke}>
            Revoke device
          </Button>
        </div>
      </Dialog>

      {toast && <Toast message={toast.message} tone={toast.bad ? "bad" : "ink"} onDismiss={() => setToast(null)} />}
    </div>
  );
}

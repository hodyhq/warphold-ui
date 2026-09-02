import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import clsx from "clsx";
import { Button, Eyebrow, HealthBar, Strip, Table, toneText } from "../../design/components";
import type { StripTone, TableRow } from "../../design/components";
import { fleet } from "../../api/fleet";
import type { AgentOut, Overview } from "../../api/types";
import { formatBytes } from "../../lib/format";
import { HEALTH_TEXT, HEALTH_TONE } from "./health";

/** How often the list re-reads the fleet; the Overview polls on the same beat. */
const POLL_MS = 30_000;

/** 30 blank days, for a device the overview does not cover (revoked ones). */
const NO_DAYS: StripTone[] = Array.from({ length: 30 }, () => "none");

/** `.chip` from Main.dc.html: a filter toggle, ember when it is the current one. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        "cursor-pointer rounded-pill border px-[10px] py-[5px] text-[12px]",
        on ? "border-ember text-ember" : "border-line-strong text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** One device row: the agent record, joined to what the overview computed for it. */
interface DeviceRow {
  agent: AgentOut;
  group: string;
  /** Server-formatted age of the last good snapshot, or "never". */
  last: string;
  sizeBytes: number;
  days: StripTone[];
}

function buildRows(agents: AgentOut[], groups: Map<number, string>, overview: Overview | null): DeviceRow[] {
  // The overview only covers live devices, so a revoked one keeps a blank
  // strip rather than borrowing another device's history.
  const measured = new Map((overview?.devices ?? []).map((d) => [d.id, d]));
  return agents.map((agent) => {
    const d = measured.get(agent.id);
    return {
      agent,
      group: groups.get(agent.group_id) ?? "",
      last: agent.revoked_at ? "revoked" : (d?.last ?? "—"),
      sizeBytes: d?.size_bytes ?? 0,
      days: d?.days ?? NO_DAYS,
    };
  });
}

type Filter = "all" | "failing" | "stale" | "revoked" | { group: string };

function matches(row: DeviceRow, filter: Filter): boolean {
  const revoked = row.agent.revoked_at !== null;
  if (filter === "revoked") {
    return revoked;
  }
  // Every other filter is about the live fleet; revoked devices are opt-in.
  if (revoked) {
    return false;
  }
  if (filter === "failing") {
    return row.agent.health === "red";
  }
  if (filter === "stale") {
    return row.agent.health === "yellow";
  }
  return filter === "all" || row.group === filter.group;
}

/**
 * Devices, the Main.dc.html list: every enrolled machine with its health bar,
 * group, 30-day heartbeat, last snapshot, size and agent version, filtered by
 * health or group. Revoked devices are kept out of the fleet's numbers (the
 * overview drops them) but stay reachable behind their own filter.
 */
export function Devices() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentOut[] | null>(null);
  const [groups, setGroups] = useState<Map<number, string>>(() => new Map());
  const [overview, setOverview] = useState<Overview | null>(null);
  const [stale, setStale] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let live = true;
    function load() {
      // Three batched list endpoints rather than one call per device: the
      // overview already folds every agent's strip together server-side.
      Promise.all([fleet.agents(), fleet.groups(), fleet.overview()]).then(
        ([a, g, o]) => {
          if (live) {
            setAgents(a);
            setGroups(new Map(g.map((x) => [x.id, x.name])));
            setOverview(o);
            setStale(false);
          }
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
  }, [attempt]);

  const rows = useMemo(() => buildRows(agents ?? [], groups, overview), [agents, groups, overview]);

  if (!agents) {
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

  const live = rows.filter((r) => r.agent.revoked_at === null);
  const failing = live.filter((r) => r.agent.health === "red").length;
  const stale30 = live.filter((r) => r.agent.health === "yellow").length;
  const revoked = rows.length - live.length;
  const groupNames = [...new Set(live.map((r) => r.group).filter(Boolean))];

  const tableRows: TableRow[] = rows.filter((r) => matches(r, filter)).map(toTableRow);

  return (
    <div className="flex min-h-0 grow flex-col gap-[18px]">
      <div className="flex items-end justify-between gap-6">
        <div>
          <Eyebrow>Devices</Eyebrow>
          <h1 className="font-display m-0 mt-2 text-[36px] leading-none font-extrabold tracking-[-0.02em]">
            {live.length} enrolled
          </h1>
        </div>
        {rows.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            <Chip on={filter === "all"} onClick={() => setFilter("all")}>
              All
            </Chip>
            <Chip on={filter === "failing"} onClick={() => setFilter("failing")}>
              Failing {failing}
            </Chip>
            <Chip on={filter === "stale"} onClick={() => setFilter("stale")}>
              Stale {stale30}
            </Chip>
            {groupNames.map((name) => (
              <Chip
                key={name}
                on={typeof filter === "object" && filter.group === name}
                onClick={() => setFilter({ group: name })}
              >
                {name}
              </Chip>
            ))}
            {revoked > 0 && (
              <Chip on={filter === "revoked"} onClick={() => setFilter("revoked")}>
                Revoked {revoked}
              </Chip>
            )}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4 pt-6">
          <p className="m-0 text-muted">No devices enrolled yet.</p>
          <Button variant="primary" onClick={() => navigate("/fleet/groups")}>
            Add device
          </Button>
        </div>
      ) : (
        <Table
          template="8px 1.3fr 0.8fr 2fr 1fr 0.7fr 0.7fr"
          columns={[
            { key: "bar" },
            { key: "device", label: "Device" },
            { key: "group", label: "Group" },
            { key: "days", label: "Last 30 days" },
            { key: "last", label: "Last snapshot" },
            { key: "size", label: "Size" },
            { key: "agent", label: "Agent" },
          ]}
          rows={tableRows}
          onRowClick={(id) => navigate(`/fleet/devices/${encodeURIComponent(id)}`)}
        />
      )}

      {stale && <p className="m-0 font-mono text-[12px] text-dim">Cannot reach the server; showing the last state.</p>}
    </div>
  );
}

function toTableRow(row: DeviceRow): TableRow {
  const { agent } = row;
  const tone: StripTone = HEALTH_TONE[agent.health];
  return {
    key: agent.id,
    cells: [
      <HealthBar key="bar" tone={tone} />,
      <span key="device" className="truncate font-semibold">
        {agent.name}
      </span>,
      <span key="group" className="truncate text-muted">
        {row.group}
      </span>,
      <Strip key="days" days={row.days} />,
      <span key="last" className={clsx("font-mono text-[12px]", toneText[HEALTH_TEXT[agent.health]])}>
        {row.last}
      </span>,
      // size_bytes stays 0 until Plan 3 collects repository stats; an em dash
      // says "not measured yet" where "0 B" would claim it stores nothing.
      <span key="size" className="font-mono text-[12px]">
        {row.sizeBytes > 0 ? formatBytes(row.sizeBytes) : "—"}
      </span>,
      <span key="agent" className="font-mono text-[12px] text-dim">
        {agent.version}
      </span>,
    ],
  };
}

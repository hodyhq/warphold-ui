import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import clsx from "clsx";
import { Button, Eyebrow, HealthBar, Kpi, Strip, toneText } from "../../design/components";
import type { KpiProps } from "../../design/components";
import { fleet } from "../../api/fleet";
import type { Overview as OverviewData, OverviewBucket } from "../../api/types";
import { splitBytes } from "../../lib/format";
import { HEALTH_TEXT, HEALTH_TONE } from "./health";

/** How often the dashboard re-reads the fleet. */
const POLL_MS = 30_000;

function hourLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

/** One cell of the KPI strip: the design's 1px-gap grid of ground-colored tiles. */
function Tile({ id, ...kpi }: { id: string } & KpiProps) {
  return (
    <div data-testid={`kpi-${id}`} className="bg-ground px-3 py-3 md:px-4 md:py-[14px]">
      <Kpi {...kpi} />
    </div>
  );
}

/**
 * The 24 hourly buckets as the prototype's tick timeline: height by successful
 * snapshots, red where anything failed, ember for the hour still running.
 */
function Timeline({ buckets }: { buckets: OverviewBucket[] }) {
  const peak = Math.max(1, ...buckets.map((b) => b.ok));
  const last = buckets.length - 1;
  return (
    <div>
      <div className="flex items-end gap-[6px] border-b border-line-strong pb-[6px] h-16">
        {buckets.map((b, i) => (
          <span
            key={b.hour}
            data-testid="tick"
            className={clsx(
              "w-[3px] rounded-[1px]",
              b.failed > 0 ? "bg-bad" : i === last ? "bg-ember" : "bg-ink",
              b.failed > 0 || i === last ? "opacity-100" : "opacity-85",
            )}
            // The bar is a magnitude, so its height is data, not styling: an
            // empty hour keeps a visible stub rather than vanishing.
            style={{ height: `${b.ok === 0 ? 8 : Math.max(30, Math.round((b.ok / peak) * 100))}%` }}
          />
        ))}
      </div>
      <div className="mt-[6px] flex justify-between font-mono text-[12px] text-dim">
        <span>{buckets.length > 0 ? hourLabel(buckets[0].hour) : ""}</span>
        <span>{buckets.length > 12 ? hourLabel(buckets[12].hour) : ""}</span>
        <span className="text-ember">now</span>
      </div>
    </div>
  );
}

/**
 * Fleet Overview, the Main.dc.html dashboard: how much of the fleet is
 * protected right now, what ran in the last 24 h, what needs attention, and
 * one 30-day heartbeat per device. Everything is computed server-side (see
 * GET /overview); this screen only renders and polls.
 */
export function Overview() {
  const navigate = useNavigate();
  const [data, setData] = useState<OverviewData | null>(null);
  const [stale, setStale] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    function load() {
      fleet.overview().then(
        (d) => {
          if (live) {
            setData(d);
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

  const openDevice = useCallback((id: string) => navigate(`/fleet/devices/${encodeURIComponent(id)}`), [navigate]);

  if (!data) {
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

  const { counts, last24h, latest_failure: failure, devices } = data;
  const stored = data.dedup_ratio == null ? null : splitBytes(data.stored_bytes);

  return (
    <div className="grid min-h-0 grow grid-cols-1 gap-10 md:grid-cols-[1.15fr_1fr] md:gap-14">
      <section className="flex flex-col gap-[22px]">
        <div>
          <Eyebrow>
            {data.fleet_name || "Fleet"} · {plural(counts.agents, "device")} · {plural(counts.targets, "target")}
          </Eyebrow>
          <h1 className="font-display m-0 mt-2 text-[40px] leading-[0.98] font-extrabold tracking-[-0.02em] md:text-[64px]">
            {counts.green}
            <span className="text-ember">/</span>
            {counts.agents}
            <br />
            <span className="text-[22px] font-semibold text-ink-soft md:text-[28px]">protected right now</span>
          </h1>
        </div>

        {/* Four tiles are two rows of two on a phone; three stay in one row. */}
        <div
          className={clsx(
            "grid gap-[1px] border border-line bg-line",
            stored ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3",
          )}
        >
          <Tile id="protected" label="Protected" value={counts.green} tone="good" />
          <Tile id="stale" label="Stale" value={counts.yellow} tone="warn" />
          <Tile id="failing" label="Failing" value={counts.red} tone="bad" />
          {stored && (
            <Tile id="stored" label="Stored" value={stored[0]} unit={stored[1]} sub={`${data.dedup_ratio}× dedup`} />
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <Eyebrow>Snapshots · last 24 h</Eyebrow>
            <span className="font-mono text-[12px] text-muted">
              {last24h.completed} completed · {last24h.failed} failed
            </span>
          </div>
          <div className="mt-[10px]">
            <Timeline buckets={last24h.buckets} />
          </div>
        </div>

        {failure && (
          <div
            data-testid="latest-failure"
            role="button"
            tabIndex={0}
            onClick={() => openDevice(failure.agent_id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openDevice(failure.agent_id);
              }
            }}
            className="cursor-pointer border-l-[3px] border-bad bg-bad-panel px-4 py-3"
          >
            <div className="flex justify-between">
              <span className="font-semibold">
                {failure.name} failed at {hourLabel(failure.finished_at)}
              </span>
              <span className="text-ember-soft">Open</span>
            </div>
            <p className="m-0 mt-[6px] font-mono text-[12px] break-words text-[#c9a0a0]">{failure.stderr}</p>
          </div>
        )}

        {stale && (
          <p className="m-0 font-mono text-[12px] text-dim">Cannot reach the server; showing the last known state.</p>
        )}
      </section>

      <section className="flex flex-col">
        <div data-testid="devices-head" className="flex justify-between gap-4 border-b border-line-strong pb-[6px]">
          <Eyebrow>Devices</Eyebrow>
          <Eyebrow>last 30 days</Eyebrow>
        </div>
        {devices.length === 0 ? (
          <div className="flex flex-col items-start gap-4 pt-6">
            <p className="m-0 text-muted">No devices enrolled yet.</p>
            <Button variant="primary" onClick={() => navigate("/fleet/groups")}>
              Add device
            </Button>
          </div>
        ) : (
          devices.map((d) => (
            <div
              key={d.id}
              role="button"
              aria-label={d.name}
              tabIndex={0}
              onClick={() => openDevice(d.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openDevice(d.id);
                }
              }}
              className="flex cursor-pointer items-center gap-[14px] border-b border-line py-3"
            >
              <HealthBar tone={HEALTH_TONE[d.health]} />
              <div className="flex min-w-0 grow flex-col gap-[6px]">
                <div className="flex justify-between gap-3">
                  <span className="truncate font-semibold">{d.name}</span>
                  <span className={clsx("font-mono text-[12px]", toneText[HEALTH_TEXT[d.health]])}>{d.last}</span>
                </div>
                <Strip days={d.days} />
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Eyebrow, Field, Input, Select, Toast, inputClass } from "../../design/components";
import { apiError, fleet } from "../../api/fleet";
import type { AgentOut, Group, KopiaPolicy, Template } from "../../api/types";
import {
  formFromPolicy,
  lines,
  policyFromJSON,
  policyToJSON,
  policyWithForm,
  type Compression,
  type ScheduleKind,
} from "./policy";

/**
 * Policy templates, the Main.dc.html two-pane screen: the list on the left,
 * one template's settings on the right. The five controls cover what a family
 * fleet sets; the Advanced drawer is the same policy as JSON, and the two stay
 * in step in both directions - everything the form does not own rides along.
 */
export function Templates() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [agents, setAgents] = useState<AgentOut[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** A template id, or "new" for the unsaved one. */
  const [selected, setSelected] = useState<number | "new" | null>(null);

  const [saved, setSaved] = useState(false);

  /**
   * Reloads the three lists, and only then moves the selection: a template
   * just created does not exist in the list this screen is still holding, so
   * selecting it first would remount the editor against the pre-save list and
   * show an empty form.
   */
  const load = useCallback(async (select?: number) => {
    const [ts, gs, as] = await Promise.all([fleet.templates(), fleet.groups(), fleet.agents()]);
    setTemplates(ts);
    setGroups(gs);
    setAgents(as);
    setFailed(false);
    setSelected(
      (cur) => select ?? (cur !== null && (cur === "new" || ts.some((t) => t.id === cur)) ? cur : (ts[0]?.id ?? "new")),
    );
  }, []);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    // A 401 has already sent the browser to the login page from the client's
    // interceptor; anything else is the server being unreachable.
    load().catch(() => setFailed(true));
  }, [load, attempt]);

  if (!templates) {
    if (!failed) {
      return null;
    }
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="m-0">Cannot reach the WarpHold server.</p>
        <Button onClick={reload}>Try again</Button>
      </div>
    );
  }

  const usedBy = (id: number) => groups.filter((g) => g.template_id === id).map((g) => g.name);
  const devices = (id: number) => {
    const ids = new Set(groups.filter((g) => g.template_id === id).map((g) => g.id));
    return agents.filter((a) => a.revoked_at === null && ids.has(a.group_id)).length;
  };
  const current = typeof selected === "number" ? templates.find((t) => t.id === selected) : undefined;

  return (
    <div className="grid min-h-0 grow grid-cols-1 gap-8 md:grid-cols-[0.8fr_2fr]">
      <div className="flex flex-col items-start">
        <Eyebrow>Policy templates</Eyebrow>
        <div className="mt-[14px] flex w-full flex-col">
          {templates.map((t) => {
            const on = selected === t.id;
            const groupNames = usedBy(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-current={on ? "true" : undefined}
                onClick={() => {
                  setSelected(t.id);
                  setSaved(false);
                }}
                className={clsx(
                  "cursor-pointer border-l-[3px] px-[14px] py-3 text-left",
                  on ? "bg-panel border-l-ember" : "hover:text-ink border-l-transparent",
                )}
              >
                <div className="font-semibold">{t.name}</div>
                <div className="text-muted font-mono text-[12px]">
                  {groupNames.length ? `used by ${groupNames.join(", ")}` : "not used by a group"}
                </div>
              </button>
            );
          })}
        </div>
        <Button
          className="mt-[14px]"
          variant={templates.length === 0 ? "primary" : "default"}
          onClick={() => {
            setSelected("new");
            setSaved(false);
          }}
        >
          New template
        </Button>
      </div>

      {selected !== null && (
        <Editor
          // Remounting on the selection is what resets the editor: no effect
          // has to copy the chosen template into the fields.
          key={selected}
          template={current}
          devices={current ? devices(current.id) : 0}
          onSaved={(id) => {
            // The confirmation is the parent's, because creating a template
            // remounts the editor onto the row the reload brings back.
            setSaved(true);
            load(id).catch(() => setFailed(true));
          }}
        />
      )}
      {saved && (
        <Toast
          message="Saved. Devices pick it up at their next check-in."
          tone="good"
          onDismiss={() => setSaved(false)}
        />
      )}
    </div>
  );
}

const SCHEDULES: { value: ScheduleKind; label: string }[] = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily at" },
  { value: "manual", label: "Manual only" },
];

const COMPRESSIONS: { value: Compression; label: string }[] = [
  { value: "zstd", label: "zstd" },
  { value: "none", label: "None" },
  { value: "auto", label: "Inherit (auto)" },
];

function Editor({
  template,
  devices,
  onSaved,
}: {
  template: Template | undefined;
  devices: number;
  onSaved: (id: number) => void;
}) {
  const initial = useMemo(
    () => ({
      name: template?.name ?? "",
      sources: (template?.sources ?? []).join("\n"),
      policy: template?.policy ?? {},
    }),
    [template],
  );

  const [name, setName] = useState(initial.name);
  const [sources, setSources] = useState(initial.sources);
  const [policy, setPolicy] = useState<KopiaPolicy>(initial.policy);
  const [json, setJSON] = useState(() => policyToJSON(initial.policy));
  const [jsonError, setJSONError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const form = formFromPolicy(policy);

  /** A form control changed: patch the policy, and redraw the JSON from it. */
  function patch(change: Partial<typeof form>) {
    const next = policyWithForm(policy, { ...form, ...change });
    setPolicy(next);
    setJSON(policyToJSON(next));
    setJSONError("");
  }

  /** The drawer changed: the JSON is the policy, so the form follows it. */
  function editJSON(text: string) {
    setJSON(text);
    const { policy: parsed, error: bad } = policyFromJSON(text);
    if (parsed) {
      setPolicy(parsed);
      setJSONError("");
    } else {
      setJSONError(bad ?? "Invalid JSON.");
    }
  }

  function discard() {
    setName(initial.name);
    setSources(initial.sources);
    setPolicy(initial.policy);
    setJSON(policyToJSON(initial.policy));
    setJSONError("");
    setError("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const input = { name: name.trim(), sources: lines(sources), policy };
      if (template) {
        await fleet.updateTemplate(template.id, input);
        onSaved(template.id);
      } else {
        const created = await fleet.createTemplate(input);
        onSaved(created.id);
      }
    } catch (err) {
      // The server validates the policy against Kopia's own type, so its
      // message is the one worth reading; it lands beside the editor.
      setError(apiError(err, "Could not save the template."));
    } finally {
      setBusy(false);
    }
  }

  const ready = name.trim() !== "" && lines(sources).length > 0 && jsonError === "";

  return (
    <form onSubmit={save} className="flex min-h-0 flex-col gap-[18px] overflow-auto">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <Field label="Template name" className="grow">
          <Input value={name} autoComplete="off" placeholder="Home default" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button onClick={discard}>Discard</Button>
          <Button type="submit" variant="primary" disabled={busy || !ready}>
            {template ? `Save & push to ${devices} device${devices === 1 ? "" : "s"}` : "Create template"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2">
        <Field label="Sources (one path per line)">
          <textarea
            rows={4}
            value={sources}
            spellCheck={false}
            placeholder={"~\n/etc"}
            onChange={(e) => setSources(e.target.value)}
            className={clsx(inputClass, "font-mono text-[12px]")}
          />
        </Field>
        <div className="flex flex-col gap-[18px]">
          <Field label="Schedule">
            <Select value={form.schedule} onChange={(e) => patch({ schedule: e.target.value as ScheduleKind })}>
              {SCHEDULES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
              {form.schedule === "custom" && <option value="custom">Custom (set under Advanced)</option>}
            </Select>
          </Field>
          {form.schedule === "daily" && (
            <Field label="Time of day">
              <Input type="time" value={form.time} onChange={(e) => patch({ time: e.target.value })} />
            </Field>
          )}
        </div>
        <Field label="Exclude (one glob per line)" className="col-span-full">
          <textarea
            rows={4}
            value={form.exclude}
            spellCheck={false}
            placeholder={"~/.cache\n**/node_modules"}
            onChange={(e) => patch({ exclude: e.target.value })}
            className={clsx(inputClass, "font-mono text-[12px]")}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Keep latest">
            <Input
              inputMode="numeric"
              value={form.keepLatest}
              onChange={(e) => patch({ keepLatest: e.target.value })}
            />
          </Field>
          <Field label="Keep daily">
            <Input inputMode="numeric" value={form.keepDaily} onChange={(e) => patch({ keepDaily: e.target.value })} />
          </Field>
          <Field label="Keep weekly">
            <Input
              inputMode="numeric"
              value={form.keepWeekly}
              onChange={(e) => patch({ keepWeekly: e.target.value })}
            />
          </Field>
          <Field label="Keep monthly">
            <Input
              inputMode="numeric"
              value={form.keepMonthly}
              onChange={(e) => patch({ keepMonthly: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Compression">
          <Select value={form.compression} onChange={(e) => patch({ compression: e.target.value as Compression })}>
            {COMPRESSIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <details open={form.schedule === "custom"}>
        <summary className="text-muted hover:text-ink cursor-pointer font-mono text-[12px]">
          Advanced · the whole Kopia policy
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            aria-label="Policy JSON"
            rows={14}
            value={json}
            spellCheck={false}
            onChange={(e) => editJSON(e.target.value)}
            className={clsx(inputClass, "w-full font-mono text-[12px] leading-[1.6]")}
          />
          {jsonError && (
            <p role="alert" className="text-bad m-0 font-mono text-[12px]">
              {jsonError}
            </p>
          )}
          <p className="text-dim m-0 font-mono text-[11px]">
            Everything Kopia&apos;s policy can express is available here; the server validates it on save.
          </p>
        </div>
      </details>

      {error && (
        <p role="alert" className="text-bad m-0 text-[13px]">
          {error}
        </p>
      )}
    </form>
  );
}

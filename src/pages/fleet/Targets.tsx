import React, { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Button, Card, Dialog, Eyebrow, Field, Input, Pill, Toast } from "../../design/components";
import { apiError, fleet } from "../../api/fleet";
import type { AgentOut, Group, Target, TargetInput } from "../../api/types";

/** How a target's headline reads; the kind decides which field names it. */
function title(t: Target): string {
  return t.kind === "b2" ? `Backblaze B2 · ${t.bucket ?? t.name}` : `Filesystem · ${t.path ?? t.name}`;
}

/**
 * Targets, the Main.dc.html cards: where a group's backups actually land.
 * Credentials are write-only - the server seals them on the way in and its
 * list endpoint never returns them - so nothing here can display a key.
 */
export function Targets() {
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [agents, setAgents] = useState<AgentOut[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<{ message: string; bad: boolean } | null>(null);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    Promise.all([fleet.targets(), fleet.groups(), fleet.agents()]).then(
      ([ts, gs, as]) => {
        if (live) {
          setTargets(ts);
          setGroups(gs);
          setAgents(as);
          setFailed(false);
        }
      },
      // A 401 has already sent the browser to the login page from the client's
      // interceptor; anything else is the server being unreachable.
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  if (!targets) {
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

  // A device belongs to a target through its group.
  const devices = (targetID: number) => {
    const ids = new Set(groups.filter((g) => g.target_id === targetID).map((g) => g.id));
    return agents.filter((a) => a.revoked_at === null && ids.has(a.group_id)).length;
  };

  return (
    <div className="flex min-h-0 grow flex-col gap-[18px]">
      <div className="flex items-end justify-between gap-6">
        <div>
          <Eyebrow>Targets</Eyebrow>
          <h1 className="font-display m-0 mt-2 text-[36px] leading-none font-extrabold tracking-[-0.02em]">
            Where backups live
          </h1>
        </div>
        <Button variant={targets.length === 0 ? "primary" : "default"} onClick={() => setAdding(true)}>
          Add target
        </Button>
      </div>

      {targets.length === 0 ? (
        <p className="text-muted m-0 max-w-[60ch]">
          No targets yet. A target is a bucket or a folder; every group points at one, and every device in that group
          gets its own repository inside it.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-[18px]">
          {targets.map((t) => {
            const count = devices(t.id);
            return (
              <Card key={t.id} data-testid={`target-${t.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <span className="font-display text-[18px] font-semibold break-all">{title(t)}</span>
                  {t.kind === "b2" ? (
                    t.object_lock_verified_at ? (
                      <Pill tone="good">Object Lock verified</Pill>
                    ) : (
                      <Pill tone="warn">No Object Lock</Pill>
                    )
                  ) : (
                    <Pill>Local</Pill>
                  )}
                </div>
                <div className="text-muted">
                  {[t.kind === "b2" ? t.region : "on this server", `${count} device${count === 1 ? "" : "s"}`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="text-dim font-mono text-[12px]">
                  {t.kind === "b2"
                    ? "Admin key sealed · per-device keys write + list + read, never delete"
                    : "No immutability. Sync to B2 is a later feature."}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {adding && (
        <AddTargetDialog
          onClose={() => setAdding(false)}
          onCreated={(verified, kind) => {
            setAdding(false);
            reload();
            if (kind === "b2" && !verified) {
              setToast({
                message:
                  "Target added, but the bucket has no Object Lock: backups there can be deleted by anyone holding the keys.",
                bad: true,
              });
            }
          }}
        />
      )}
      {failed && (
        <div className="flex items-center gap-4">
          <p className="m-0 font-mono text-[12px] text-dim">Cannot reach the server; showing the last state.</p>
          <Button onClick={reload}>Try again</Button>
        </div>
      )}
      {toast && <Toast message={toast.message} tone={toast.bad ? "warn" : "ink"} onDismiss={() => setToast(null)} />}
    </div>
  );
}

/** The two kinds, as the Activate wizard also presents them. */
const KINDS = [
  {
    kind: "b2" as const,
    label: "Backblaze B2",
    note: "Off-site. Per-device keys that cannot delete. Object Lock required.",
  },
  {
    kind: "filesystem" as const,
    label: "A folder on this server",
    note: "Fast and local. No immutability. Good for a first test.",
  },
];

/** The kind picker, shared by this dialog and the Activate wizard's step 3. */
export function KindPicker({ kind, onPick }: { kind: Target["kind"]; onPick: (kind: Target["kind"]) => void }) {
  return (
    <fieldset className="m-0 grid grid-cols-2 gap-[14px] border-0 p-0">
      <legend className="text-muted mb-[6px] font-mono text-[11px] tracking-[0.12em] uppercase">Kind</legend>
      {KINDS.map((k) => (
        // Native radios: one tab stop for the group, arrow keys between the
        // options, and the label's text is the accessible name.
        <label
          key={k.kind}
          className={clsx(
            "flex cursor-pointer flex-col gap-[6px] border p-4",
            kind === k.kind ? "border-ember" : "border-line-strong hover:border-ink-soft",
          )}
        >
          <span className="flex items-center gap-[10px]">
            <input
              type="radio"
              name="target-kind"
              className="accent-ember"
              checked={kind === k.kind}
              onChange={() => onPick(k.kind)}
            />
            <span className="font-semibold">{k.label}</span>
          </span>
          <span className="text-muted">{k.note}</span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * The fields a target needs, without the surrounding form: the Activate
 * wizard collects exactly the same ones for the fleet's first target.
 */
export function TargetFields({ value, onChange }: { value: TargetInput; onChange: (t: TargetInput) => void }) {
  const set = (patch: Partial<TargetInput>) => onChange({ ...value, ...patch });
  return (
    <>
      <KindPicker
        kind={value.kind}
        onPick={(kind) =>
          // Switching kind drops the other kind's fields, credentials included.
          onChange({ name: value.name, kind })
        }
      />
      <Field label="Name">
        <Input value={value.name} autoComplete="off" onChange={(e) => set({ name: e.target.value })} />
      </Field>
      {value.kind === "filesystem" ? (
        <Field label="Path">
          <Input
            value={value.path ?? ""}
            autoComplete="off"
            placeholder="/tank/warphold"
            onChange={(e) => set({ path: e.target.value })}
          />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-[14px]">
          <Field label="Bucket">
            <Input value={value.bucket ?? ""} autoComplete="off" onChange={(e) => set({ bucket: e.target.value })} />
          </Field>
          <Field label="Region">
            <Input
              value={value.region ?? ""}
              autoComplete="off"
              placeholder="us-west-004"
              onChange={(e) => set({ region: e.target.value })}
            />
          </Field>
          <Field label="Admin key ID">
            <Input value={value.key_id ?? ""} autoComplete="off" onChange={(e) => set({ key_id: e.target.value })} />
          </Field>
          <Field label="Application key">
            {/* Write-only: it is sealed server-side and never sent back, so the
                field is a password input and nothing keeps it after the post. */}
            <Input
              type="password"
              value={value.key ?? ""}
              autoComplete="new-password"
              onChange={(e) => set({ key: e.target.value })}
            />
          </Field>
        </div>
      )}
    </>
  );
}

/** A target ready to post: empty optional fields are dropped, not sent blank. */
export function targetPayload(t: TargetInput): TargetInput {
  const out: TargetInput = { name: t.name.trim(), kind: t.kind };
  if (t.kind === "filesystem") {
    out.path = (t.path ?? "").trim();
    return out;
  }
  out.bucket = (t.bucket ?? "").trim();
  const region = (t.region ?? "").trim();
  if (region) {
    out.region = region;
  }
  out.key_id = (t.key_id ?? "").trim();
  out.key = t.key ?? "";
  return out;
}

/** Whether the fields carry everything the server requires for this kind. */
export function targetReady(t: TargetInput): boolean {
  if (t.name.trim() === "") {
    return false;
  }
  return t.kind === "filesystem"
    ? (t.path ?? "").trim() !== ""
    : Boolean(t.bucket?.trim() && t.key_id?.trim() && t.key);
}

// Mounted only while it is open, so the credential fields are created empty
// every time and nothing survives a close.
function AddTargetDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (verified: boolean, kind: Target["kind"]) => void;
}) {
  const [value, setValue] = useState<TargetInput>({ name: "", kind: "b2" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const created = await fleet.createTarget(targetPayload(value));
      // The key is dropped with the form state; it only ever existed here.
      setValue({ name: "", kind: "b2" });
      onCreated(created.object_lock_verified, value.kind);
    } catch (err) {
      setError(apiError(err, "Could not add the target."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Add target">
      <form onSubmit={submit} className="flex flex-col gap-[18px]">
        <TargetFields value={value} onChange={setValue} />
        {error && (
          <p role="alert" className="text-bad m-0 text-[13px]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !targetReady(value)}>
            Add target
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

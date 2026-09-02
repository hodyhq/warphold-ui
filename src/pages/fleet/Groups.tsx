import React, { useCallback, useEffect, useState } from "react";
import { Button, Card, Dialog, Eyebrow, Field, Input, Select } from "../../design/components";
import { apiError, fleet } from "../../api/fleet";
import type { AgentOut, CreatedToken, Group, Target, Template, TokenOut } from "../../api/types";
import { relativeUntil } from "../../lib/format";
import { EnrollCommand } from "./EnrollCommand";

/** How long a new enrollment token lives. The server refuses more than 30 days. */
const TTLS = [
  { seconds: 3600, label: "1 hour" },
  { seconds: 86_400, label: "24 hours" },
  { seconds: 604_800, label: "7 days" },
  { seconds: 2_592_000, label: "30 days" },
];

/** -1 is the server's "unlimited". */
const UNLIMITED = -1;

/** How a target reads on a group card. */
export function targetLabel(t: Target | undefined): string {
  if (!t) {
    return "—";
  }
  return t.kind === "b2" ? `B2 · ${t.bucket ?? t.name}` : `Filesystem · ${t.path ?? t.name}`;
}

/** A token still usable for an enrollment right now. */
function isLive(t: TokenOut, now: number): boolean {
  if (t.revoked_at !== null) {
    return false;
  }
  if (new Date(t.expires_at).getTime() <= now) {
    return false;
  }
  return t.max_uses < 0 || t.uses < t.max_uses;
}

/** "3 uses left", "single use" or "unlimited uses". */
export function usesLabel(t: TokenOut): string {
  if (t.max_uses < 0) {
    return "unlimited uses";
  }
  const left = Math.max(0, t.max_uses - t.uses);
  return t.max_uses === 1 && left === 1 ? "single use" : `${left} uses left`;
}

function tokenSummary(list: TokenOut[], now: number): string {
  const live = list.filter((t) => isLive(t, now));
  if (live.length === 0) {
    return "no active tokens";
  }
  const soonest = live.reduce((a, b) => (new Date(a.expires_at) <= new Date(b.expires_at) ? a : b));
  const count = `${live.length} token${live.length === 1 ? "" : "s"}`;
  return `${count} · expires in ${relativeUntil(soonest.expires_at, now)} · ${usesLabel(soonest)}`;
}

interface Loaded {
  groups: Group[];
  targets: Target[];
  templates: Template[];
  agents: AgentOut[];
  /** Tokens per group id; groups are few, so this is one call each. */
  tokens: Record<number, TokenOut[]>;
}

async function load(): Promise<Loaded> {
  const [groups, targets, templates, agents] = await Promise.all([
    fleet.groups(),
    fleet.targets(),
    fleet.templates(),
    fleet.agents(),
  ]);
  const lists = await Promise.all(groups.map((g) => fleet.tokens(g.id)));
  const tokens: Record<number, TokenOut[]> = {};
  groups.forEach((g, i) => {
    tokens[g.id] = lists[i] ?? [];
  });
  return { groups, targets, templates, agents, tokens };
}

/**
 * Groups, the Main.dc.html cards: a group is a target plus a policy template,
 * and it is what a device enrols into. Everything an admin does here is a
 * write, so the screen reloads after each one rather than polling.
 */
export function Groups() {
  const [data, setData] = useState<Loaded | null>(null);
  // Captured when the data lands rather than read during render: the token
  // countdowns only have to be right as of the load they belong to.
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [installing, setInstalling] = useState<Group | null>(null);
  const [listing, setListing] = useState<Group | null>(null);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    load().then(
      (d) => live && (setData(d), setNow(Date.now()), setFailed(false)),
      // A 401 has already sent the browser to the login page from the client's
      // interceptor; anything else is the server being unreachable.
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  if (!data) {
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

  const { groups, targets, templates, agents, tokens } = data;
  const members = (id: number) => agents.filter((a) => a.group_id === id && a.revoked_at === null).length;

  return (
    <div className="flex min-h-0 grow flex-col gap-[18px]">
      <div className="flex items-end justify-between gap-6">
        <div>
          <Eyebrow>Groups</Eyebrow>
          <h1 className="font-display m-0 mt-2 text-[36px] leading-none font-extrabold tracking-[-0.02em]">
            {groups.length === 0 ? "No groups yet" : `${groups.length} group${groups.length === 1 ? "" : "s"}`}
          </h1>
        </div>
        <Button variant={groups.length === 0 ? "primary" : "default"} onClick={() => setCreating(true)}>
          New group
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="text-muted m-0 max-w-[60ch]">
          A group ties a target to a policy template. Devices enrol into a group, and everything in it backs up the
          same way, to the same place.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-[18px]">
          {groups.map((g) => {
            const count = members(g.id);
            return (
              <Card key={g.id} data-testid={`group-${g.name}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-display truncate text-[18px] font-semibold">{g.name}</span>
                  <span className="text-muted shrink-0 font-mono text-[12px]">
                    {count} device{count === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="text-muted">
                  Target <span className="text-ink">{targetLabel(targets.find((t) => t.id === g.target_id))}</span>
                  <br />
                  Policy <span className="text-ink">{templates.find((t) => t.id === g.template_id)?.name ?? "—"}</span>
                </div>
                <div className="mt-1 flex gap-2">
                  <Button variant="primary" onClick={() => setInstalling(g)}>
                    Download installer
                  </Button>
                  <Button onClick={() => setListing(g)}>Tokens</Button>
                </div>
                <div className="text-dim border-line border-t pt-[10px] font-mono text-[12px]">
                  {tokenSummary(tokens[g.id] ?? [], now)}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {failed && (
        <div className="flex items-center gap-4">
          <p className="m-0 font-mono text-[12px] text-dim">Cannot reach the server; showing the last state.</p>
          <Button onClick={reload}>Try again</Button>
        </div>
      )}

      {creating && (
        <NewGroupDialog
          targets={targets}
          templates={templates}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {installing && (
        <InstallerDialog
          group={installing}
          onClose={() => {
            setInstalling(null);
            reload();
          }}
        />
      )}
      {listing && (
        <TokensDialog
          group={listing}
          tokens={tokens[listing.id] ?? []}
          onClose={() => {
            setListing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

// Mounted only while it is open, so every opening starts from these
// defaults - the first target and template, which puts a one-target fleet one
// field away from a group.
function NewGroupDialog({
  targets,
  templates,
  onClose,
  onCreated,
}: {
  targets: Target[];
  templates: Template[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [targetID, setTargetID] = useState(() => (targets[0] ? String(targets[0].id) : ""));
  const [templateID, setTemplateID] = useState(() => (templates[0] ? String(templates[0].id) : ""));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await fleet.createGroup(name.trim(), Number(targetID), Number(templateID));
      onCreated();
    } catch (err) {
      setError(apiError(err, "Could not create the group."));
    } finally {
      setBusy(false);
    }
  }

  const ready = name.trim() !== "" && targetID !== "" && templateID !== "";

  return (
    <Dialog open onClose={onClose} title="New group">
      <form onSubmit={submit} className="flex flex-col gap-[18px]">
        <Field label="Name">
          <Input value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Target">
          <Select value={targetID} onChange={(e) => setTargetID(e.target.value)}>
            {targets.length === 0 && <option value="">No targets yet</option>}
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {targetLabel(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Policy template">
          <Select value={templateID} onChange={(e) => setTemplateID(e.target.value)}>
            {templates.length === 0 && <option value="">No templates yet</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        {error && (
          <p role="alert" className="text-bad m-0 text-[13px]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !ready}>
            Create group
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * The Add device overlay: issue a token, then show the command to run. The
 * token is only ever readable here - the list endpoint never returns it again.
 */
function InstallerDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const [ttl, setTTL] = useState(String(TTLS[0].seconds));
  const [uses, setUses] = useState("1");
  const [issued, setIssued] = useState<CreatedToken | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function issue() {
    setError("");
    setBusy(true);
    try {
      setIssued(await fleet.createToken(group.id, Number(ttl), Number(uses)));
    } catch (err) {
      setError(apiError(err, "Could not create the token."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Enroll a machine into ${group.name}`}>
      {issued ? (
        <>
          <EnrollCommand token={issued.token} />
          <p className="text-dim m-0 font-mono text-[11px] leading-[1.6]">
            Installs the agent for the current user, enables it at boot and enrols it into {group.name}. This token is
            shown once; issue another if it is lost.
          </p>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-[14px]">
            <Field label="Token lasts">
              <Select value={ttl} onChange={(e) => setTTL(e.target.value)}>
                {TTLS.map((t) => (
                  <option key={t.seconds} value={t.seconds}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Uses">
              <Select value={uses} onChange={(e) => setUses(e.target.value)}>
                <option value="1">1</option>
                <option value={UNLIMITED}>Unlimited</option>
              </Select>
            </Field>
          </div>
          <p className="text-dim m-0 font-mono text-[11px] leading-[1.6]">
            Longer tokens and multi-use tokens are for rollouts that take days; anyone holding one can enrol a machine
            into {group.name}.
          </p>
          {error && (
            <p role="alert" className="text-bad m-0 text-[13px]">
              {error}
            </p>
          )}
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Close</Button>
        {!issued && (
          <Button variant="primary" disabled={busy} onClick={issue}>
            Create token
          </Button>
        )}
      </div>
    </Dialog>
  );
}

function TokensDialog({ group, tokens, onClose }: { group: Group; tokens: TokenOut[]; onClose: () => void }) {
  const [revoked, setRevoked] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());

  async function revoke(id: number) {
    setError("");
    try {
      await fleet.revokeToken(id);
      setRevoked((ids) => [...ids, id]);
    } catch (err) {
      setError(apiError(err, "Could not revoke the token."));
    }
  }

  return (
    <Dialog open onClose={onClose} title={`${group.name} tokens`}>
      {tokens.length === 0 ? (
        <p className="text-muted m-0">This group has never had a token.</p>
      ) : (
        <div className="flex flex-col">
          {tokens.map((t) => {
            const dead = t.revoked_at !== null || revoked.includes(t.id);
            return (
              <div key={t.id} className="border-line flex items-center justify-between gap-4 border-b py-3">
                <div className="font-mono text-[12px]">
                  <div>
                    {dead ? "revoked" : `expires in ${relativeUntil(t.expires_at, now)}`} · {usesLabel(t)}
                  </div>
                  <div className="text-dim">
                    {t.uses} enrolment{t.uses === 1 ? "" : "s"} so far
                  </div>
                </div>
                <Button variant="danger" disabled={dead} onClick={() => revoke(t.id)}>
                  Revoke
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {error && (
        <p role="alert" className="text-bad m-0 text-[13px]">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Dialog>
  );
}

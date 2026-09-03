import React, { useCallback, useEffect, useState } from "react";
import { Button, Card, Checkbox, Dialog, Eyebrow, Field, Input, Select, Toast } from "../../design/components";
import { apiError, fleet } from "../../api/fleet";
import type { Admin, Settings as FleetSettings } from "../../api/types";

/**
 * Agent poll intervals worth offering. The server accepts 15..3600 seconds;
 * a stored value outside this list is added to it rather than rounded away.
 */
const POLL_CHOICES = [
  { seconds: 60, label: "1 minute" },
  { seconds: 300, label: "5 minutes" },
  { seconds: 900, label: "15 minutes" },
  { seconds: 1800, label: "30 minutes" },
  { seconds: 3600, label: "1 hour" },
];

function pollLabel(seconds: number): string {
  const known = POLL_CHOICES.find((c) => c.seconds === seconds);
  return known ? known.label : `${seconds} seconds`;
}

/** Presets offered for the background-job intervals, which run far less often
 * than the agent poll. Each field filters this list down to its own minimum. */
const INTERVAL_CHOICES = [
  { seconds: 300, label: "5 minutes" },
  { seconds: 900, label: "15 minutes" },
  { seconds: 1_800, label: "30 minutes" },
  { seconds: 3_600, label: "1 hour" },
  { seconds: 6 * 3_600, label: "6 hours" },
  { seconds: 12 * 3_600, label: "12 hours" },
  { seconds: 86_400, label: "1 day" },
  { seconds: 3 * 86_400, label: "3 days" },
  { seconds: 7 * 86_400, label: "7 days" },
  { seconds: 14 * 86_400, label: "14 days" },
  { seconds: 30 * 86_400, label: "30 days" },
];

function intervalLabel(seconds: number): string {
  const known = INTERVAL_CHOICES.find((c) => c.seconds === seconds);
  if (known) {
    return known.label;
  }
  if (seconds % 86_400 === 0) {
    return `${seconds / 86_400} days`;
  }
  if (seconds % 3_600 === 0) {
    return `${seconds / 3_600} hours`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60} minutes`;
  }
  return `${seconds} seconds`;
}

interface IntervalSpec {
  key: keyof FleetSettings;
  label: string;
  help: string;
  min: number;
  def: number;
}

/**
 * The scheduler's job kinds and the setting each reads (`fleet/jobs/scheduler.go`
 * `intervals`); stats and digest are Task 31's fleet-wide jobs, built alongside
 * this screen. Defaults/minimums are copied from that map, not guessed.
 */
const JOB_INTERVALS: IntervalSpec[] = [
  { key: "mirror_interval", label: "Mirror", help: "Disk target to the offsite copy.", min: 300, def: 3_600 },
  { key: "verify_interval", label: "Verify", help: "Fleet-wide integrity check.", min: 3_600, def: 7 * 86_400 },
  {
    key: "test_restore_interval",
    label: "Test restore",
    help: "Proves a backup actually restores.",
    min: 3_600,
    def: 30 * 86_400,
  },
  {
    key: "maintenance_interval",
    label: "Maintenance",
    help: "Repository compaction and garbage collection.",
    min: 3_600,
    def: 86_400,
  },
  { key: "stats_interval", label: "Stats", help: "Repository size and dedup ratio.", min: 3_600, def: 86_400 },
  {
    key: "digest_interval",
    label: "Digest email",
    help: "The weekly summary, to every admin.",
    min: 3_600,
    def: 7 * 86_400,
  },
];

/**
 * Settings, the Main.dc.html cards. Two of them are live (the fleet name and
 * the agent poll interval, both through the settings endpoint) plus the admin
 * list; the rest state plainly what they are waiting on rather than offering
 * a control that would do nothing.
 */
export function Settings() {
  const [settings, setSettings] = useState<FleetSettings | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [toast, setToast] = useState<{ message: string; bad: boolean } | null>(null);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    Promise.all([fleet.settings(), fleet.admins()]).then(
      ([s, a]) => {
        if (live) {
          setSettings(s);
          setAdmins(a);
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

  if (!settings) {
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

  return (
    <div className="flex min-h-0 grow flex-col gap-[18px]">
      <div>
        <Eyebrow>Settings</Eyebrow>
        <h1 className="font-display m-0 mt-2 text-[28px] leading-none font-extrabold tracking-[-0.02em] md:text-[36px]">
          This fleet
        </h1>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <FleetNameCard
          settings={settings}
          onSaved={(s) => {
            setSettings(s);
            setToast({ message: "Fleet name saved.", bad: false });
          }}
          onError={(message) => setToast({ message, bad: true })}
        />
        <AdminsCard admins={admins} onChanged={reload} onError={(message) => setToast({ message, bad: true })} />
        <AgentsCard settings={settings} onSaved={setSettings} onError={(message) => setToast({ message, bad: true })} />
        <Card>
          <span className="font-display text-[18px] font-semibold">Sealing passphrase</span>
          <div className="text-muted">
            Every repository password and storage key is sealed with this. Losing it means losing the escrow, not the
            backups: each device&apos;s recovery kit still works.
          </div>
          <Button disabled title="Rotation ships with the recovery kit" className="self-start">
            Change passphrase
          </Button>
          <div className="text-dim font-mono text-[12px]">
            Rotating it means re-sealing every stored credential, so it ships with the recovery kit in a later version.
          </div>
        </Card>
        <JobsCard settings={settings} onSaved={setSettings} onError={(message) => setToast({ message, bad: true })} />
        <SmtpCard settings={settings} onSaved={setSettings} onError={(message) => setToast({ message, bad: true })} />
      </div>
      {toast && <Toast message={toast.message} tone={toast.bad ? "bad" : "ink"} onDismiss={() => setToast(null)} />}
    </div>
  );
}

function FleetNameCard({
  settings,
  onSaved,
  onError,
}: {
  settings: FleetSettings;
  onSaved: (s: FleetSettings) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(settings.fleet_name);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      onSaved(await fleet.setSetting("fleet_name", name.trim()));
    } catch (err) {
      onError(apiError(err, "Could not save the fleet name."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <span className="font-display text-[18px] font-semibold">Fleet name</span>
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Name">
          <Input
            value={name}
            maxLength={64}
            autoComplete="off"
            placeholder="home-fleet"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={busy} className="self-start">
          Save
        </Button>
      </form>
      <div className="text-dim font-mono text-[12px]">Shown in the header and on the weekly digest.</div>
    </Card>
  );
}

function AdminsCard({
  admins,
  onChanged,
  onError,
}: {
  admins: Admin[];
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [inviting, setInviting] = useState(false);
  const [deleting, setDeleting] = useState<Admin | null>(null);

  return (
    <Card>
      <span className="font-display text-[18px] font-semibold">Admins</span>
      <div className="flex flex-col">
        {admins.map((a) => (
          <div key={a.id} className="border-line flex items-center justify-between gap-4 border-b py-[10px]">
            <span className="truncate">{a.email}</span>
            <div className="flex items-center gap-3">
              <span className="text-muted font-mono text-[12px]">{a.role}</span>
              <Button variant="ghost" onClick={() => setDeleting(a)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Button className="self-start" onClick={() => setInviting(true)}>
        Invite admin
      </Button>
      <div className="text-dim font-mono text-[12px]">
        Admins sign in to this dashboard. Agents never do; they use their own tokens.
      </div>
      {inviting && (
        <InviteDialog
          onClose={() => setInviting(false)}
          onInvited={() => {
            setInviting(false);
            onChanged();
          }}
        />
      )}
      {deleting && (
        <RemoveAdminDialog
          admin={deleting}
          onClose={() => setDeleting(null)}
          onRemoved={() => {
            setDeleting(null);
            onChanged();
          }}
          onError={(message) => {
            setDeleting(null);
            onError(message);
          }}
        />
      )}
    </Card>
  );
}

function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await fleet.inviteAdmin(email.trim(), password);
      onInvited();
    } catch (err) {
      setError(apiError(err, "Could not create the admin."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Invite admin">
      <form onSubmit={submit} className="flex flex-col gap-[18px]">
        <Field label="Email">
          <Input type="email" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="First password">
          {/* There is no invitation email yet: the password is set here and
              handed over out of band, so it is typed, not generated silently. */}
          <Input
            type="password"
            value={password}
            autoComplete="new-password"
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <p className="text-dim m-0 font-mono text-[11px] leading-[1.6]">
          At least 8 characters. Give it to them over a channel you trust; they can change it after signing in.
        </p>
        {error && (
          <p role="alert" className="text-bad m-0 text-[13px]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || email.trim() === "" || password.length < 8}>
            Create admin
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Removing an admin is refused server-side for the last one (409) and for
 * yourself; the server's message is what the admin gets to read.
 */
function RemoveAdminDialog({
  admin,
  onClose,
  onRemoved,
  onError,
}: {
  admin: Admin;
  onClose: () => void;
  onRemoved: () => void;
  onError: (message: string) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove() {
    setError("");
    setBusy(true);
    try {
      await fleet.deleteAdmin(admin.id);
      onRemoved();
    } catch (err) {
      const message = apiError(err, "Could not remove the admin.");
      if ((err as { response?: { status?: number } })?.response?.status === 409) {
        // The last admin, or yourself: staying open with the reason beats a
        // toast that disappears while the admin is still reading it.
        setError(message);
      } else {
        onError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Remove ${admin.email}?`}>
      <p className="text-ink-soft m-0">
        They lose access to this dashboard at once. Devices, groups and backups are untouched.
      </p>
      {error && (
        <p role="alert" className="text-bad m-0 text-[13px]">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="danger" disabled={busy} onClick={remove}>
          Remove admin
        </Button>
      </div>
    </Dialog>
  );
}

function AgentsCard({
  settings,
  onSaved,
  onError,
}: {
  settings: FleetSettings;
  onSaved: (s: FleetSettings) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const choices = POLL_CHOICES.some((c) => c.seconds === settings.poll_interval)
    ? POLL_CHOICES
    : [...POLL_CHOICES, { seconds: settings.poll_interval, label: pollLabel(settings.poll_interval) }];

  async function pick(seconds: number) {
    setBusy(true);
    try {
      onSaved(await fleet.setSetting("poll_interval", seconds));
    } catch (err) {
      onError(apiError(err, "Could not save the poll interval."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <span className="font-display text-[18px] font-semibold">Agents</span>
      <Field label="Poll interval">
        <Select
          value={settings.poll_interval}
          disabled={busy}
          onChange={(e) => {
            void pick(Number(e.target.value));
          }}
        >
          {[...choices]
            .sort((a, b) => a.seconds - b.seconds)
            .map((c) => (
              <option key={c.seconds} value={c.seconds}>
                {c.label}
              </option>
            ))}
        </Select>
      </Field>
      <div className="text-dim font-mono text-[12px]">
        How often a device asks for work. Each one picks the new interval up at its next check-in.
      </div>
      <Field label="Health thresholds">
        {/* fleet/health: green for 26 h, yellow to 7 d, red after. Fixed for
            now - a per-fleet threshold is a later version. */}
        <Input readOnly value="stale after 26 h · failing after 7 d" className="font-mono text-[12px]" />
      </Field>
    </Card>
  );
}

/** One background-job interval: a preset dropdown plus a raw-seconds field
 * for a value the presets don't offer, both saving immediately. */
function IntervalField({
  spec,
  settings,
  onSaved,
  onError,
}: {
  spec: IntervalSpec;
  settings: FleetSettings;
  onSaved: (s: FleetSettings) => void;
  onError: (message: string) => void;
}) {
  const stored = (settings[spec.key] as number | undefined) ?? spec.def;
  // Reinitialized on every save via this component's `key` (see JobsCard),
  // so no effect is needed to resync it with the settings prop.
  const [raw, setRaw] = useState(String(stored));
  const [busy, setBusy] = useState(false);

  const choices = INTERVAL_CHOICES.filter((c) => c.seconds >= spec.min);
  const options = choices.some((c) => c.seconds === stored)
    ? choices
    : [...choices, { seconds: stored, label: intervalLabel(stored) }].sort((a, b) => a.seconds - b.seconds);

  async function save(seconds: number) {
    if (!Number.isInteger(seconds) || seconds < spec.min) {
      onError(`${spec.label} must be at least ${intervalLabel(spec.min)}.`);
      return;
    }
    setBusy(true);
    try {
      onSaved(await fleet.setSetting(spec.key, seconds));
    } catch (err) {
      onError(apiError(err, `Could not save the ${spec.label.toLowerCase()} interval.`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-[6px]">
      <Eyebrow>{spec.label}</Eyebrow>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label={spec.label} value={stored} disabled={busy} onChange={(e) => void save(Number(e.target.value))}>
          {options.map((o) => (
            <option key={o.seconds} value={o.seconds}>
              {o.label}
            </option>
          ))}
        </Select>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save(Number(raw));
          }}
        >
          <Input
            aria-label={`${spec.label} in seconds`}
            className="w-[100px] font-mono text-[12px]"
            inputMode="numeric"
            value={raw}
            disabled={busy}
            onChange={(e) => setRaw(e.target.value.replace(/\D/g, ""))}
          />
          <Button type="submit" disabled={busy || raw === ""}>
            Set
          </Button>
        </form>
      </div>
      <div className="text-dim font-mono text-[11px]">{spec.help}</div>
    </div>
  );
}

/** Revoked-device retention, the one interval that is whole days, not
 * seconds (`revoked_retention_days`, `fleet/jobs/reap.go`). */
function RetentionField({
  settings,
  onSaved,
  onError,
}: {
  settings: FleetSettings;
  onSaved: (s: FleetSettings) => void;
  onError: (message: string) => void;
}) {
  const stored = settings.revoked_retention_days ?? 30;
  // Reinitialized on save via this component's `key` (see JobsCard).
  const [days, setDays] = useState(String(stored));
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 3650) {
      onError("Revoked device retention must be between 1 and 3650 days.");
      return;
    }
    setBusy(true);
    try {
      onSaved(await fleet.setSetting("revoked_retention_days", n));
    } catch (err) {
      onError(apiError(err, "Could not save the retention window."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-[6px] border-t border-line pt-3">
      <Eyebrow>Revoked device retention</Eyebrow>
      <form onSubmit={save} className="flex items-center gap-2">
        <Input
          aria-label="Revoked device retention in days"
          className="w-[100px] font-mono text-[12px]"
          inputMode="numeric"
          value={days}
          disabled={busy}
          onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))}
        />
        <span className="text-dim font-mono text-[12px]">days</span>
        <Button type="submit" disabled={busy || days === ""}>
          Save
        </Button>
      </form>
      <div className="text-dim font-mono text-[11px]">
        How long a revoked device&apos;s repository is kept before the reap job deletes it.
      </div>
    </div>
  );
}

/** Fleet-wide, not per-device: POSTs digest with no agent id. */
function DigestButton({ onError }: { onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    setBusy(true);
    setSent(false);
    try {
      await fleet.createJob("digest");
      setSent(true);
    } catch (err) {
      onError(apiError(err, "Could not queue the digest."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button disabled={busy} onClick={() => void send()}>
        Send digest now
      </Button>
      {sent && <span className="text-dim font-mono text-[11px]">Queued.</span>}
    </div>
  );
}

function JobsCard({
  settings,
  onSaved,
  onError,
}: {
  settings: FleetSettings;
  onSaved: (s: FleetSettings) => void;
  onError: (message: string) => void;
}) {
  return (
    <Card>
      <span className="font-display text-[18px] font-semibold">Background jobs</span>
      <div className="text-muted">How often each job runs on its own; no cron needed.</div>
      <div className="flex flex-col gap-4">
        {JOB_INTERVALS.map((spec) => (
          // Keyed on the stored value (not just spec.key) so a save remounts
          // the field with the new value as its initial state, instead of an
          // effect reaching back to resync local state after the fact.
          <IntervalField
            key={`${spec.key}:${(settings[spec.key] as number | undefined) ?? spec.def}`}
            spec={spec}
            settings={settings}
            onSaved={onSaved}
            onError={onError}
          />
        ))}
        <RetentionField
          key={settings.revoked_retention_days ?? 30}
          settings={settings}
          onSaved={onSaved}
          onError={onError}
        />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-muted">Weekly digest, right now</span>
        <DigestButton onError={onError} />
      </div>
    </Card>
  );
}

/** The ports the settings screen offers (`mail.AllowedPorts`), SMTP2GO's default first. */
const SMTP_PORTS = [
  { value: 2525, label: "2525 (SMTP2GO default)" },
  { value: 587, label: "587 (STARTTLS)" },
  { value: 465, label: "465 (implicit TLS)" },
];

function SmtpCard({
  settings,
  onSaved,
  onError,
}: {
  settings: FleetSettings;
  onSaved: (s: FleetSettings) => void;
  onError: (message: string) => void;
}) {
  const [host, setHost] = useState(settings.smtp_host ?? "");
  const [port, setPort] = useState(settings.smtp_port ?? SMTP_PORTS[0].value);
  const [username, setUsername] = useState(settings.smtp_username ?? "");
  const [from, setFrom] = useState(settings.smtp_from ?? "");
  // Write-only: never seeded from settings, which never carries the password
  // back - only smtp_password_set says whether one is stored.
  const [password, setPassword] = useState("");
  const [tls, setTls] = useState(settings.smtp_tls ?? true);
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await fleet.setSettings({
        smtp_host: host.trim(),
        smtp_port: port,
        smtp_username: username.trim(),
        smtp_from: from.trim(),
        smtp_tls: tls,
        // "" (untouched) is left off the request; the server takes "leave it
        // alone" as absence, not as an empty string.
        ...(password !== "" ? { smtp_password: password } : {}),
      });
      onSaved(saved);
      setPassword("");
    } catch (err) {
      onError(apiError(err, "Could not save the SMTP settings."));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    setTestBusy(true);
    setTestResult(null);
    try {
      await fleet.smtpTest(testTo.trim());
      setTestResult({ ok: true, message: "Sent. Check the inbox." });
    } catch (err) {
      // The server's own SMTP error is the whole diagnosis (see
      // handleSMTPTest); apiError already reads it back verbatim.
      setTestResult({ ok: false, message: apiError(err, "Could not send the test email.") });
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <Card>
      <span className="font-display text-[18px] font-semibold">SMTP</span>
      <div className="text-muted">Outbound mail for the test message and the weekly digest.</div>
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Host">
          <Input value={host} autoComplete="off" onChange={(e) => setHost(e.target.value)} />
        </Field>
        <Field label="Port">
          <Select value={port} onChange={(e) => setPort(Number(e.target.value))}>
            {SMTP_PORTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Username">
          <Input value={username} autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="From address">
          <Input type="email" value={from} autoComplete="off" onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            autoComplete="new-password"
            placeholder={settings.smtp_password_set ? "Leave blank to keep the stored password" : "Not set"}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="text-dim font-mono text-[12px]">
          {settings.smtp_password_set ? "A password is set." : "No password is set."} It is sealed at rest and never
          sent back to this screen.
        </div>
        <Checkbox checked={tls} onChange={(e) => setTls(e.target.checked)} label="Use TLS" />
        <Button type="submit" variant="primary" disabled={busy} className="self-start">
          Save
        </Button>
      </form>
      <form onSubmit={sendTest} className="flex flex-col gap-3 border-t border-line pt-3">
        <Field label="Send test email to">
          <Input type="email" value={testTo} autoComplete="off" onChange={(e) => setTestTo(e.target.value)} />
        </Field>
        <Button type="submit" disabled={testBusy || testTo.trim() === ""} className="self-start">
          Send test email
        </Button>
        {testResult && (
          <p role="alert" className={testResult.ok ? "m-0 text-[13px] text-good" : "m-0 text-[13px] text-bad"}>
            {testResult.message}
          </p>
        )}
      </form>
    </Card>
  );
}

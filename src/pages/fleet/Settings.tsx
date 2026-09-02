import React, { useCallback, useEffect, useState } from "react";
import { Button, Card, Dialog, Eyebrow, Field, Input, Select, Toast } from "../../design/components";
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
        <h1 className="font-display m-0 mt-2 text-[36px] leading-none font-extrabold tracking-[-0.02em]">This fleet</h1>
      </div>
      <div className="grid grid-cols-2 gap-6">
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
        <Card>
          <span className="font-display text-[18px] font-semibold">Weekly digest</span>
          <div className="text-muted">
            One email a week: what backed up, what did not, and which devices have gone quiet.
          </div>
          <div className="text-dim font-mono text-[12px]">Arrives in a later version, with SMTP settings.</div>
        </Card>
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

import React, { useState } from "react";
import { useNavigate } from "react-router";
import clsx from "clsx";
import { Button, Card, Checkbox, Eyebrow, Field, Input } from "../../design/components";
import { apiError, fleet, proxyRequirements } from "../../api/fleet";
import type { KopiaPolicy, StorageMode, TargetInput } from "../../api/types";
import { EnrollCommand } from "./EnrollCommand";
import { Mark } from "./Mark";

const STEPS = ["Passphrase", "First admin", "Public URL", "Storage", "Done"];
const MIN_SECRET = 8;

/**
 * The names a fresh fleet starts with. They are deliberately the ones
 * `SetupDefaults` uses in the server (fleet/api/setupdefaults.go), so a fleet
 * the installer set up and a fleet this wizard set up look identical.
 */
const FIRST_TEMPLATE: { name: string; sources: string[]; policy: KopiaPolicy } = {
  name: "Home",
  sources: ["~"],
  policy: {
    retention: { keepLatest: 10, keepHourly: 24, keepDaily: 14, keepWeekly: 8, keepMonthly: 12, keepAnnual: 2 },
  },
};
const FIRST_GROUP = "Devices";
const DISK_TARGET_NAME = "Fleet disk";
const CLOUD_TARGET_NAME = "Cloud storage";

/** The first enrollment token: one machine, one hour. */
const FIRST_TOKEN_TTL = 3600;

/** Where a hosted target keeps device repositories unless an admin says otherwise. */
const DEFAULT_HOSTED_ROOT = "/srv/warphold/hosted";

/** Said wherever a bucket is asked for: the gateway needs it to be append-only. */
const OBJECT_LOCK_NOTE = "Object Lock must be enabled on the bucket.";

/** Everything step 4 collects. Credentials live here and nowhere else. */
interface Storage {
  mode: StorageMode;
  path: string;
  mirror: boolean;
  mirrorKind: "b2" | "s3";
  mirrorBucket: string;
  mirrorRegion: string;
  mirrorKeyID: string;
  mirrorKey: string;
  cloudKind: "b2" | "s3";
  endpoint: string;
  bucket: string;
  region: string;
  keyID: string;
  key: string;
}

const EMPTY_STORAGE: Storage = {
  mode: "disk",
  path: DEFAULT_HOSTED_ROOT,
  mirror: false,
  mirrorKind: "b2",
  mirrorBucket: "",
  mirrorRegion: "",
  mirrorKeyID: "",
  mirrorKey: "",
  cloudKind: "b2",
  endpoint: "",
  bucket: "",
  region: "",
  keyID: "",
  key: "",
};

/** The hosted target these fields describe, ready to post. */
function storagePayload(s: Storage): TargetInput {
  if (s.mode === "disk") {
    const out: TargetInput = {
      name: DISK_TARGET_NAME,
      kind: "hosted",
      storage_mode: "disk",
      path: s.path.trim(),
    };
    if (s.mirror) {
      out.mirror_kind = s.mirrorKind;
      out.mirror_bucket = s.mirrorBucket.trim();
      out.mirror_region = s.mirrorRegion.trim();
      out.mirror_key_id = s.mirrorKeyID.trim();
      out.mirror_key = s.mirrorKey;
    }
    return out;
  }
  const out: TargetInput = {
    name: CLOUD_TARGET_NAME,
    kind: "hosted",
    storage_mode: "cloud",
    bucket: s.bucket.trim(),
    region: s.region.trim(),
    key_id: s.keyID.trim(),
    key: s.key,
  };
  // An empty endpoint is how the server is told "this is Backblaze B2"; for
  // anything else the host has to be spelled out.
  if (s.cloudKind === "s3") {
    out.endpoint = s.endpoint.trim();
  }
  return out;
}

/** What survives step 4, whether it finished or was skipped: mode and path, never a credential. */
export function scrubStorage(s: Storage): Storage {
  return { ...EMPTY_STORAGE, mode: s.mode, path: s.path };
}

/** Whether step 4 carries everything the server requires for this mode. */
function storageReady(s: Storage): boolean {
  if (s.mode === "disk") {
    return (
      s.path.trim() !== "" &&
      (!s.mirror || Boolean(s.mirrorBucket.trim() && s.mirrorRegion.trim() && s.mirrorKeyID.trim() && s.mirrorKey))
    );
  }
  return (
    Boolean(s.bucket.trim() && s.region.trim() && s.keyID.trim() && s.key) &&
    (s.cloudKind === "b2" || s.endpoint.trim() !== "")
  );
}

function Rail({ step }: { step: number }) {
  return (
    <aside className="bg-panel border-line box-border flex w-full shrink-0 flex-col gap-[6px] border-b px-5 py-6 md:w-[300px] md:border-r md:border-b-0 md:px-8 md:py-9">
      <div className="mb-[26px] flex items-center gap-[10px]">
        <Mark size={24} />
        <span className="font-display text-[15px] font-extrabold">ACTIVATE FLEET</span>
      </div>
      <ol className="m-0 flex list-none flex-row flex-wrap gap-x-5 gap-y-0 p-0 md:flex-col md:gap-[6px]">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const tone =
            n === step ? "text-ember border-ember" : n < step ? "text-good border-good" : "text-dim border-line-strong";
          return (
            <li
              key={label}
              className="flex shrink-0 items-center gap-3 py-3"
              aria-current={n === step ? "step" : undefined}
            >
              <span
                className={clsx(
                  "font-display flex h-7 w-7 items-center justify-center border text-[14px] font-extrabold",
                  tone,
                )}
              >
                {n}
              </span>
              <span className={clsx("font-semibold", tone.split(" ")[0])}>{label}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-dim mt-auto m-0 hidden font-mono text-[11px] leading-[1.6] md:block">
        Nothing to download. Fleet is already inside this WarpHold; this turns it on.
      </p>
    </aside>
  );
}

/** The kind picker shape the rest of the app uses, for a two-option choice. */
function Choice<T extends string>({
  name,
  value,
  options,
  onPick,
}: {
  name: string;
  value: T;
  options: { value: T; label: string; note: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <fieldset className="m-0 grid grid-cols-1 gap-[14px] border-0 p-0 sm:grid-cols-2">
      {options.map((o) => (
        <label
          key={o.value}
          className={clsx(
            "flex cursor-pointer flex-col gap-[6px] border p-4",
            value === o.value ? "border-ember" : "border-line-strong hover:border-ink-soft",
          )}
        >
          <span className="flex items-center gap-[10px]">
            <input
              type="radio"
              name={name}
              className="accent-ember"
              checked={value === o.value}
              onChange={() => onPick(o.value)}
            />
            <span className="font-semibold">{o.label}</span>
          </span>
          <span className="text-muted">{o.note}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Bucket, region and the admin key: the same four fields for a mirror and for cloud-direct. */
function BucketFields({
  bucket,
  region,
  keyID,
  onChange,
  onKey,
}: {
  bucket: string;
  region: string;
  keyID: string;
  onChange: (patch: { bucket?: string; region?: string; keyID?: string }) => void;
  onKey: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
      <Field label="Bucket">
        <Input value={bucket} autoComplete="off" onChange={(e) => onChange({ bucket: e.target.value })} />
      </Field>
      <Field label="Region">
        <Input
          value={region}
          autoComplete="off"
          placeholder="us-west-004"
          onChange={(e) => onChange({ region: e.target.value })}
        />
      </Field>
      <Field label="Key ID">
        <Input value={keyID} autoComplete="off" onChange={(e) => onChange({ keyID: e.target.value })} />
      </Field>
      <Field label="Application key">
        {/* Write-only: the server seals it and never sends it back, so it is a
            password input and nothing outside this form's state keeps it. */}
        <Input type="password" autoComplete="new-password" onChange={(e) => onKey(e.target.value)} />
      </Field>
    </div>
  );
}

/** Step 4's fields: Fleet disk with an optional mirror, or cloud-direct. */
function StorageFields({ value, onChange }: { value: Storage; onChange: (s: Storage) => void }) {
  const set = (patch: Partial<Storage>) => onChange({ ...value, ...patch });
  return (
    <>
      <Choice<StorageMode>
        name="storage-mode"
        value={value.mode}
        onPick={(mode) => set({ mode })}
        options={[
          {
            value: "disk",
            label: "Fleet disk",
            note: "Devices back up to this server. Fast, and no cloud account. Mirror it offsite below.",
          },
          {
            value: "cloud",
            label: "Cloud-direct",
            note: "This server writes every device's blobs straight through to your own bucket.",
          },
        ]}
      />

      {value.mode === "disk" ? (
        <>
          <Field label="Path on this server">
            <Input value={value.path} autoComplete="off" onChange={(e) => set({ path: e.target.value })} />
          </Field>
          <Checkbox
            label="Also mirror to a bucket"
            checked={value.mirror}
            onChange={(e) => set({ mirror: e.target.checked })}
          />
          {value.mirror && (
            <>
              <Choice<"b2" | "s3">
                name="mirror-kind"
                value={value.mirrorKind}
                onPick={(mirrorKind) => set({ mirrorKind })}
                options={[
                  { value: "b2", label: "Backblaze B2", note: "The endpoint is derived from the region." },
                  { value: "s3", label: "Amazon S3", note: "The endpoint is derived from the region." },
                ]}
              />
              <BucketFields
                bucket={value.mirrorBucket}
                region={value.mirrorRegion}
                keyID={value.mirrorKeyID}
                onChange={(p) =>
                  set({
                    ...(p.bucket !== undefined && { mirrorBucket: p.bucket }),
                    ...(p.region !== undefined && { mirrorRegion: p.region }),
                    ...(p.keyID !== undefined && { mirrorKeyID: p.keyID }),
                  })
                }
                onKey={(mirrorKey) => set({ mirrorKey })}
              />
              <p className="text-dim m-0 font-mono text-[11px]">{OBJECT_LOCK_NOTE}</p>
            </>
          )}
        </>
      ) : (
        <>
          <Choice<"b2" | "s3">
            name="cloud-kind"
            value={value.cloudKind}
            onPick={(cloudKind) => set({ cloudKind })}
            options={[
              { value: "b2", label: "Backblaze B2", note: "The endpoint is derived from the region." },
              { value: "s3", label: "S3-compatible", note: "Amazon S3, MinIO, anything that speaks S3." },
            ]}
          />
          {value.cloudKind === "s3" && (
            <Field label="Endpoint">
              <Input
                value={value.endpoint}
                autoComplete="off"
                placeholder="s3.us-east-1.amazonaws.com"
                onChange={(e) => set({ endpoint: e.target.value })}
              />
            </Field>
          )}
          <BucketFields
            bucket={value.bucket}
            region={value.region}
            keyID={value.keyID}
            onChange={(p) => set(p)}
            onKey={(key) => set({ key })}
          />
          <p className="text-dim m-0 font-mono text-[11px]">{OBJECT_LOCK_NOTE}</p>
        </>
      )}
    </>
  );
}

/**
 * First-run activation, the Activate.dc.html wizard extended to spec 8.4. It
 * is only reachable while the server reports activated:false; the setup token
 * proves the person running it has access to the server's state directory.
 *
 * Steps 1 and 2 only collect: the single POST /activate happens at the end of
 * step 3, carrying the public URL with it. Everything after that is an
 * ordinary authenticated call on the session activation just created, so a
 * wizard abandoned at step 4 leaves an activated, signed-in fleet rather than
 * half-written state.
 */
export function Activate({ onActivated }: { onActivated?: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [setupToken, setSetupToken] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [again, setAgain] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [publicURL, setPublicURL] = useState(window.location.origin);
  const [activated, setActivated] = useState(false);
  const [verified, setVerified] = useState(false);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [storage, setStorage] = useState<Storage>(EMPTY_STORAGE);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [enrollToken, setEnrollToken] = useState("");
  /** Set when activation worked but the fleet could not be furnished after it. */
  const [partial, setPartial] = useState("");

  /** The probe, on whatever the field currently says. Never fatal. */
  async function verify(): Promise<void> {
    setError("");
    setRequirements([]);
    try {
      await fleet.setPublicURL(publicURL.trim());
      setVerified(true);
    } catch (err) {
      setVerified(false);
      setError(apiError(err, "The public URL could not be checked."));
      setRequirements(proxyRequirements(err));
    }
  }

  /** Step 3's primary action: activate, sign in, then prove the URL works. */
  async function activate() {
    setError("");
    setBusy(true);
    try {
      await fleet.activate(setupToken.trim(), passphrase, email.trim(), password, publicURL.trim());
      // The same trimmed address activation just registered: a stray space
      // would otherwise sign in as an account that does not exist.
      await fleet.login(email.trim(), password);
      setActivated(true);
      // Same reasoning as furnish()'s credentials: nothing past this point
      // needs the passphrase or password, so they do not linger in memory.
      setPassphrase("");
      setAgain("");
      setPassword("");
    } catch (err) {
      setError(apiError(err, "Activation failed."));
      setBusy(false);
      return;
    }
    await verify();
    setBusy(false);
  }

  /** Steps 4 and 5, on the session activation created. */
  async function furnish(): Promise<void> {
    const created = await fleet.createTarget(storagePayload(storage));
    // Idempotent per row: a run that died after the target must be able to
    // finish, and re-creating a "Home" that is already there would leave two.
    const templates = await fleet.templates();
    const template =
      templates.find((t) => t.name === FIRST_TEMPLATE.name) ?? (await fleet.createTemplate(FIRST_TEMPLATE));
    const groups = await fleet.groups();
    const group =
      groups.find((g) => g.target_id === created.id) ?? (await fleet.createGroup(FIRST_GROUP, created.id, template.id));
    const token = await fleet.createToken(group.id, FIRST_TOKEN_TTL, 1);
    setEnrollToken(token.token);
  }

  async function finishStorage() {
    setError("");
    setBusy(true);
    try {
      await furnish();
      // The keys only ever existed in this form's state; they go with it.
      setStorage(scrubStorage(storage));
      setStep(5);
    } catch (err) {
      setError(apiError(err, "The storage could not be set up."));
    } finally {
      setBusy(false);
    }
  }

  function skipStorage() {
    setPartial("The fleet is on, but storage was not set up.");
    // Whatever was typed into the cloud/mirror fields before skipping goes
    // with them too - it was never sent anywhere.
    setStorage(scrubStorage(storage));
    setStep(5);
  }

  function finish() {
    // Re-detect the mode so the shell stops redirecting to this wizard.
    onActivated?.();
    navigate("/fleet/login");
  }

  const step1Ready = setupToken.trim() !== "" && passphrase.length >= MIN_SECRET && passphrase === again;
  const step2Ready = email.trim().includes("@") && password.length >= MIN_SECRET;
  const step3Ready = /^https?:\/\/[^\s/]+$/.test(publicURL.trim());

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Rail step={step} />
      <main className="flex min-w-0 grow flex-col gap-[22px] px-5 py-8 md:px-12 md:py-11">
        {step === 1 && (
          <>
            <div>
              <Eyebrow>Step 1 of 5</Eyebrow>
              <h1 className="font-display m-0 mt-2 text-[30px] leading-none font-extrabold tracking-[-0.02em]">
                Choose the sealing passphrase
              </h1>
            </div>
            <p className="text-ink-soft m-0 max-w-[70ch] leading-[1.6]">
              Every device&apos;s repository password and storage key will be sealed with this. It is asked for once at
              startup. <b>You will be able to open any enrolled device&apos;s backups.</b> That is the point for a
              family fleet, and it is written on every recovery kit.
            </p>
            <p className="text-ink-soft m-0 max-w-[70ch] leading-[1.6]">
              This passphrase unlocks every device&apos;s repository password. Losing it loses the escrow, not the
              backups: each device&apos;s recovery kit still opens its own repository.
            </p>
            <Field label="Setup token">
              <Input value={setupToken} autoComplete="off" onChange={(e) => setSetupToken(e.target.value)} />
            </Field>
            <p className="text-dim m-0 font-mono text-[11px] leading-[1.6]">
              Find it in the server log or at &lt;state dir&gt;/setup-token. It proves you have access to this server,
              and it is deleted once the fleet is activated.
            </p>
            <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
              <Field label="Passphrase">
                <Input
                  type="password"
                  value={passphrase}
                  autoComplete="new-password"
                  minLength={MIN_SECRET}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </Field>
              <Field label="Again">
                <Input
                  type="password"
                  value={again}
                  autoComplete="new-password"
                  onChange={(e) => setAgain(e.target.value)}
                />
              </Field>
            </div>
            {again !== "" && passphrase !== again && (
              <p role="alert" className="text-bad m-0 text-[13px]">
                The two passphrases are different.
              </p>
            )}
            <div className="flex justify-end">
              <Button variant="primary" disabled={!step1Ready} onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <Eyebrow>Step 2 of 5</Eyebrow>
              <h1 className="font-display m-0 mt-2 text-[30px] leading-none font-extrabold tracking-[-0.02em]">
                First admin
              </h1>
            </div>
            <Field label="Email">
              <Input type="email" value={email} autoComplete="username" onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                autoComplete="new-password"
                minLength={MIN_SECRET}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <p className="text-dim m-0 font-mono text-[11px]">
              At least 8 characters. Admins sign in to the dashboard; agents never do, they use their own tokens.
            </p>
            <div className="flex justify-between">
              <Button onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" disabled={!step2Ready} onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <Eyebrow>Step 3 of 5</Eyebrow>
              <h1 className="font-display m-0 mt-2 text-[30px] leading-none font-extrabold tracking-[-0.02em]">
                How devices reach this fleet
              </h1>
            </div>
            <p className="text-ink-soft m-0 max-w-[70ch] leading-[1.6]">
              One address, used everywhere: the enrollment command, the storage endpoint every device signs for, and the
              links in its recovery kit. The server proves it works by fetching its own status through it.
            </p>
            <Field label="Public URL">
              <Input
                type="url"
                value={publicURL}
                autoComplete="off"
                placeholder="https://fleet.example.com"
                onChange={(e) => setPublicURL(e.target.value)}
              />
            </Field>
            {activated && verified && (
              <p className="text-good m-0 text-[13px]" data-testid="public-url-ok">
                Reached this fleet through {publicURL.trim()}.
              </p>
            )}
            {error && (
              <div role="alert" className="flex flex-col gap-[10px]">
                <p className="text-bad m-0 text-[13px]">{error}</p>
                {requirements.length > 0 && (
                  <>
                    <p className="text-muted m-0 text-[13px]">The reverse proxy in front of it must:</p>
                    <ul className="text-dim m-0 list-disc pl-5 font-mono text-[11px] leading-[1.8]">
                      {requirements.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <Button disabled={activated} onClick={() => setStep(2)}>
                Back
              </Button>
              <div className="flex flex-wrap gap-2">
                {activated && !verified && <Button onClick={() => setStep(4)}>Continue anyway</Button>}
                {activated ? (
                  <Button
                    variant="primary"
                    disabled={busy || !step3Ready}
                    onClick={() => (verified ? setStep(4) : verify())}
                  >
                    {verified ? "Continue" : "Re-test"}
                  </Button>
                ) : (
                  <Button variant="primary" disabled={busy || !step3Ready} onClick={activate}>
                    {busy ? "Activating…" : "Activate"}
                  </Button>
                )}
              </div>
            </div>
            {activated && !verified && (
              <p className="text-dim m-0 max-w-[70ch] font-mono text-[11px] leading-[1.6]">
                Continuing stores the URL unverified. Settings can re-test it once the proxy is fixed; enrollment will
                not work until it passes.
              </p>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <div>
              <Eyebrow>Step 4 of 5</Eyebrow>
              <h1 className="font-display m-0 mt-2 text-[30px] leading-none font-extrabold tracking-[-0.02em]">
                Where backups will live
              </h1>
            </div>
            <p className="text-ink-soft m-0 max-w-[70ch] leading-[1.6]">
              Devices never hold cloud credentials either way: they talk to this server, and this server decides where
              the bytes land.
            </p>
            <StorageFields value={storage} onChange={setStorage} />
            {error && (
              <p role="alert" className="text-bad m-0 text-[13px]">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <Button onClick={skipStorage}>Skip for now</Button>
              <Button variant="primary" disabled={busy || !storageReady(storage)} onClick={finishStorage}>
                {busy ? "Setting up…" : "Finish setup"}
              </Button>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <div>
              <Eyebrow>Done</Eyebrow>
              <h1 className="font-display m-0 mt-2 text-[44px] leading-none font-extrabold tracking-[-0.02em]">
                Fleet is on.
              </h1>
            </div>
            <p className="text-ink-soft m-0 max-w-[70ch] leading-[1.6]">
              This machine is now a fleet server. It keeps backing itself up exactly as before. Next, add your first
              device: run this on it.
            </p>
            {enrollToken ? (
              <EnrollCommand token={enrollToken} origin={publicURL.trim()} />
            ) : (
              <p role="alert" className="text-bad m-0 max-w-[70ch]">
                {partial} Sign in and finish the setup from the Targets and Groups screens.
              </p>
            )}
            <Card className="max-w-[70ch]">
              <span className="font-display text-[18px] font-semibold">Keep the recovery kit</span>
              <div className="text-muted">
                Every device gets its own kit. A person holding one restores with a stock kopia binary and nothing else,
                whether or not this server is still running.
              </div>
            </Card>
            <div className="flex gap-2">
              <Button variant="primary" onClick={finish}>
                Open the Fleet dashboard
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

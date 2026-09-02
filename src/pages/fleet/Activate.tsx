import React, { useState } from "react";
import { useNavigate } from "react-router";
import clsx from "clsx";
import { Button, Eyebrow, Field, Input } from "../../design/components";
import { apiError, fleet } from "../../api/fleet";
import type { KopiaPolicy, TargetInput } from "../../api/types";
import { EnrollCommand } from "./EnrollCommand";
import { Mark } from "./Mark";
import { TargetFields, targetPayload, targetReady } from "./Targets";

const STEPS = ["Passphrase", "First admin", "Storage", "Done"];
const MIN_SECRET = 8;

/**
 * What the fleet's first group backs up until an admin says otherwise: the
 * user's home, hourly, with a month of history. It is a starting point, not a
 * recommendation - the Policies screen edits it.
 */
const FIRST_TEMPLATE: { name: string; sources: string[]; policy: KopiaPolicy } = {
  name: "Home default",
  sources: ["~"],
  policy: {
    scheduling: { intervalSeconds: 3600 },
    retention: { keepLatest: 10, keepDaily: 7, keepWeekly: 4, keepMonthly: 6 },
    compression: { compressorName: "zstd" },
  },
};

const FIRST_GROUP = "Devices";
/** The first enrollment token: one machine, one hour. */
const FIRST_TOKEN_TTL = 3600;

function Rail({ step }: { step: number }) {
  return (
    <aside className="bg-panel border-line flex w-[300px] shrink-0 flex-col gap-[6px] border-r px-8 py-9">
      <div className="mb-[26px] flex items-center gap-[10px]">
        <Mark size={24} />
        <span className="font-display text-[15px] font-extrabold">ACTIVATE FLEET</span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-[6px] p-0">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const tone = n === step ? "text-ember border-ember" : n < step ? "text-good border-good" : "text-dim border-line-strong";
          return (
            <li key={label} className="flex items-center gap-3 py-3" aria-current={n === step ? "step" : undefined}>
              <span
                className={clsx("font-display flex h-7 w-7 items-center justify-center border text-[14px] font-extrabold", tone)}
              >
                {n}
              </span>
              <span className={clsx("font-semibold", tone.split(" ")[0])}>{label}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-dim mt-auto m-0 font-mono text-[11px] leading-[1.6]">
        Nothing to download. Fleet is already inside this WarpHold; this turns it on.
      </p>
    </aside>
  );
}

/**
 * First-run activation, the Activate.dc.html wizard. It is only reachable
 * while the server reports activated:false; the setup token proves the person
 * running it has access to the server's state directory.
 *
 * The server's /activate takes the passphrase and the first admin only, so the
 * storage step is done just after, over the session activation hands back:
 * target, a starting template, a group and the first enrollment token, which
 * is what step 4 has to show.
 */
export function Activate({ onActivated }: { onActivated?: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [setupToken, setSetupToken] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [again, setAgain] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [target, setTarget] = useState<TargetInput>({ name: "Backups", kind: "b2" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [enrollToken, setEnrollToken] = useState("");
  /** Set when activation worked but the fleet could not be furnished after it. */
  const [partial, setPartial] = useState("");

  /** Everything after /activate, on the session activation just created. */
  async function furnish(): Promise<void> {
    // The same trimmed address activation just registered: a stray space would
    // otherwise sign in as an account that does not exist.
    await fleet.login(email.trim(), password);
    const createdTarget = await fleet.createTarget(targetPayload(target));
    const template = await fleet.createTemplate(FIRST_TEMPLATE);
    const group = await fleet.createGroup(FIRST_GROUP, createdTarget.id, template.id);
    const token = await fleet.createToken(group.id, FIRST_TOKEN_TTL, 1);
    setEnrollToken(token.token);
  }

  async function activate() {
    setError("");
    setBusy(true);
    try {
      await fleet.activate(setupToken.trim(), passphrase, email.trim(), password);
    } catch (err) {
      setError(apiError(err, "Activation failed."));
      setBusy(false);
      return;
    }
    try {
      await furnish();
    } catch (err) {
      // The fleet is activated either way, and saying otherwise would send an
      // admin back into a wizard that can no longer run.
      setPartial(apiError(err, "The fleet is on, but the first target could not be set up."));
    } finally {
      setBusy(false);
      setStep(4);
    }
  }

  function finish() {
    // Re-detect the mode so the shell stops redirecting to this wizard.
    onActivated?.();
    navigate("/fleet/login");
  }

  const step1Ready = setupToken.trim() !== "" && passphrase.length >= MIN_SECRET && passphrase === again;
  const step2Ready = email.trim().includes("@") && password.length >= MIN_SECRET;

  return (
    <div className="flex min-h-screen">
      <Rail step={step} />
      <main className="flex min-w-0 grow flex-col gap-[22px] px-12 py-11">
        {step === 1 && (
          <>
            <div>
              <Eyebrow>Step 1 of 4</Eyebrow>
              <h1 className="font-display m-0 mt-2 text-[30px] leading-none font-extrabold tracking-[-0.02em]">
                Choose the sealing passphrase
              </h1>
            </div>
            <p className="text-ink-soft m-0 max-w-[70ch] leading-[1.6]">
              Every device&apos;s repository password and storage key will be sealed with this. It is asked for once at
              startup. <b>You will be able to open any enrolled device&apos;s backups.</b> That is the point for a
              family fleet, and it is written on every recovery kit.
            </p>
            <Field label="Setup token">
              <Input value={setupToken} autoComplete="off" onChange={(e) => setSetupToken(e.target.value)} />
            </Field>
            <p className="text-dim m-0 font-mono text-[11px] leading-[1.6]">
              Find it in the server log or at &lt;state dir&gt;/setup-token. It proves you have access to this server,
              and it is deleted once the fleet is activated.
            </p>
            <div className="grid grid-cols-2 gap-[14px]">
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
              <Eyebrow>Step 2 of 4</Eyebrow>
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
              <Eyebrow>Step 3 of 4</Eyebrow>
              <h1 className="font-display m-0 mt-2 text-[30px] leading-none font-extrabold tracking-[-0.02em]">
                Where backups will live
              </h1>
            </div>
            <TargetFields value={target} onChange={setTarget} />
            {error && (
              <p role="alert" className="text-bad m-0 text-[13px]">
                {error}
              </p>
            )}
            <div className="flex justify-between">
              <Button onClick={() => setStep(2)}>Back</Button>
              <Button variant="primary" disabled={busy || !targetReady(target)} onClick={activate}>
                {busy ? "Activating…" : "Activate"}
              </Button>
            </div>
          </>
        )}

        {step === 4 && (
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
              <EnrollCommand token={enrollToken} />
            ) : (
              <p role="alert" className="text-bad m-0 max-w-[70ch]">
                {partial} Sign in and finish the setup from the Targets and Groups screens.
              </p>
            )}
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

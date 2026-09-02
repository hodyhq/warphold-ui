import React, { useState } from "react";
import { useNavigate } from "react-router";
import { Button, Eyebrow, Field, Input } from "../../design/components";
import { apiError, fleet } from "../../api/fleet";
import { Mark } from "./Mark";

/**
 * Fleet sign-in. The centered card follows Activate.dc.html; the session is a
 * cookie the server sets, so nothing is kept in this component after submit.
 */
export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await fleet.login(email, password);
      navigate("/fleet");
    } catch (err) {
      // 409 is "fleet is not activated": there is no account to sign in to
      // yet, so the wizard is the only useful destination.
      if ((err as { response?: { status?: number } })?.response?.status === 409) {
        navigate("/fleet/activate");
        return;
      }
      setError(apiError(err, "Sign-in failed. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={submit} className="flex w-[380px] flex-col gap-[18px]">
        <div className="flex items-center gap-[10px]">
          <Mark size={24} />
          <span className="font-display text-[15px] font-extrabold tracking-[0.02em]">WARPHOLD</span>
        </div>
        <div>
          <Eyebrow>Fleet</Eyebrow>
          <h1 className="font-display mt-2 text-[30px] leading-none font-extrabold tracking-[-0.02em]">Sign in</h1>
        </div>
        <Field label="Email">
          <Input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="text-bad m-0 text-[13px]">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-dim m-0 font-mono text-[11px] leading-[1.6]">
          Admins sign in here. Agents never do; they use their own tokens.
        </p>
      </form>
    </div>
  );
}

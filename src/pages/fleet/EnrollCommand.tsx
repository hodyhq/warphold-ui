import React, { useState } from "react";
import clsx from "clsx";
import { Button, Eyebrow, inputClass } from "../../design/components";

/**
 * The enrollment token is a bearer credential: whoever holds it can enrol a
 * machine into the fleet. It is therefore never put in the command an admin
 * copies - a copied command lands in shell history (and in `ps` while the
 * script runs) on every box it is pasted into. The script prompts for the
 * token instead, with the terminal echo off (see fleet/api/enroll.sh.tmpl).
 */
export function enrollCommand(origin: string): string {
  return `curl -fsSL ${origin}/enroll.sh | sh`;
}

/** The unattended form, which does put the token on the command line. */
export function enrollAutomationCommand(origin: string, token: string): string {
  return `WARPHOLD_ENROLL_TOKEN=${token} sh -c "$(curl -fsSL ${origin}/enroll.sh)"`;
}

/** A read-only value with a copy button; the value is selectable by keyboard. */
export function CopyField({ label, value, className }: { label: string; value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-[6px]">
      <Eyebrow>{label}</Eyebrow>
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          aria-label={label}
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={clsx(inputClass, "grow font-mono text-[12px]", className)}
        />
        <Button
          onClick={() => {
            // Clipboard access can be denied (or missing outside a secure
            // context); the value stays selectable in the field either way.
            navigator.clipboard?.writeText(value).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export interface EnrollCommandProps {
  token: string;
  /** Where the agent will be told to reach this Fleet; defaults to this page's origin. */
  origin?: string;
}

/**
 * What an admin runs on a new machine: the command in one field, the token in
 * another, and the token-on-the-command-line variant folded away behind a
 * disclosure with what it costs.
 */
export function EnrollCommand({ token, origin = window.location.origin }: EnrollCommandProps) {
  return (
    <div className="flex flex-col gap-[14px]">
      <CopyField label="Run on the machine" value={enrollCommand(origin)} className="text-ember-hover" />
      <p className="text-dim m-0 font-mono text-[11px] leading-[1.6]">
        The script asks for the token and reads it with the terminal echo off, so it never lands in the shell history
        of the machine being enrolled.
      </p>
      <CopyField label="Enrollment token" value={token} />
      <details className="text-dim font-mono text-[11px] leading-[1.6]">
        <summary className="text-muted hover:text-ink cursor-pointer">Unattended (scripts, images, CI)</summary>
        <div className="mt-3 flex flex-col gap-[10px]">
          <p className="m-0">
            This form puts the token in the command line: it is kept in the shell history of the machine that runs it
            and is visible in <span className="font-mono">ps</span> while the script runs. Prefer it only where no one
            can type at a prompt, and revoke the token once the rollout is done.
          </p>
          <CopyField label="Unattended command" value={enrollAutomationCommand(origin, token)} />
        </div>
      </details>
    </div>
  );
}

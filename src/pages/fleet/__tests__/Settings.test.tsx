import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { Settings } from "../Settings";
import type { Admin } from "../../../api/types";

const settings = vi.fn();
const setSetting = vi.fn();
const setSettings = vi.fn();
const smtpTest = vi.fn();
const createJob = vi.fn();
const admins = vi.fn();
const inviteAdmin = vi.fn();
const deleteAdmin = vi.fn();

vi.mock(import("../../../api/fleet"), async (importOriginal) => ({
  ...(await importOriginal()),
  fleet: {
    settings: () => settings(),
    setSetting: (key: string, value: unknown) => setSetting(key, value),
    setSettings: (patch: unknown) => setSettings(patch),
    smtpTest: (to: string) => smtpTest(to),
    createJob: (kind: string, agentId?: string) => createJob(kind, agentId),
    admins: () => admins(),
    inviteAdmin: (email: string, password: string) => inviteAdmin(email, password),
    deleteAdmin: (id: number) => deleteAdmin(id),
  } as unknown as typeof import("../../../api/fleet").fleet,
}));

const ADMINS: Admin[] = [
  { id: 1, email: "admin@example.com", role: "owner", created_at: "2026-08-01T00:00:00Z" },
  { id: 2, email: "second@example.com", role: "admin", created_at: "2026-08-02T00:00:00Z" },
];

const BASE_SETTINGS = {
  fleet_name: "home-fleet",
  poll_interval: 300,
  mirror_interval: 3_600,
  verify_interval: 604_800,
  test_restore_interval: 2_592_000,
  maintenance_interval: 86_400,
  stats_interval: 86_400,
  digest_interval: 604_800,
  revoked_retention_days: 30,
  smtp_host: "",
  smtp_port: 2525,
  smtp_username: "",
  smtp_from: "",
  smtp_tls: true,
  smtp_password_set: false,
};

beforeEach(() => {
  settings.mockReset().mockResolvedValue(BASE_SETTINGS);
  setSetting
    .mockReset()
    .mockImplementation((key: string, value: unknown) => Promise.resolve({ ...BASE_SETTINGS, [key]: value }));
  setSettings.mockReset().mockImplementation((patch: object) => Promise.resolve({ ...BASE_SETTINGS, ...patch }));
  smtpTest.mockReset().mockResolvedValue({ sent: true });
  createJob.mockReset().mockResolvedValue({ id: 1 });
  admins.mockReset().mockResolvedValue(ADMINS);
  inviteAdmin.mockReset().mockResolvedValue({ id: 3 });
  deleteAdmin.mockReset().mockResolvedValue(undefined);
});

describe("Settings", () => {
  it("renders the live settings and the cards that are still waiting", async () => {
    render(<Settings />);

    expect(await screen.findByLabelText(/^name$/i)).toHaveValue("home-fleet");
    expect(screen.getByLabelText(/poll interval/i)).toHaveValue("300");
    expect(screen.getByLabelText(/health thresholds/i)).toHaveValue("stale after 26 h · failing after 7 d");
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /change passphrase/i })).toBeDisabled();
    expect(screen.getByText(/background jobs/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send digest now/i })).toBeInTheDocument();
    expect(screen.getByText(/^smtp$/i)).toBeInTheDocument();
  });

  it("saves the fleet name through the settings endpoint", async () => {
    render(<Settings />);

    const name = await screen.findByLabelText(/^name$/i);
    await userEvent.clear(name);
    await userEvent.type(name, "  family-fleet  ");
    await userEvent.click(within(name.closest("form") as HTMLElement).getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(setSetting).toHaveBeenCalledWith("fleet_name", "family-fleet"));
  });

  it("saves the poll interval as seconds", async () => {
    render(<Settings />);

    await userEvent.selectOptions(await screen.findByLabelText(/poll interval/i), "900");

    await waitFor(() => expect(setSetting).toHaveBeenCalledWith("poll_interval", 900));
  });

  it("keeps a stored interval the list does not offer", async () => {
    settings.mockResolvedValue({ fleet_name: "", poll_interval: 45 });
    render(<Settings />);

    expect(await screen.findByLabelText(/poll interval/i)).toHaveValue("45");
    expect(screen.getByRole("option", { name: "45 seconds" })).toBeInTheDocument();
  });

  it("round-trips a background-job interval through the settings endpoint", async () => {
    render(<Settings />);

    await userEvent.selectOptions(await screen.findByLabelText("Mirror"), "300");
    await waitFor(() => expect(setSetting).toHaveBeenCalledWith("mirror_interval", 300));

    const raw = screen.getByLabelText("Maintenance in seconds");
    await userEvent.clear(raw);
    await userEvent.type(raw, "7200");
    await userEvent.click(within(raw.closest("form") as HTMLElement).getByRole("button", { name: /^set$/i }));
    await waitFor(() => expect(setSetting).toHaveBeenCalledWith("maintenance_interval", 7200));
  });

  it("round-trips SMTP settings, sending the password only when it was typed", async () => {
    render(<Settings />);

    await screen.findByText(/^smtp$/i);
    const card = within(screen.getByText(/^smtp$/i).closest("div") as HTMLElement);

    await userEvent.type(card.getByLabelText(/host/i), "smtp.example.com");
    await userEvent.type(card.getByLabelText(/^username$/i), "hody");
    await userEvent.type(card.getByLabelText(/from address/i), "fleet@hody.dev");
    await userEvent.click(card.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(setSettings).toHaveBeenCalledWith({
        smtp_host: "smtp.example.com",
        smtp_port: 2525,
        smtp_username: "hody",
        smtp_from: "fleet@hody.dev",
        smtp_tls: true,
      }),
    );

    setSettings.mockClear();
    await userEvent.type(card.getByLabelText(/^password$/i), "s3cret");
    await userEvent.click(card.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ smtp_password: "s3cret" })),
    );
  });

  it("shows the result of a test-send", async () => {
    render(<Settings />);

    await userEvent.type(await screen.findByLabelText(/send test email to/i), "hody@hody.dev");
    await userEvent.click(screen.getByRole("button", { name: /send test email/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/sent/i);
    expect(smtpTest).toHaveBeenCalledWith("hody@hody.dev");

    smtpTest.mockRejectedValueOnce({ response: { status: 502, data: { error: "smtp: dial tcp: timeout" } } });
    await userEvent.click(screen.getByRole("button", { name: /send test email/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/timeout/i);
  });

  it("invites an admin", async () => {
    render(<Settings />);
    await userEvent.click(await screen.findByRole("button", { name: /invite admin/i }));

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/email/i), "third@example.com");
    await userEvent.type(within(dialog).getByLabelText(/first password/i), "pw12345678");
    await userEvent.click(within(dialog).getByRole("button", { name: /create admin/i }));

    await waitFor(() => expect(inviteAdmin).toHaveBeenCalledWith("third@example.com", "pw12345678"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("removes an admin after a confirmation", async () => {
    render(<Settings />);
    await screen.findByText("second@example.com");

    await userEvent.click(screen.getAllByRole("button", { name: /remove/i })[1]);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("second@example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: /remove admin/i }));

    await waitFor(() => expect(deleteAdmin).toHaveBeenCalledWith(2));
  });

  it("keeps the dialog open with the server's reason when the last admin cannot go", async () => {
    deleteAdmin.mockRejectedValue({
      response: { status: 409, data: { error: "cannot delete the last admin" } },
    });
    render(<Settings />);
    await screen.findByText("admin@example.com");

    await userEvent.click(screen.getAllByRole("button", { name: /remove/i })[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /remove admin/i }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("cannot delete the last admin");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

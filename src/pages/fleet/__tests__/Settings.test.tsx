import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { Settings } from "../Settings";
import type { Admin } from "../../../api/types";

const settings = vi.fn();
const setSetting = vi.fn();
const admins = vi.fn();
const inviteAdmin = vi.fn();
const deleteAdmin = vi.fn();

vi.mock(import("../../../api/fleet"), async (importOriginal) => ({
  ...(await importOriginal()),
  fleet: {
    settings: () => settings(),
    setSetting: (key: string, value: unknown) => setSetting(key, value),
    admins: () => admins(),
    inviteAdmin: (email: string, password: string) => inviteAdmin(email, password),
    deleteAdmin: (id: number) => deleteAdmin(id),
  } as unknown as typeof import("../../../api/fleet").fleet,
}));

const ADMINS: Admin[] = [
  { id: 1, email: "hody@hody.dev", role: "owner", created_at: "2026-08-01T00:00:00Z" },
  { id: 2, email: "second@hody.dev", role: "admin", created_at: "2026-08-02T00:00:00Z" },
];

beforeEach(() => {
  settings.mockReset().mockResolvedValue({ fleet_name: "moinzadeh-home", poll_interval: 300 });
  setSetting.mockReset().mockImplementation((key: string, value: unknown) =>
    Promise.resolve({ fleet_name: "moinzadeh-home", poll_interval: 300, [key]: value }),
  );
  admins.mockReset().mockResolvedValue(ADMINS);
  inviteAdmin.mockReset().mockResolvedValue({ id: 3 });
  deleteAdmin.mockReset().mockResolvedValue(undefined);
});

describe("Settings", () => {
  it("renders the live settings and the cards that are still waiting", async () => {
    render(<Settings />);

    expect(await screen.findByLabelText(/name/i)).toHaveValue("moinzadeh-home");
    expect(screen.getByLabelText(/poll interval/i)).toHaveValue("300");
    expect(screen.getByLabelText(/health thresholds/i)).toHaveValue("stale after 26 h · failing after 7 d");
    expect(screen.getByText("hody@hody.dev")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /change passphrase/i })).toBeDisabled();
    expect(screen.getByText(/One email a week/i)).toBeInTheDocument();
  });

  it("saves the fleet name through the settings endpoint", async () => {
    render(<Settings />);

    const name = await screen.findByLabelText(/name/i);
    await userEvent.clear(name);
    await userEvent.type(name, "  family-fleet  ");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

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

  it("invites an admin", async () => {
    render(<Settings />);
    await userEvent.click(await screen.findByRole("button", { name: /invite admin/i }));

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/email/i), "third@hody.dev");
    await userEvent.type(within(dialog).getByLabelText(/first password/i), "pw12345678");
    await userEvent.click(within(dialog).getByRole("button", { name: /create admin/i }));

    await waitFor(() => expect(inviteAdmin).toHaveBeenCalledWith("third@hody.dev", "pw12345678"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("removes an admin after a confirmation", async () => {
    render(<Settings />);
    await screen.findByText("second@hody.dev");

    await userEvent.click(screen.getAllByRole("button", { name: /remove/i })[1]);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("second@hody.dev");
    await userEvent.click(within(dialog).getByRole("button", { name: /remove admin/i }));

    await waitFor(() => expect(deleteAdmin).toHaveBeenCalledWith(2));
  });

  it("keeps the dialog open with the server's reason when the last admin cannot go", async () => {
    deleteAdmin.mockRejectedValue({
      response: { status: 409, data: { error: "cannot delete the last admin" } },
    });
    render(<Settings />);
    await screen.findByText("hody@hody.dev");

    await userEvent.click(screen.getAllByRole("button", { name: /remove/i })[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /remove admin/i }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("cannot delete the last admin");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { Activate } from "../Activate";

const activate = vi.fn();
const login = vi.fn();
const createTarget = vi.fn();
const createTemplate = vi.fn();
const createGroup = vi.fn();
const createToken = vi.fn();

vi.mock(import("../../../api/fleet"), async (importOriginal) => ({
  ...(await importOriginal()),
  fleet: {
    activate: (token: string, passphrase: string, email: string, password: string) =>
      activate(token, passphrase, email, password),
    login: (email: string, password: string) => login(email, password),
    createTarget: (t: unknown) => createTarget(t),
    createTemplate: (t: unknown) => createTemplate(t),
    createGroup: (name: string, targetID: number, templateID: number) => createGroup(name, targetID, templateID),
    createToken: (groupID: number, ttl: number, uses: number) => createToken(groupID, ttl, uses),
  } as unknown as typeof import("../../../api/fleet").fleet,
}));

const TOKEN = "wh_firstdeadbeefdeadbeef";
const onActivated = vi.fn();

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/fleet/activate"]}>
      <Routes>
        <Route path="/fleet/activate" element={<Activate onActivated={onActivated} />} />
        <Route path="/fleet/login" element={<div>sign-in screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  onActivated.mockReset();
  activate.mockReset().mockResolvedValue({ admin_id: 1 });
  login.mockReset().mockResolvedValue(undefined);
  createTarget.mockReset().mockResolvedValue({ id: 5, object_lock_verified: true });
  createTemplate.mockReset().mockResolvedValue({ id: 6 });
  createGroup.mockReset().mockResolvedValue({ id: 7 });
  createToken.mockReset().mockResolvedValue({
    id: 8,
    token: TOKEN,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    max_uses: 1,
  });
});

/** Steps 1 and 2, which every later step needs. */
async function fillCredentials() {
  await userEvent.type(screen.getByLabelText(/setup token/i), "setup-token-value");
  await userEvent.type(screen.getByLabelText(/^passphrase$/i), "seal me please");
  await userEvent.type(screen.getByLabelText(/again/i), "seal me please");
  await userEvent.click(screen.getByRole("button", { name: /continue/i }));

  // Typed with a stray trailing space: activation and the sign-in that follows
  // must use the same address.
  await userEvent.type(screen.getByLabelText(/email/i), "admin@example.com ");
  await userEvent.type(screen.getByLabelText(/password/i), "pw12345678");
  await userEvent.click(screen.getByRole("button", { name: /continue/i }));
}

describe("Activate", () => {
  it("holds step 1 until the token is there and the passphrases match", async () => {
    renderWizard();

    expect(screen.getByText(/setup-token/)).toBeInTheDocument();
    const next = screen.getByRole("button", { name: /continue/i });
    expect(next).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/setup token/i), "setup-token-value");
    await userEvent.type(screen.getByLabelText(/^passphrase$/i), "seal me please");
    await userEvent.type(screen.getByLabelText(/again/i), "seal me pleas");
    expect(await screen.findByRole("alert")).toHaveTextContent(/different/i);
    expect(next).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/again/i), "e");
    expect(next).toBeEnabled();
  });

  it("activates, sets the fleet up and shows the enrollment command", async () => {
    renderWizard();
    await fillCredentials();

    await userEvent.click(screen.getByRole("radio", { name: /folder on this server/i }));
    await userEvent.clear(screen.getByLabelText(/name/i));
    await userEvent.type(screen.getByLabelText(/name/i), "tank");
    await userEvent.type(screen.getByLabelText(/path/i), "/tank/warphold");
    await userEvent.click(screen.getByRole("button", { name: /^activate$/i }));

    await waitFor(() =>
      expect(activate).toHaveBeenCalledWith("setup-token-value", "seal me please", "admin@example.com", "pw12345678"),
    );
    await waitFor(() => expect(login).toHaveBeenCalledWith("admin@example.com", "pw12345678"));
    expect(createTarget).toHaveBeenCalledWith({ name: "tank", kind: "filesystem", path: "/tank/warphold" });
    expect(createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: ["~"],
        policy: expect.objectContaining({ scheduling: { intervalSeconds: 3600 } }),
      }),
    );
    expect(createGroup).toHaveBeenCalledWith("Devices", 5, 6);
    expect(createToken).toHaveBeenCalledWith(7, 3600, 1);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Fleet is on.");
    const command = screen.getByLabelText(/run on the machine/i);
    expect((command as HTMLInputElement).value).not.toContain(TOKEN);
    expect(screen.getByLabelText(/^enrollment token$/i)).toHaveValue(TOKEN);
  });

  it("stays on the storage step with the server's reason when the setup token is wrong", async () => {
    activate.mockRejectedValue({
      response: { status: 403, data: { error: "activation requires the X-WarpHold-Setup-Token header" } },
    });
    renderWizard();
    await fillCredentials();
    await userEvent.type(screen.getByLabelText(/bucket/i), "fleet-backups");
    await userEvent.type(screen.getByLabelText(/key id/i), "004abc");
    await userEvent.type(screen.getByLabelText(/^application key$/i), "SECRETKEY");
    await userEvent.click(screen.getByRole("button", { name: /^activate$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/setup-token/i);
    expect(login).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^activate$/i })).toBeInTheDocument();
  });

  it("still reports the fleet as on when the first target could not be created", async () => {
    createTarget.mockRejectedValue({ response: { data: { error: "b2: bucket not found" } } });
    renderWizard();
    await fillCredentials();
    await userEvent.type(screen.getByLabelText(/bucket/i), "nope");
    await userEvent.type(screen.getByLabelText(/key id/i), "004abc");
    await userEvent.type(screen.getByLabelText(/^application key$/i), "SECRETKEY");
    await userEvent.click(screen.getByRole("button", { name: /^activate$/i }));

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Fleet is on.");
    expect(screen.getByRole("alert")).toHaveTextContent("bucket not found");
    expect(screen.queryByLabelText(/enrollment token/i)).not.toBeInTheDocument();
  });

  it("re-detects the mode and lands on the sign-in page when it is done", async () => {
    renderWizard();
    await fillCredentials();
    await userEvent.click(screen.getByRole("radio", { name: /folder on this server/i }));
    await userEvent.type(screen.getByLabelText(/path/i), "/tank/warphold");
    await userEvent.click(screen.getByRole("button", { name: /^activate$/i }));

    await userEvent.click(await screen.findByRole("button", { name: /open the fleet dashboard/i }));

    expect(onActivated).toHaveBeenCalled();
    expect(await screen.findByText("sign-in screen")).toBeInTheDocument();
  });
});

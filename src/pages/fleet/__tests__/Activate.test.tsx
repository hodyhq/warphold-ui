import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { Activate, scrubStorage } from "../Activate";

const activate = vi.fn();
const login = vi.fn();
const setPublicURL = vi.fn();
const createTarget = vi.fn();
const templates = vi.fn();
const createTemplate = vi.fn();
const groups = vi.fn();
const createGroup = vi.fn();
const createToken = vi.fn();

vi.mock(import("../../../api/fleet"), async (importOriginal) => ({
  ...(await importOriginal()),
  fleet: {
    activate: (token: string, passphrase: string, email: string, password: string, publicURL: string) =>
      activate(token, passphrase, email, password, publicURL),
    login: (email: string, password: string) => login(email, password),
    setPublicURL: (url: string) => setPublicURL(url),
    createTarget: (t: unknown) => createTarget(t),
    templates: () => templates(),
    createTemplate: (t: unknown) => createTemplate(t),
    groups: () => groups(),
    createGroup: (name: string, targetID: number, templateID: number) => createGroup(name, targetID, templateID),
    createToken: (groupID: number, ttl: number, uses: number) => createToken(groupID, ttl, uses),
  } as unknown as typeof import("../../../api/fleet").fleet,
}));

const TOKEN = "wh_firstdeadbeefdeadbeef";
const PUBLIC_URL = "https://fleet.example.com";
const REQUIREMENTS = [
  "forward the Host header unchanged",
  "forward the full path, including /s3/",
  "do not buffer request bodies",
  "allow a request body of at least 5 GiB",
  "allow a read timeout of at least 30 minutes",
];

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

/** A failed end-to-end probe: the 400 that carries the proxy checklist. */
function probeFailure() {
  return {
    response: {
      status: 400,
      data: { error: PUBLIC_URL + " could not be reached from this server", proxy_requirements: REQUIREMENTS },
    },
  };
}

beforeEach(() => {
  onActivated.mockReset();
  activate.mockReset().mockResolvedValue({ admin_id: 1 });
  login.mockReset().mockResolvedValue(undefined);
  setPublicURL.mockReset().mockResolvedValue({ fleet_name: "", poll_interval: 300, public_url: PUBLIC_URL });
  createTarget.mockReset().mockResolvedValue({ id: 5, object_lock_verified: true });
  templates.mockReset().mockResolvedValue([]);
  createTemplate.mockReset().mockResolvedValue({ id: 6 });
  groups.mockReset().mockResolvedValue([]);
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

/** Steps 1 to 3, ending on a verified public URL and the storage step. */
async function reachStorage() {
  await fillCredentials();
  await userEvent.clear(screen.getByLabelText(/public url/i));
  await userEvent.type(screen.getByLabelText(/public url/i), PUBLIC_URL);
  await userEvent.click(screen.getByRole("button", { name: /^activate$/i }));
  await userEvent.click(await screen.findByRole("button", { name: /^continue$/i }));
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

  it("prefills the public URL with this origin and refuses one that is not a URL", async () => {
    renderWizard();
    await fillCredentials();

    const field = screen.getByLabelText(/public url/i);
    expect(field).toHaveValue(window.location.origin);

    await userEvent.clear(field);
    await userEvent.type(field, "fleet.example.com");
    expect(screen.getByRole("button", { name: /^activate$/i })).toBeDisabled();

    await userEvent.clear(field);
    await userEvent.type(field, PUBLIC_URL);
    expect(screen.getByRole("button", { name: /^activate$/i })).toBeEnabled();
  });

  it("activates with the public URL, then verifies it", async () => {
    renderWizard();
    await fillCredentials();
    await userEvent.clear(screen.getByLabelText(/public url/i));
    await userEvent.type(screen.getByLabelText(/public url/i), PUBLIC_URL);
    await userEvent.click(screen.getByRole("button", { name: /^activate$/i }));

    await waitFor(() =>
      expect(activate).toHaveBeenCalledWith(
        "setup-token-value",
        "seal me please",
        "admin@example.com",
        "pw12345678",
        PUBLIC_URL,
      ),
    );
    expect(login).toHaveBeenCalledWith("admin@example.com", "pw12345678");
    expect(setPublicURL).toHaveBeenCalledWith(PUBLIC_URL);
    expect(await screen.findByTestId("public-url-ok")).toBeInTheDocument();
  });

  it("prints every proxy requirement when the probe fails, and re-tests", async () => {
    setPublicURL.mockRejectedValueOnce(probeFailure());
    renderWizard();
    await fillCredentials();
    await userEvent.clear(screen.getByLabelText(/public url/i));
    await userEvent.type(screen.getByLabelText(/public url/i), PUBLIC_URL);
    await userEvent.click(screen.getByRole("button", { name: /^activate$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not be reached/i);
    for (const line of REQUIREMENTS) {
      expect(alert).toHaveTextContent(line);
    }
    // Activation happened once and must not be repeated; only the probe re-runs.
    await userEvent.click(screen.getByRole("button", { name: /re-test/i }));
    await waitFor(() => expect(setPublicURL).toHaveBeenCalledTimes(2));
    expect(activate).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("public-url-ok")).toBeInTheDocument();
  });

  it("lets an unverified URL through, on the record", async () => {
    setPublicURL.mockRejectedValue(probeFailure());
    renderWizard();
    await fillCredentials();
    await userEvent.clear(screen.getByLabelText(/public url/i));
    await userEvent.type(screen.getByLabelText(/public url/i), PUBLIC_URL);
    await userEvent.click(screen.getByRole("button", { name: /^activate$/i }));

    await userEvent.click(await screen.findByRole("button", { name: /continue anyway/i }));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/where backups will live/i);
  });

  it("defaults to Fleet disk with the hosted root prefilled, and hides the mirror until asked", async () => {
    renderWizard();
    await reachStorage();

    expect(screen.getByRole("radio", { name: /fleet disk/i })).toBeChecked();
    expect(screen.getByLabelText(/path on this server/i)).toHaveValue("/srv/warphold/hosted");
    expect(screen.queryByLabelText(/^bucket$/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /also mirror/i }));
    expect(screen.getByLabelText(/^bucket$/i)).toBeInTheDocument();
    expect(screen.getByText(/object lock must be enabled/i)).toBeInTheDocument();
    // A half-filled mirror is not a mirror.
    expect(screen.getByRole("button", { name: /finish setup/i })).toBeDisabled();
  });

  it("creates the hosted disk target, the defaults and the first token", async () => {
    renderWizard();
    await reachStorage();
    await userEvent.click(screen.getByRole("button", { name: /finish setup/i }));

    await waitFor(() =>
      expect(createTarget).toHaveBeenCalledWith({
        name: "Fleet disk",
        kind: "hosted",
        storage_mode: "disk",
        path: "/srv/warphold/hosted",
      }),
    );
    expect(createTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: "Home", sources: ["~"] }));
    expect(createGroup).toHaveBeenCalledWith("Devices", 5, 6);
    expect(createToken).toHaveBeenCalledWith(7, 3600, 1);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Fleet is on.");
    const command = screen.getByLabelText(/run on the machine/i) as HTMLInputElement;
    // The one-liner is built from the public URL, and never carries the token.
    expect(command.value).toContain(PUBLIC_URL);
    expect(command.value).not.toContain(TOKEN);
    expect(screen.getByLabelText(/^enrollment token$/i)).toHaveValue(TOKEN);
  });

  it("reuses a Home template and a group that already exist", async () => {
    templates.mockResolvedValue([{ id: 60, name: "Home", sources: ["~"], policy: {} }]);
    groups.mockResolvedValue([{ id: 70, name: "Devices", target_id: 5, template_id: 60 }]);
    renderWizard();
    await reachStorage();
    await userEvent.click(screen.getByRole("button", { name: /finish setup/i }));

    await waitFor(() => expect(createToken).toHaveBeenCalledWith(70, 3600, 1));
    expect(createTemplate).not.toHaveBeenCalled();
    expect(createGroup).not.toHaveBeenCalled();
  });

  it("requires every cloud-direct field, and posts them without a mirror", async () => {
    renderWizard();
    await reachStorage();
    await userEvent.click(screen.getByRole("radio", { name: /cloud-direct/i }));

    const finish = screen.getByRole("button", { name: /finish setup/i });
    expect(finish).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/^bucket$/i), "family-backups");
    await userEvent.type(screen.getByLabelText(/^region$/i), "us-west-004");
    await userEvent.type(screen.getByLabelText(/^key id$/i), "004abc");
    expect(finish).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/^application key$/i), "SECRETKEY");
    expect(finish).toBeEnabled();

    await userEvent.click(finish);
    await waitFor(() =>
      expect(createTarget).toHaveBeenCalledWith({
        name: "Cloud storage",
        kind: "hosted",
        storage_mode: "cloud",
        bucket: "family-backups",
        region: "us-west-004",
        key_id: "004abc",
        key: "SECRETKEY",
      }),
    );
  });

  it("asks an S3-compatible cloud target for its endpoint", async () => {
    renderWizard();
    await reachStorage();
    await userEvent.click(screen.getByRole("radio", { name: /cloud-direct/i }));
    await userEvent.click(screen.getByRole("radio", { name: /s3-compatible/i }));
    await userEvent.type(screen.getByLabelText(/^bucket$/i), "family-backups");
    await userEvent.type(screen.getByLabelText(/^region$/i), "us-east-1");
    await userEvent.type(screen.getByLabelText(/^key id$/i), "AKIA");
    await userEvent.type(screen.getByLabelText(/^application key$/i), "SECRETKEY");

    expect(screen.getByRole("button", { name: /finish setup/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/^endpoint$/i), "s3.us-east-1.amazonaws.com");
    await userEvent.click(screen.getByRole("button", { name: /finish setup/i }));

    await waitFor(() =>
      expect(createTarget).toHaveBeenCalledWith(
        expect.objectContaining({ storage_mode: "cloud", endpoint: "s3.us-east-1.amazonaws.com" }),
      ),
    );
  });

  it("shows the server's verification failure inline and stays on the storage step", async () => {
    createTarget.mockRejectedValue({
      response: { data: { error: 'bucket "family-backups" does not have Object Lock enabled' } },
    });
    renderWizard();
    await reachStorage();
    await userEvent.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/object lock/i);
    expect(screen.getByRole("button", { name: /finish setup/i })).toBeInTheDocument();
  });

  it("does not create a second target when a partial failure after it is retried", async () => {
    createToken.mockRejectedValueOnce({ response: { data: { error: "token service unavailable" } } });
    renderWizard();
    await reachStorage();
    await userEvent.click(screen.getByRole("button", { name: /finish setup/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/token service unavailable/i);

    await userEvent.click(screen.getByRole("button", { name: /finish setup/i }));
    await waitFor(() => expect(createToken).toHaveBeenCalledTimes(2));
    expect(createTarget).toHaveBeenCalledTimes(1);
  });

  it("stays on the public URL step with the server's reason when the setup token is wrong", async () => {
    activate.mockRejectedValue({
      response: { status: 403, data: { error: "activation requires the X-WarpHold-Setup-Token header" } },
    });
    renderWizard();
    await fillCredentials();
    await userEvent.click(screen.getByRole("button", { name: /^activate$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/setup-token/i);
    expect(login).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^activate$/i })).toBeInTheDocument();
  });

  it("re-detects the mode and lands on the sign-in page when it is done", async () => {
    renderWizard();
    await reachStorage();
    await userEvent.click(screen.getByRole("button", { name: /finish setup/i }));
    await userEvent.click(await screen.findByRole("button", { name: /open the fleet dashboard/i }));

    expect(onActivated).toHaveBeenCalled();
    expect(await screen.findByText("sign-in screen")).toBeInTheDocument();
  });

  it("skips storage without ever sending the credentials typed into it", async () => {
    renderWizard();
    await reachStorage();
    await userEvent.click(screen.getByRole("radio", { name: /cloud-direct/i }));
    await userEvent.type(screen.getByLabelText(/^bucket$/i), "family-backups");
    await userEvent.type(screen.getByLabelText(/^application key$/i), "SECRETKEY");

    await userEvent.click(screen.getByRole("button", { name: /skip for now/i }));

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Fleet is on.");
    expect(createTarget).not.toHaveBeenCalled();
  });
});

describe("scrubStorage", () => {
  it("keeps only the mode and path, wiping every credential the form ever held", () => {
    const filled = {
      mode: "cloud" as const,
      path: "/custom/path",
      mirror: true,
      mirrorKind: "s3" as const,
      mirrorBucket: "mirror-bucket",
      mirrorRegion: "us-west-004",
      mirrorKeyID: "mirror-key-id",
      mirrorKey: "mirror-secret",
      cloudKind: "s3" as const,
      endpoint: "s3.example.com",
      bucket: "cloud-bucket",
      region: "us-east-1",
      keyID: "cloud-key-id",
      key: "cloud-secret",
    };

    const scrubbed = scrubStorage(filled);

    expect(scrubbed.mode).toBe("cloud");
    expect(scrubbed.path).toBe("/custom/path");
    expect(scrubbed).toMatchObject({
      mirror: false,
      mirrorBucket: "",
      mirrorRegion: "",
      mirrorKeyID: "",
      mirrorKey: "",
      endpoint: "",
      bucket: "",
      region: "",
      keyID: "",
      key: "",
    });
  });
});

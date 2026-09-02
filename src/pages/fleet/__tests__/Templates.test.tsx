import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { Templates } from "../Templates";
import type { AgentOut, Group, Template } from "../../../api/types";

const templates = vi.fn();
const groups = vi.fn();
const agents = vi.fn();
const createTemplate = vi.fn();
const updateTemplate = vi.fn();

vi.mock(import("../../../api/fleet"), async (importOriginal) => ({
  ...(await importOriginal()),
  fleet: {
    templates: () => templates(),
    groups: () => groups(),
    agents: () => agents(),
    createTemplate: (t: unknown) => createTemplate(t),
    updateTemplate: (id: number, t: unknown) => updateTemplate(id, t),
  } as unknown as typeof import("../../../api/fleet").fleet,
}));

const TEMPLATES: Template[] = [
  {
    id: 1,
    name: "Home default",
    sources: ["~", "/etc"],
    policy: {
      scheduling: { intervalSeconds: 3600 },
      files: { ignore: ["~/.cache"] },
      retention: { keepLatest: 10, keepDaily: 7, keepWeekly: 4, keepMonthly: 6 },
      compression: { compressorName: "zstd" },
      errorHandling: { ignoreFileErrors: true },
    },
  },
  { id: 2, name: "Server · system scope", sources: ["/srv"], policy: {} },
];

const GROUPS: Group[] = [
  { id: 1, name: "Laptops", target_id: 1, template_id: 1 },
  { id: 2, name: "Servers", target_id: 1, template_id: 2 },
];

function agent(id: string, groupID: number): AgentOut {
  return {
    id,
    name: id,
    hostname: id,
    os: "linux",
    arch: "amd64",
    version: "0.1.1",
    scope: "user",
    group_id: groupID,
    enrolled_at: "2026-08-01T00:00:00Z",
    last_seen_at: null,
    revoked_at: null,
    health: "green",
  };
}

beforeEach(() => {
  templates.mockReset().mockResolvedValue(TEMPLATES);
  groups.mockReset().mockResolvedValue(GROUPS);
  agents.mockReset().mockResolvedValue([agent("a", 1), agent("b", 1), agent("c", 2)]);
  createTemplate.mockReset().mockResolvedValue({ id: 3 });
  updateTemplate.mockReset().mockResolvedValue(undefined);
});

/** The Advanced drawer's editor, parsed. */
function editorPolicy(): unknown {
  return JSON.parse((screen.getByLabelText(/policy json/i) as HTMLTextAreaElement).value);
}

describe("Templates", () => {
  it("opens the first template with its policy spread across the form", async () => {
    render(<Templates />);

    expect(await screen.findByText("used by Laptops")).toBeInTheDocument();
    expect(screen.getByLabelText(/template name/i)).toHaveValue("Home default");
    expect(screen.getByLabelText(/sources/i)).toHaveValue("~\n/etc");
    expect(screen.getByLabelText(/^schedule$/i)).toHaveValue("hourly");
    expect(screen.getByLabelText(/exclude/i)).toHaveValue("~/.cache");
    expect(screen.getByLabelText(/keep daily/i)).toHaveValue("7");
    expect(screen.getByLabelText(/compression/i)).toHaveValue("zstd");
    expect(screen.getByRole("button", { name: /save & push to 2 devices/i })).toBeInTheDocument();
  });

  it("writes a form change straight into the Advanced JSON", async () => {
    render(<Templates />);
    await screen.findByText("used by Laptops");

    await userEvent.selectOptions(screen.getByLabelText(/^schedule$/i), "daily");
    await userEvent.clear(screen.getByLabelText(/keep monthly/i));
    await userEvent.type(screen.getByLabelText(/keep monthly/i), "12");

    expect(editorPolicy()).toMatchObject({
      scheduling: { timeOfDay: [{ hour: 3, min: 0 }] },
      retention: { keepMonthly: 12 },
      // A section the form does not own survives the edit.
      errorHandling: { ignoreFileErrors: true },
    });
  });

  it("follows an edit made in the Advanced JSON", async () => {
    render(<Templates />);
    await screen.findByText("used by Laptops");

    const editor = screen.getByLabelText(/policy json/i);
    await userEvent.clear(editor);
    await userEvent.type(editor, '{{"compression":{{"compressorName":"none"}}}');

    expect(screen.getByLabelText(/compression/i)).toHaveValue("none");
    expect(screen.getByLabelText(/keep daily/i)).toHaveValue("");
  });

  it("refuses to save invalid JSON without asking the server", async () => {
    render(<Templates />);
    await screen.findByText("used by Laptops");

    const editor = screen.getByLabelText(/policy json/i);
    await userEvent.clear(editor);
    await userEvent.type(editor, "{{oops");

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save & push/i })).toBeDisabled();
    expect(updateTemplate).not.toHaveBeenCalled();
  });

  it("saves the merged policy and the sources", async () => {
    render(<Templates />);
    await screen.findByText("used by Laptops");

    await userEvent.selectOptions(screen.getByLabelText(/compression/i), "none");
    await userEvent.click(screen.getByRole("button", { name: /save & push/i }));

    await waitFor(() =>
      expect(updateTemplate).toHaveBeenCalledWith(1, {
        name: "Home default",
        sources: ["~", "/etc"],
        policy: {
          scheduling: { intervalSeconds: 3600 },
          files: { ignore: ["~/.cache"] },
          retention: { keepLatest: 10, keepDaily: 7, keepWeekly: 4, keepMonthly: 6 },
          compression: { compressorName: "none" },
          errorHandling: { ignoreFileErrors: true },
        },
      }),
    );
  });

  it("shows the server's policy rejection beside the editor", async () => {
    updateTemplate.mockRejectedValue({
      response: { status: 400, data: { error: 'json: unknown field "retenshun"' } },
    });
    render(<Templates />);
    await screen.findByText("used by Laptops");

    await userEvent.click(screen.getByRole("button", { name: /save & push/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("retenshun");
  });

  it("creates a new template from the empty form", async () => {
    render(<Templates />);
    await userEvent.click(await screen.findByRole("button", { name: /new template/i }));

    await userEvent.type(screen.getByLabelText(/template name/i), "Family · docs");
    await userEvent.type(screen.getByLabelText(/sources/i), "~/Documents");
    await userEvent.selectOptions(screen.getByLabelText(/^schedule$/i), "manual");
    await userEvent.click(screen.getByRole("button", { name: /create template/i }));

    await waitFor(() =>
      expect(createTemplate).toHaveBeenCalledWith({
        name: "Family · docs",
        sources: ["~/Documents"],
        policy: { scheduling: { manual: true } },
      }),
    );
  });

  it("opens the created template once the reloaded list holds it", async () => {
    render(<Templates />);
    await userEvent.click(await screen.findByRole("button", { name: /new template/i }));

    await userEvent.type(screen.getByLabelText(/template name/i), "Family · docs");
    await userEvent.type(screen.getByLabelText(/sources/i), "~/Documents");
    // The reload after the save is what first sees the new template.
    templates.mockResolvedValue([
      ...TEMPLATES,
      { id: 3, name: "Family · docs", sources: ["~/Documents"], policy: { scheduling: { manual: true } } },
    ]);
    await userEvent.click(screen.getByRole("button", { name: /create template/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
    await waitFor(() => expect(screen.getByLabelText(/template name/i)).toHaveValue("Family · docs"));
    expect(screen.getByLabelText(/sources/i)).toHaveValue("~/Documents");
    expect(screen.getByRole("button", { name: /save & push/i })).toBeInTheDocument();
  });

  it("confirms an update without losing the editor", async () => {
    render(<Templates />);
    await screen.findByText("used by Laptops");

    await userEvent.selectOptions(screen.getByLabelText(/compression/i), "none");
    await userEvent.click(screen.getByRole("button", { name: /save & push/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
    expect(screen.getByLabelText(/template name/i)).toHaveValue("Home default");
  });

  it("discards edits back to what the server holds", async () => {
    render(<Templates />);
    await screen.findByText("used by Laptops");

    await userEvent.selectOptions(screen.getByLabelText(/compression/i), "none");
    await userEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(screen.getByLabelText(/compression/i)).toHaveValue("zstd");
    expect(updateTemplate).not.toHaveBeenCalled();
  });
});

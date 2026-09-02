import React from "react";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tasks } from "../../src/pages/Tasks";
import { UIPreferencesContext } from "../../src/contexts/UIPreferencesContext";
import { setupAPIMock } from "../testutils/api-mocks";
import "@testing-library/jest-dom";
import { fireEvent } from "@testing-library/react";
import { setupIntervalMocks, cleanupIntervalMocks, triggerIntervals } from "../testutils/interval-mocks";

let axiosMock;

// Mock react-router Link component using unified helper
vi.mock("react-router", async () => {
  const { createRouterMock } = await import("../testutils/react-router-mock.jsx");
  return createRouterMock({ components: { only: true } })();
});

// Minimal UIPreferences context value
const mockUIPreferences = {
  pageSize: 10,
  theme: "light",
  bytesStringBase2: false,
  defaultSnapshotViewAll: false,
  fontSize: "fs-6",
  setTheme: vi.fn(),
  setPageSize: vi.fn(),
  setByteStringBase: vi.fn(),
  setDefaultSnapshotViewAll: vi.fn(),
  setFontSize: vi.fn(),
};

/**
 * Helper function to render Tasks component with necessary providers
 */
const renderTasks = () => {
  return render(
    <UIPreferencesContext.Provider value={mockUIPreferences}>
      <Tasks />
    </UIPreferencesContext.Provider>,
  );
};

/**
 * Setup API mocks before each test
 */
beforeEach(() => {
  axiosMock = setupAPIMock();
  // The running-task card mounts <Logs>, which polls this endpoint.
  axiosMock.onGet(/\/api\/v1\/tasks\/[^/]+\/logs/).reply(200, { logs: [] });
  // Clear all previous mocks
  vi.clearAllMocks();

  // Setup interval mocking
  setupIntervalMocks();
});

/**
 * Clean up after each test
 */
afterEach(() => {
  axiosMock.reset();
  cleanupIntervalMocks();
});

describe("Tasks component", () => {
  test("shows loading state initially", () => {
    // Mock a delayed response
    axiosMock.onGet("/api/v1/tasks").reply(() => {
      return new Promise(() => {
        // Never resolve to keep loading state
      });
    });

    renderTasks();
    expect(screen.getByText("Loading ...")).toBeInTheDocument();
  });

  test("shows info message when no tasks exist", async () => {
    axiosMock.onGet("/api/v1/tasks").reply(200, { tasks: [] });

    renderTasks();

    await waitFor(() => {
      expect(
        screen.getByText(/A list of tasks will appear here when you create snapshots, restore, run maintenance, etc./),
      ).toBeInTheDocument();
    });
  });

  test("displays tasks in table", async () => {
    const tasks = [
      {
        id: "task1",
        kind: "Snapshot",
        description: "Backing up /home/user",
        status: "SUCCESS",
        startTime: "2023-01-01T10:00:00Z",
      },
      {
        id: "task2",
        kind: "Maintenance",
        description: "Repository maintenance",
        status: "RUNNING",
        startTime: "2023-01-01T11:00:00Z",
      },
    ];

    axiosMock.onGet("/api/v1/tasks").reply(200, { tasks });

    renderTasks();

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getByText("Backing up /home/user")).toBeInTheDocument();
    });

    // The running one is a card above the table, not a row in it.
    expect(screen.getByTestId("running-task")).toHaveTextContent("Maintenance Repository maintenance");
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(1);
  });

  test("filters tasks by status", async () => {
    const tasks = [
      {
        id: "task1",
        kind: "Snapshot",
        description: "Task 1",
        status: "SUCCESS",
        startTime: "2023-01-01T10:00:00Z",
      },
      {
        id: "task2",
        kind: "Maintenance",
        description: "Task 2",
        status: "RUNNING",
        startTime: "2023-01-01T11:00:00Z",
      },
      {
        id: "task3",
        kind: "Restore",
        description: "Task 3",
        status: "FAILED",
        startTime: "2023-01-01T12:00:00Z",
      },
    ];

    axiosMock.onGet("/api/v1/tasks").reply(200, { tasks });

    renderTasks();

    await waitFor(() => {
      expect(screen.getByText("Task 1")).toBeInTheDocument();
    });
    // The running one leads as a card; the finished ones are rows.
    expect(screen.getByTestId("running-task")).toHaveTextContent("Task 2");
    expect(screen.getByText("Task 3")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Status"), "Running");

    // Filtering to Running puts them back in the table alongside their cards.
    expect(screen.queryByText("Task 1")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("Task 2");
    expect(screen.queryByText("Task 3")).not.toBeInTheDocument();
  });

  test("filters tasks by kind", async () => {
    const tasks = [
      {
        id: "task1",
        kind: "Snapshot",
        description: "Snapshot task",
        status: "SUCCESS",
        startTime: "2023-01-01T10:00:00Z",
      },
      {
        id: "task2",
        kind: "Maintenance",
        description: "Maintenance task",
        status: "SUCCESS",
        startTime: "2023-01-01T11:00:00Z",
      },
      {
        id: "task3",
        kind: "Restore",
        description: "Restore task",
        status: "SUCCESS",
        startTime: "2023-01-01T12:00:00Z",
      },
    ];

    axiosMock.onGet("/api/v1/tasks").reply(200, { tasks });

    renderTasks();

    await waitFor(() => {
      expect(screen.getByText("Snapshot task")).toBeInTheDocument();
      expect(screen.getByText("Maintenance task")).toBeInTheDocument();
      expect(screen.getByText("Restore task")).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByLabelText("Kind"), "Snapshot");

    // Should only show snapshot tasks
    expect(screen.getByText("Snapshot task")).toBeInTheDocument();
    expect(screen.queryByText("Maintenance task")).not.toBeInTheDocument();
    expect(screen.queryByText("Restore task")).not.toBeInTheDocument();
  });

  test("filters tasks by description search", async () => {
    const tasks = [
      {
        id: "task1",
        kind: "Snapshot",
        description: "Backing up important files",
        status: "SUCCESS",
        startTime: "2023-01-01T10:00:00Z",
      },
      {
        id: "task2",
        kind: "Snapshot",
        description: "Backing up documents",
        status: "SUCCESS",
        startTime: "2023-01-01T11:00:00Z",
      },
      {
        id: "task3",
        kind: "Maintenance",
        description: "Repository cleanup",
        status: "SUCCESS",
        startTime: "2023-01-01T12:00:00Z",
      },
    ];

    axiosMock.onGet("/api/v1/tasks").reply(200, { tasks });

    renderTasks();

    await waitFor(() => {
      expect(screen.getByText("Backing up important files")).toBeInTheDocument();
      expect(screen.getByText("Backing up documents")).toBeInTheDocument();
      expect(screen.getByText("Repository cleanup")).toBeInTheDocument();
    });

    // Search for "documents"
    const searchInput = screen.getByPlaceholderText("case-sensitive search description");
    fireEvent.change(searchInput, { target: { value: "documents" } });

    // Should only show tasks with "documents" in description
    expect(screen.queryByText("Backing up important files")).not.toBeInTheDocument();
    expect(screen.getByText("Backing up documents")).toBeInTheDocument();
    expect(screen.queryByText("Repository cleanup")).not.toBeInTheDocument();
  });

  test("combines multiple filters", async () => {
    const tasks = [
      {
        id: "task1",
        kind: "Snapshot",
        description: "Backing up files",
        status: "SUCCESS",
        startTime: "2023-01-01T10:00:00Z",
      },
      {
        id: "task2",
        kind: "Snapshot",
        description: "Backing up files",
        status: "RUNNING",
        startTime: "2023-01-01T11:00:00Z",
      },
      {
        id: "task3",
        kind: "Maintenance",
        description: "Backing up files",
        status: "RUNNING",
        startTime: "2023-01-01T12:00:00Z",
      },
    ];

    axiosMock.onGet("/api/v1/tasks").reply(200, { tasks });

    renderTasks();

    await waitFor(() => {
      // One finished row in the table; the two running ones are cards above it.
      expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(1);
    });
    expect(screen.getAllByTestId("running-task")).toHaveLength(2);

    await userEvent.selectOptions(screen.getByLabelText("Status"), "Running");
    await userEvent.selectOptions(screen.getByLabelText("Kind"), "Snapshot");

    // Should only show task2 (Snapshot + Running)
    const rows = screen.getByRole("table").querySelectorAll("tbody tr");
    expect(rows).toHaveLength(1);
  });

  test("handles API error gracefully", async () => {
    axiosMock.onGet("/api/v1/tasks").reply(500, { message: "Server error" });

    renderTasks();

    await waitFor(() => {
      expect(screen.getByText("Request failed with status code 500")).toBeInTheDocument();
    });
  });

  test("refreshes tasks periodically", async () => {
    const initialTasks = [
      {
        id: "task1",
        kind: "Snapshot",
        description: "Initial task",
        status: "RUNNING",
        startTime: "2023-01-01T10:00:00Z",
      },
    ];

    const updatedTasks = [
      {
        id: "task1",
        kind: "Snapshot",
        description: "Initial task",
        status: "SUCCESS",
        startTime: "2023-01-01T10:00:00Z",
      },
      {
        id: "task2",
        kind: "Maintenance",
        description: "New task",
        status: "RUNNING",
        startTime: "2023-01-01T10:05:00Z",
      },
    ];

    // First response
    axiosMock.onGet("/api/v1/tasks").replyOnce(200, { tasks: initialTasks });

    renderTasks();

    // It starts as the running card...
    await waitFor(() => {
      expect(screen.getByTestId("running-task")).toHaveTextContent("Initial task");
    });

    // Update mock for next request
    axiosMock.onGet("/api/v1/tasks").reply(200, { tasks: updatedTasks });

    // Trigger the interval callback manually
    await triggerIntervals();

    // ...and once it finishes it drops into the table, with the new running
    // task taking over the card.
    await waitFor(() => {
      expect(screen.getByRole("table")).toHaveTextContent("Initial task");
    });
    expect(screen.getByTestId("running-task")).toHaveTextContent("New task");
  });

  test("task links are rendered with correct structure", async () => {
    // Since we're mocking react-router Link to render as <a href="#">,
    // we can't test the actual routing, but we can test the link structure
    const tasks = [
      {
        id: "task123",
        kind: "Snapshot",
        description: "Test task",
        status: "SUCCESS",
        startTime: "2023-01-01T10:00:00Z",
      },
    ];

    axiosMock.onGet("/api/v1/tasks").reply(200, { tasks });

    renderTasks();

    await waitFor(() => {
      // The real KopiaTable renders links in the task cells
      const links = screen.getAllByRole("link");
      // At least one link should exist
      expect(links.length).toBeGreaterThan(0);
      // The link text should be a relative time (from moment.js)
      // Since the test data uses 2023-01-01, it will show something like "3 years ago"
      const linkText = links[0].textContent;
      expect(linkText).toMatch(/\d+ years? ago/);
    });
  });

  describe("running task card", () => {
    const runningTask = (counters) => ({
      id: "task-running",
      kind: "Snapshot",
      description: "Backing up /home/user",
      status: "RUNNING",
      startTime: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      progressInfo: "hashing /home/user/Projects",
      counters,
    });

    test("shows progress from the byte counters", async () => {
      axiosMock.onGet("/api/v1/tasks").reply(200, {
        tasks: [
          runningTask({
            "Processed Bytes": { value: 1_200_000_000, units: "bytes" },
            "Estimated Bytes": { value: 3_100_000_000, units: "bytes" },
          }),
        ],
      });

      renderTasks();

      const card = await screen.findByTestId("running-task");
      expect(card).toHaveTextContent("Snapshot Backing up /home/user");
      expect(card).toHaveTextContent("39%");
      expect(card).toHaveTextContent("elapsed");
      expect(screen.getByRole("progressbar", { name: "Progress of Backing up /home/user" })).toHaveAttribute(
        "aria-valuenow",
        "39",
      );
    });

    test("falls back to the server's progress line when there are no byte counters", async () => {
      axiosMock.onGet("/api/v1/tasks").reply(200, { tasks: [runningTask({})] });

      renderTasks();

      const card = await screen.findByTestId("running-task");
      expect(card).toHaveTextContent("hashing /home/user/Projects");
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    test("tails the task log", async () => {
      // The catch-all logs handler from beforeEach is registered first and would
      // win, so this test starts from a clean set of handlers.
      axiosMock.resetHandlers();
      axiosMock.onGet("/api/v1/tasks/task-running/logs").reply(200, {
        logs: [{ ts: 1672531200, level: "info", msg: "snapshot started" }],
      });
      axiosMock.onGet("/api/v1/tasks").reply(200, { tasks: [runningTask({})] });

      renderTasks();

      await waitFor(() => {
        expect(screen.getByTestId("task-logs")).toHaveTextContent("snapshot started");
      });
    });

    test("the kind filter applies to the cards, the status filter does not", async () => {
      axiosMock.onGet("/api/v1/tasks").reply(200, {
        tasks: [
          runningTask({}),
          { ...runningTask({}), id: "task-maint", kind: "Maintenance", description: "Compacting indexes" },
        ],
      });

      renderTasks();

      await waitFor(() => expect(screen.getAllByTestId("running-task")).toHaveLength(2));

      // Status is about the table, so the cards are untouched by it.
      await userEvent.selectOptions(screen.getByLabelText("Status"), "Failed");
      expect(screen.getAllByTestId("running-task")).toHaveLength(2);

      // Kind narrows what "happening now" means, so the cards follow.
      await userEvent.selectOptions(screen.getByLabelText("Kind"), "Maintenance");
      const cards = screen.getAllByTestId("running-task");
      expect(cards).toHaveLength(1);
      expect(cards[0]).toHaveTextContent("Compacting indexes");
    });

    test("cancels the task from the card", async () => {
      axiosMock.onGet("/api/v1/tasks").reply(200, { tasks: [runningTask({})] });
      axiosMock.onPost("/api/v1/tasks/task-running/cancel").reply(200, {});

      renderTasks();

      const card = await screen.findByTestId("running-task");
      await userEvent.click(within(card).getByRole("button", { name: /Cancel/ }));

      await waitFor(() => {
        expect(axiosMock.history.post.some((r) => r.url === "/api/v1/tasks/task-running/cancel")).toBe(true);
      });
    });
  });
});

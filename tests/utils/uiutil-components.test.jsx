import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import { sizeWithFailures } from "../../src/utils/uiutil";
import { taskStatusSymbol } from "../../src/utils/taskutil";

describe("sizeWithFailures", () => {
  it("returns empty string for undefined size", () => {
    expect(sizeWithFailures(undefined)).toBe("");
  });

  it("returns simple size display without errors", () => {
    const result = sizeWithFailures(1024, null, false);
    expect(result.props.children).toBe("1 KB");
  });

  it("returns simple size display when no failures", () => {
    const summ = { errors: [], numFailed: 0 };
    const result = sizeWithFailures(1024, summ, false);
    expect(result.props.children).toBe("1 KB");
  });

  it("shows error icon when there are failures", () => {
    const summ = {
      errors: [{ path: "/test", error: "Permission denied" }],
      numFailed: 1,
    };
    const result = sizeWithFailures(1024, summ, false);

    // Should be a span containing size, nbsp, and error icon
    expect(result.type).toBe("span");
    expect(result.props.children).toHaveLength(3);
    // First child should be the size, second is nbsp, third is the icon
    expect(result.props.children[0]).toBe("1 KB");
  });

  it("formats multiple errors correctly", () => {
    const summ = {
      errors: [
        { path: "/test1", error: "Error 1" },
        { path: "/test2", error: "Error 2" },
      ],
      numFailed: 2,
    };
    const result = sizeWithFailures(1024, summ, false);

    expect(result.type).toBe("span");
    // Check that error icon has the correct title format
    const errorIcon = result.props.children[2]; // Third element is the icon
    expect(errorIcon.props.title).toContain("Encountered 2 errors:");
    expect(errorIcon.props.title).toContain("- /test1: Error 1");
    expect(errorIcon.props.title).toContain("- /test2: Error 2");
  });

  it("formats single error without prefix", () => {
    const summ = {
      errors: [{ path: "/test", error: "Single error" }],
      numFailed: 1,
    };
    const result = sizeWithFailures(1024, summ, false);

    const errorIcon = result.props.children[2]; // Third element is the icon
    expect(errorIcon.props.title).toContain("Error: ");
    expect(errorIcon.props.title).toContain("/test: Single error");
    expect(errorIcon.props.title).not.toContain("- /test");
  });
});

describe("taskStatusSymbol", () => {
  const baseTask = {
    id: "task-123",
    startTime: "2023-01-01T12:00:00Z",
    endTime: "2023-01-01T12:01:30Z",
  };

  it("shows running status with a spinner and a cancel button", () => {
    render(taskStatusSymbol({ ...baseTask, status: "RUNNING", endTime: null }));

    expect(screen.getByText(/Running for/)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel task" })).toBeInTheDocument();
  });

  it("shows success status", () => {
    render(taskStatusSymbol({ ...baseTask, status: "SUCCESS" }));
    expect(screen.getByText(/Finished in/)).toBeInTheDocument();
  });

  it("shows failed status", () => {
    render(taskStatusSymbol({ ...baseTask, status: "FAILED" }));
    expect(screen.getByText(/Failed after/)).toBeInTheDocument();
  });

  it("shows canceled status", () => {
    render(taskStatusSymbol({ ...baseTask, status: "CANCELED" }));
    expect(screen.getByText(/Canceled after/)).toBeInTheDocument();
  });

  it("returns status string for unknown status", () => {
    expect(taskStatusSymbol({ ...baseTask, status: "UNKNOWN" })).toBe("UNKNOWN");
  });
});

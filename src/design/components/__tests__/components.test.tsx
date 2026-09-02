import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import "@testing-library/jest-dom";
import {
  Button,
  Card,
  Dialog,
  Eyebrow,
  Field,
  HealthBar,
  Input,
  Kpi,
  Nav,
  Pill,
  Select,
  Strip,
  Table,
  Toast,
} from "../index";

describe("Button", () => {
  it("renders children and fires onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Snapshot now</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Snapshot now" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies the primary tone", () => {
    render(<Button variant="primary">Add device</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-ember");
  });

  it("applies the danger tone", () => {
    render(<Button variant="danger">Revoke</Button>);
    expect(screen.getByRole("button").className).toContain("danger");
  });

  it("merges a caller className and forwards button props", () => {
    render(
      <Button className="w-full" disabled type="submit">
        Go
      </Button>,
    );
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("w-full");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("type", "submit");
  });
});

describe("Eyebrow", () => {
  it("renders uppercase mono label text", () => {
    render(<Eyebrow>Devices</Eyebrow>);
    const el = screen.getByText("Devices");
    expect(el).toHaveClass("uppercase");
    expect(el).toHaveClass("font-mono");
  });
});

describe("Kpi", () => {
  it("shows label, value, unit and sub", () => {
    render(<Kpi label="Stored" value="1.84" unit="TB" sub="3.1x dedup" />);
    expect(screen.getByText("Stored")).toBeInTheDocument();
    expect(screen.getByText("1.84")).toBeInTheDocument();
    expect(screen.getByText("TB")).toBeInTheDocument();
    expect(screen.getByText("3.1x dedup")).toBeInTheDocument();
  });

  it("renders a zero unit and sub", () => {
    render(<Kpi label="Stored" value={0} unit={0} sub={0} />);
    expect(screen.getAllByText("0")).toHaveLength(3);
  });

  it("colors the value by tone", () => {
    render(<Kpi label="Protected" value={5} tone="good" />);
    expect(screen.getByText("5")).toHaveClass("text-good");
  });
});

describe("Pill", () => {
  it("applies the tone class", () => {
    render(<Pill tone="bad">Failing</Pill>);
    expect(screen.getByText("Failing")).toHaveClass("text-bad");
  });
});

describe("HealthBar", () => {
  it("renders an 8x28 bar in the tone color", () => {
    render(<HealthBar tone="warn" data-testid="bar" />);
    const bar = screen.getByTestId("bar");
    expect(bar).toHaveClass("bg-warn");
    expect(bar).toHaveStyle({ height: "28px" });
  });

  it("honours a custom height", () => {
    render(<HealthBar tone="good" height={36} data-testid="bar" />);
    expect(screen.getByTestId("bar")).toHaveStyle({ height: "36px" });
  });
});

describe("Strip", () => {
  it("renders one cell per day", () => {
    const days = Array.from({ length: 30 }, () => "good" as const);
    const { container } = render(<Strip days={days} />);
    expect(container.querySelectorAll("span")).toHaveLength(30);
  });

  it("renders missing days in the line color", () => {
    const { container } = render(<Strip days={["none", "bad"]} />);
    const cells = container.querySelectorAll("span");
    expect(cells[0]).toHaveClass("bg-line");
    expect(cells[1]).toHaveClass("bg-bad");
  });
});

describe("Card", () => {
  it("renders children on the panel background", () => {
    render(<Card>content</Card>);
    expect(screen.getByText("content")).toHaveClass("bg-panel");
  });

  it("applies the bad tone", () => {
    render(<Card tone="bad">boom</Card>);
    expect(screen.getByText("boom")).toHaveClass("bg-bad-panel");
  });
});

describe("Field / Input / Select", () => {
  it("labels an input and forwards the ref", () => {
    const ref = React.createRef<HTMLInputElement>();
    render(
      <Field label="Group">
        <Input ref={ref} defaultValue="Laptops" />
      </Field>,
    );
    expect(screen.getByText("Group")).toBeInTheDocument();
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current).toHaveValue("Laptops");
  });

  it("forwards the select ref and renders options", () => {
    const ref = React.createRef<HTMLSelectElement>();
    render(
      <Select ref={ref} defaultValue="b">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByRole("combobox")).toHaveValue("b");
  });

  it("draws a visible focus ring on the focused input", () => {
    render(<Input aria-label="passphrase" />);
    const input = screen.getByLabelText("passphrase");
    act(() => input.focus());
    expect(input).toHaveFocus();
    expect(input.className).toContain("focus-visible:ring-2");
    expect(input.className).toContain("focus-visible:ring-ember");
  });
});

describe("Table", () => {
  const columns = [
    { key: "name", label: "Device" },
    { key: "group", label: "Group" },
  ];
  const rows = [
    { key: "a", cells: ["laptop-1", "Laptops"] },
    { key: "b", cells: ["media-nuc", "Servers"] },
  ];

  it("renders headers and rows with the grid template", () => {
    const { container } = render(<Table columns={columns} rows={rows} template="1fr 2fr" />);
    expect(screen.getByText("Device")).toBeInTheDocument();
    expect(screen.getByText("media-nuc")).toBeInTheDocument();
    expect(container.querySelector('[data-row="a"]')).toHaveStyle({ gridTemplateColumns: "1fr 2fr" });
  });

  it("calls onRowClick with the row key", () => {
    const onRowClick = vi.fn();
    render(<Table columns={columns} rows={rows} template="1fr 2fr" onRowClick={onRowClick} />);
    fireEvent.click(screen.getByText("laptop-1"));
    expect(onRowClick).toHaveBeenCalledWith("a");
  });
});

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="Add device">
        body
      </Dialog>,
    );
    expect(screen.queryByText("Add device")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the title and body when open", () => {
    render(
      <Dialog open onClose={vi.fn()} title="Add device">
        body
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Add device")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("closes on overlay click and on Escape but not on card click", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Add device">
        body
      </Dialog>,
    );
    fireEvent.click(screen.getByText("body"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("dialog-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("Dialog focus", () => {
  function Harness() {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        <Dialog open={open} onClose={() => setOpen(false)} title="Add device">
          <Input aria-label="token" />
          <Button>Copy</Button>
        </Dialog>
      </>
    );
  }

  it("names the dialog by its title heading", () => {
    render(
      <Dialog open onClose={vi.fn()} title={<span>Add device</span>}>
        body
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Add device");
  });

  it("moves focus in on open, traps Tab and restores focus on close", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);

    const token = screen.getByLabelText("token");
    const copy = screen.getByRole("button", { name: "Copy" });
    expect(token).toHaveFocus();

    copy.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(token).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(copy).toHaveFocus();

    // Focus parked on the card itself still wraps to the last item.
    screen.getByRole("dialog").focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(copy).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe("Toast", () => {
  // Restored here rather than at the end of the timer test: a failed
  // assertion there would otherwise leave the rest of the file on fake timers.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the message with its tone", () => {
    render(<Toast message="Snapshot started" tone="good" onDismiss={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Snapshot started");
    expect(screen.getByRole("status")).toHaveClass("border-good");
  });

  it("dismisses itself after 5 seconds", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="Saved" onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("Nav", () => {
  const items = [
    { to: "/overview", label: "Overview" },
    { to: "/devices", label: "Devices" },
  ];

  it("marks the current item and links the rest", () => {
    render(
      <MemoryRouter>
        <Nav items={items} current="/devices" />
      </MemoryRouter>,
    );
    const devices = screen.getByRole("link", { name: "Devices" });
    expect(devices).toHaveAttribute("href", "/devices");
    expect(devices).toHaveAttribute("aria-current", "page");
    expect(devices).toHaveClass("border-ember");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });
});

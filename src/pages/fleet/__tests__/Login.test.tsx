import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { Login } from "../Login";

const login = vi.fn();

vi.mock(import("../../../api/fleet"), async (importOriginal) => ({
  ...(await importOriginal()),
  fleet: {
    login: (...args: unknown[]) => login(...args),
  } as unknown as typeof import("../../../api/fleet").fleet,
}));

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/fleet/login"]}>
      <Routes>
        <Route path="/fleet/login" element={<Login />} />
        <Route path="/fleet" element={<div>overview screen</div>} />
        <Route path="/fleet/activate" element={<div>activate wizard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  login.mockReset();
});

describe("Login", () => {
  it("renders the sign-in form", () => {
    renderLogin();

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("posts the credentials and lands on the overview", async () => {
    login.mockResolvedValue(undefined);
    renderLogin();

    await userEvent.type(screen.getByLabelText(/email/i), "hody@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "correct horse");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("hody@example.com", "correct horse"));
    expect(await screen.findByText("overview screen")).toBeInTheDocument();
  });

  it("shows a wrong-credentials message on 401 and stays put", async () => {
    login.mockRejectedValue({ response: { status: 401, data: { error: "wrong email or password" } } });
    renderLogin();

    await userEvent.type(screen.getByLabelText(/email/i), "hody@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/wrong email or password/i);
    expect(screen.queryByText("overview screen")).not.toBeInTheDocument();
  });

  it("explains the rate limit on 429", async () => {
    login.mockRejectedValue({ response: { status: 429, data: { error: "too many attempts, wait a minute" } } });
    renderLogin();

    await userEvent.type(screen.getByLabelText(/email/i), "hody@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
  });

  it("sends an unactivated fleet to the activation wizard", async () => {
    login.mockRejectedValue({ response: { status: 409, data: { error: "fleet is not activated" } } });
    renderLogin();

    await userEvent.type(screen.getByLabelText(/email/i), "hody@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "whatever pass");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("activate wizard")).toBeInTheDocument();
  });
});

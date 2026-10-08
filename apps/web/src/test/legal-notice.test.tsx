import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LegalNotice } from "../components/LegalNotice";

const KEY = "poker-club-rules-accepted";

beforeEach(() => {
  localStorage.removeItem(KEY);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = true;
      }),
    },
    close: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = false;
      }),
    },
  });
});

function preview() {
  render(
    <MemoryRouter>
      <LegalNotice />
      <Link to="/">Вернуться к клубу</Link>
    </MemoryRouter>,
  );
}

describe("club rules consent", () => {
  it("records consent only after the checkbox and confirmation, never on Escape", () => {
    preview();
    const dialog = screen.getByRole("dialog");
    const button = screen.getByRole("button", { name: "Продолжить" });
    expect(button).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBe("1");
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("lets visitors read the rules, then asks for consent when they return", () => {
    preview();
    fireEvent.click(screen.getByRole("link", { name: "правила клуба" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");

    fireEvent.click(screen.getByRole("link", { name: "Вернуться к клубу" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeDisabled();
  });
});

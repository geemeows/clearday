import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CardDetailPane } from "#/features/projects/CardDetailPane";
import type { StoredCard, StoredColumn } from "#/features/projects/store";

function makeCard(overrides: Partial<StoredCard> = {}): StoredCard {
  return {
    id: "card1",
    project_id: "p1",
    column_id: "col1",
    order: 0,
    title: "My card",
    body: null,
    priority: null,
    tags: [],
    due_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeColumn(overrides: Partial<StoredColumn> = {}): StoredColumn {
  return {
    id: "col1",
    project_id: "p1",
    name: "Backlog",
    order: 0,
    wip_limit: null,
    ...overrides,
  };
}

const columns = [
  makeColumn({ id: "col1", name: "Backlog" }),
  makeColumn({ id: "col2", name: "Done", order: 1 }),
];

// ─── rendering ───────────────────────────────────────────────────────────────

describe("CardDetailPane rendering", () => {
  it("renders the card title in the title input", () => {
    render(
      <CardDetailPane
        card={makeCard({ title: "Fix the bug" })}
        columns={columns}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      (screen.getByRole("textbox", { name: "Card title" }) as HTMLInputElement).value,
    ).toBe("Fix the bug");
  });

  it("renders body when present", () => {
    render(
      <CardDetailPane
        card={makeCard({ body: "Some details here" })}
        columns={columns}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      (screen.getByRole("textbox", { name: "Card body" }) as HTMLTextAreaElement).value,
    ).toBe("Some details here");
  });

  it("renders existing tags as chips", () => {
    render(
      <CardDetailPane
        card={makeCard({ tags: ["frontend", "urgent"] })}
        columns={columns}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Remove tag frontend" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove tag urgent" })).toBeTruthy();
  });

  it("renders priority select with current value", () => {
    render(
      <CardDetailPane
        card={makeCard({ priority: "p1" })}
        columns={columns}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      (screen.getByRole("combobox", { name: "Priority" }) as unknown as HTMLSelectElement).value,
    ).toBe("p1");
  });

  it("renders due date with current value", () => {
    render(
      <CardDetailPane
        card={makeCard({ due_at: "2026-06-15T00:00:00.000Z" })}
        columns={columns}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Due date") as HTMLInputElement;
    expect(input.value).toBe("2026-06-15");
  });
});

// ─── title ───────────────────────────────────────────────────────────────────

describe("CardDetailPane title", () => {
  it("calls onChange with trimmed title on blur", () => {
    const onChange = vi.fn();
    render(
      <CardDetailPane
        card={makeCard({ title: "Original" })}
        columns={columns}
        onChange={onChange}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Card title" });
    fireEvent.change(input, { target: { value: "  Updated  " } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ title: "Updated" });
  });

  it("resets to original title when cleared", () => {
    const onChange = vi.fn();
    render(
      <CardDetailPane
        card={makeCard({ title: "Original" })}
        columns={columns}
        onChange={onChange}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Card title" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("Original");
  });

  it("does not call onChange when title is unchanged", () => {
    const onChange = vi.fn();
    render(
      <CardDetailPane
        card={makeCard({ title: "Same" })}
        columns={columns}
        onChange={onChange}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Card title" });
    fireEvent.change(input, { target: { value: "Same" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ─── body ─────────────────────────────────────────────────────────────────────

describe("CardDetailPane body", () => {
  it("calls onChange with body text on blur", () => {
    const onChange = vi.fn();
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={onChange}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const textarea = screen.getByRole("textbox", { name: "Card body" });
    fireEvent.change(textarea, { target: { value: "Some notes" } });
    fireEvent.blur(textarea);
    expect(onChange).toHaveBeenCalledWith({ body: "Some notes" });
  });

  it("calls onChange with null when body is cleared", () => {
    const onChange = vi.fn();
    render(
      <CardDetailPane
        card={makeCard({ body: "Existing" })}
        columns={columns}
        onChange={onChange}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const textarea = screen.getByRole("textbox", { name: "Card body" });
    fireEvent.change(textarea, { target: { value: "" } });
    fireEvent.blur(textarea);
    expect(onChange).toHaveBeenCalledWith({ body: null });
  });
});

// ─── column ──────────────────────────────────────────────────────────────────

describe("CardDetailPane column", () => {
  it("calls onChange with new column_id when select changes", () => {
    const onChange = vi.fn();
    render(
      <CardDetailPane
        card={makeCard({ column_id: "col1" })}
        columns={columns}
        onChange={onChange}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Column" }), {
      target: { value: "col2" },
    });
    expect(onChange).toHaveBeenCalledWith({ column_id: "col2" });
  });
});

// ─── priority ────────────────────────────────────────────────────────────────

describe("CardDetailPane priority", () => {
  it("calls onChange with priority string when set", () => {
    const onChange = vi.fn();
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={onChange}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Priority" }), {
      target: { value: "p0" },
    });
    expect(onChange).toHaveBeenCalledWith({ priority: "p0" });
  });

  it("calls onChange with null when priority is cleared", () => {
    const onChange = vi.fn();
    render(
      <CardDetailPane
        card={makeCard({ priority: "p2" })}
        columns={columns}
        onChange={onChange}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Priority" }), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenCalledWith({ priority: null });
  });
});

// ─── due date ────────────────────────────────────────────────────────────────

describe("CardDetailPane due date", () => {
  it("calls onChange with ISO string when date is set", () => {
    const onChange = vi.fn();
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={onChange}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-07-04" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ due_at: expect.stringContaining("2026-07-04") }),
    );
  });

  it("calls onChange with null when date is cleared", () => {
    const onChange = vi.fn();
    render(
      <CardDetailPane
        card={makeCard({ due_at: "2026-07-04T00:00:00.000Z" })}
        columns={columns}
        onChange={onChange}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ due_at: null });
  });
});

// ─── tags ─────────────────────────────────────────────────────────────────────

describe("CardDetailPane tags", () => {
  it("adds a tag on Enter", () => {
    const onChange = vi.fn();
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={onChange}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Add tag" });
    fireEvent.change(input, { target: { value: "bug" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ tags: ["bug"] });
  });

  it("adds a tag on comma", () => {
    const onChange = vi.fn();
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={onChange}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Add tag" });
    fireEvent.change(input, { target: { value: "feature" } });
    fireEvent.keyDown(input, { key: "," });
    expect(onChange).toHaveBeenCalledWith({ tags: ["feature"] });
  });

  it("removes a tag when X is clicked", () => {
    const onChange = vi.fn();
    render(
      <CardDetailPane
        card={makeCard({ tags: ["alpha", "beta"] })}
        columns={columns}
        onChange={onChange}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove tag alpha" }));
    expect(onChange).toHaveBeenCalledWith({ tags: ["beta"] });
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe("CardDetailPane delete", () => {
  it("shows confirm step when Delete card is clicked", () => {
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /delete card/i }));
    expect(screen.getByText(/delete this card/i)).toBeTruthy();
  });

  it("calls onDelete after confirming", async () => {
    const onDelete = vi.fn();
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /delete card/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it("cancels delete when Cancel is clicked", () => {
    const onDelete = vi.fn();
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /delete card/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText(/delete this card/i)).toBeNull();
  });
});

// ─── close ───────────────────────────────────────────────────────────────────

describe("CardDetailPane close", () => {
  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close card details" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the × button is clicked", () => {
    const onClose = vi.fn();
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

import type { StoredCardTicket } from "#/features/projects/store";

function makeTicket(overrides: Partial<StoredCardTicket> = {}): StoredCardTicket {
  return {
    id: "tk1",
    card_id: "card1",
    source: "github",
    ext_id: "octo/repo#1",
    url: "https://github.com/octo/repo/issues/1",
    status: "open",
    assignee: null,
    last_seen_at: "2026-05-01T00:00:00Z",
    created_at: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

describe("CardDetailPane linked tickets", () => {
  it("renders the Link GitHub input only when onLinkGithub is provided", () => {
    const { rerender } = render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("textbox", { name: "Link GitHub" })).toBeNull();
    rerender(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onLinkGithub={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Link GitHub" })).toBeTruthy();
  });

  it("calls onLinkGithub when Link button is clicked with a value", async () => {
    const onLinkGithub = vi.fn(async () => undefined);
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onLinkGithub={onLinkGithub}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Link GitHub" });
    fireEvent.change(input, {
      target: { value: "https://github.com/o/r/pull/3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    await waitFor(() =>
      expect(onLinkGithub).toHaveBeenCalledWith("https://github.com/o/r/pull/3"),
    );
  });

  it("surfaces the resolver error message", async () => {
    const onLinkGithub = vi.fn(async () => ({ error: "not a GitHub URL" }));
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onLinkGithub={onLinkGithub}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Link GitHub" }), {
      target: { value: "garbage" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("not a GitHub URL"),
    );
  });

  it("renders existing tickets with status and assignee", () => {
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        tickets={[makeTicket({ status: "merged", assignee: "alice" })]}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onLinkGithub={vi.fn()}
      />,
    );
    const chip = screen.getByTestId("ticket-chip-tk1");
    expect(chip.textContent).toContain("octo/repo#1");
    expect(chip.textContent).toContain("merged");
    expect(chip.textContent).toContain("alice");
  });

  it("renders the degraded chip when last_seen_at is null", () => {
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        tickets={[
          makeTicket({ status: null, last_seen_at: null }),
        ]}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onLinkGithub={vi.fn()}
      />,
    );
    const chip = screen.getByTestId("ticket-chip-tk1");
    expect(chip.textContent).toContain("reconnect to refresh");
    const link = chip.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/settings/integrations");
  });

  it("calls onRefreshTicket when the refresh button is clicked", () => {
    const onRefreshTicket = vi.fn();
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        tickets={[makeTicket()]}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onLinkGithub={vi.fn()}
        onRefreshTicket={onRefreshTicket}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh octo/repo#1" }));
    expect(onRefreshTicket).toHaveBeenCalledWith("tk1");
  });

  it("calls onUnlinkTicket when the unlink button is clicked", () => {
    const onUnlinkTicket = vi.fn();
    render(
      <CardDetailPane
        card={makeCard()}
        columns={columns}
        tickets={[makeTicket()]}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onLinkGithub={vi.fn()}
        onUnlinkTicket={onUnlinkTicket}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Unlink octo/repo#1" }));
    expect(onUnlinkTicket).toHaveBeenCalledWith("tk1");
  });
});

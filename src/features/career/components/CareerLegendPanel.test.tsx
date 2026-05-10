import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CareerLegendPanel } from "#/features/career/components/CareerLegendPanel";
import type { ScaleLegend } from "#/features/career/store";
import type { SupabaseLike } from "#/shared/db";

function makeClient(initial: ScaleLegend) {
  const updateEq = vi.fn(async () => ({ error: null as null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const limit = vi.fn(async () => ({
    data: [initial as unknown as Record<string, unknown>],
    error: null as null,
  }));
  const chain = {
    is: vi.fn(() => chain),
    in: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    or: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit,
  };
  const select = vi.fn(() => chain);
  const client: SupabaseLike = {
    from: () => ({
      upsert: vi.fn(async () => ({ error: null })),
      select,
      update,
      delete: vi.fn(() => ({ eq: vi.fn() })),
    }),
  };
  return { client, update, updateEq };
}

describe("CareerLegendPanel", () => {
  it("loads and renders the four 1–4 labels", async () => {
    const { client } = makeClient({
      label_1: "Beginner",
      label_2: "Working",
      label_3: "Advanced",
      label_4: "Expert",
    });
    render(<CareerLegendPanel client={client} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Beginner")).toBeTruthy();
      expect(screen.getByDisplayValue("Working")).toBeTruthy();
      expect(screen.getByDisplayValue("Advanced")).toBeTruthy();
      expect(screen.getByDisplayValue("Expert")).toBeTruthy();
    });
    // No label_0 row.
    expect(screen.queryByText("0")).toBeNull();
  });

  it("persists a label edit on blur", async () => {
    const { client, update } = makeClient({
      label_1: "Beginner",
      label_2: "",
      label_3: "",
      label_4: "",
    });
    render(<CareerLegendPanel client={client} />);
    const input = (await screen.findByDisplayValue(
      "Beginner",
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Novice" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ label_1: "Novice" });
    });
  });

  it("does not write when blur leaves the value unchanged", async () => {
    const { client, update } = makeClient({
      label_1: "Beginner",
      label_2: "",
      label_3: "",
      label_4: "",
    });
    render(<CareerLegendPanel client={client} />);
    const input = (await screen.findByDisplayValue(
      "Beginner",
    )) as HTMLInputElement;
    fireEvent.blur(input);
    expect(update).not.toHaveBeenCalled();
  });
});

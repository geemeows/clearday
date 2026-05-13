import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionsMenu } from "./ActionsMenu";

describe("ActionsMenu", () => {
  it("opens a popover with the Generate share link entry and fires onShare", async () => {
    const onShare = vi.fn();
    render(<ActionsMenu onShare={onShare} />);

    fireEvent.click(screen.getByRole("button", { name: /level actions/i }));

    const share = await screen.findByRole("button", {
      name: /generate share link/i,
    });
    fireEvent.click(share);

    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it("renders Clone and Archive placeholder items disabled when no handler is wired", async () => {
    render(<ActionsMenu onShare={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /level actions/i }));

    const clone = await screen.findByRole("button", {
      name: /clone as starting template/i,
    });
    const archive = await screen.findByRole("button", {
      name: /archive this level/i,
    });

    expect((clone as HTMLButtonElement).disabled).toBe(true);
    expect((archive as HTMLButtonElement).disabled).toBe(true);
  });

  it("fires onClone when wired", async () => {
    const onClone = vi.fn();
    render(<ActionsMenu onShare={() => {}} onClone={onClone} />);
    fireEvent.click(screen.getByRole("button", { name: /level actions/i }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /clone as starting template/i,
      }),
    );
    await waitFor(() => expect(onClone).toHaveBeenCalledTimes(1));
  });

  it("fires onArchive when wired", async () => {
    const onArchive = vi.fn();
    render(<ActionsMenu onShare={() => {}} onArchive={onArchive} />);
    fireEvent.click(screen.getByRole("button", { name: /level actions/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /archive this level/i }),
    );
    await waitFor(() => expect(onArchive).toHaveBeenCalledTimes(1));
  });
});

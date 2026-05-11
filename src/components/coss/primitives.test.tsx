import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/coss/avatar";
import { Checkbox } from "#/components/coss/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "#/components/coss/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "#/components/coss/dialog";
import { Input } from "#/components/coss/input";
import { Label } from "#/components/coss/label";
import { Progress } from "#/components/coss/progress";
import { Switch } from "#/components/coss/switch";

describe("coss Avatar", () => {
  it("renders fallback content with the avatar data-slot contract", () => {
    render(
      <Avatar>
        <AvatarImage src="data:image/png;base64,bad" alt="user" />
        <AvatarFallback>EM</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText("EM").closest("[data-slot='avatar']")).toBeTruthy();
  });
});

describe("coss Checkbox", () => {
  it("toggles aria-checked on click", () => {
    render(<Checkbox aria-label="agree" />);
    const cb = screen.getByRole("checkbox", { name: /agree/i });
    expect(cb.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(cb);
    expect(cb.getAttribute("aria-checked")).toBe("true");
  });

  it("renders a spinner in place of the indicator when loading", () => {
    render(<Checkbox aria-label="agree" loading defaultChecked />);
    const cb = screen.getByRole("checkbox", { name: /agree/i });
    expect(cb.querySelector("[data-slot='checkbox-spinner']")).toBeTruthy();
    expect(cb.querySelector("[data-slot='checkbox-indicator']")).toBeNull();
  });

  it("rejects interaction while loading and preserves the checked value", () => {
    const onCheckedChange = vi.fn();
    render(
      <Checkbox
        aria-label="agree"
        loading
        defaultChecked={true}
        onCheckedChange={onCheckedChange}
      />,
    );
    const cb = screen.getByRole("checkbox", { name: /agree/i });
    expect(cb.getAttribute("aria-busy")).toBe("true");
    expect(cb.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(cb);
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(cb.getAttribute("aria-checked")).toBe("true");
  });

  it("re-enables interaction when loading is removed", () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Checkbox
        aria-label="agree"
        loading
        defaultChecked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    const cb = screen.getByRole("checkbox", { name: /agree/i });
    fireEvent.click(cb);
    expect(onCheckedChange).not.toHaveBeenCalled();

    rerender(
      <Checkbox
        aria-label="agree"
        loading={false}
        defaultChecked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    fireEvent.click(cb);
    expect(onCheckedChange).toHaveBeenCalled();
    expect(cb.getAttribute("aria-busy")).toBeNull();
  });
});

describe("coss Input", () => {
  it("forwards onChange and applies the input data-slot", () => {
    const onChange = vi.fn();
    render(<Input aria-label="name" onChange={onChange} />);
    const input = screen.getByLabelText("name") as HTMLInputElement;
    expect(input.getAttribute("data-slot")).toBe("input");
    fireEvent.change(input, { target: { value: "ada" } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe("coss Label", () => {
  it("renders an htmlFor-bound label", () => {
    render(
      <>
        <Label htmlFor="x">Name</Label>
        <input id="x" />
      </>,
    );
    expect(screen.getByText("Name").getAttribute("for")).toBe("x");
  });
});

describe("coss Switch", () => {
  it("flips checked when clicked", () => {
    render(<Switch aria-label="notify" />);
    const sw = screen.getByRole("switch", { name: /notify/i });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("renders a spinner inside the thumb when loading", () => {
    render(<Switch aria-label="notify" loading />);
    const thumb = document.querySelector("[data-slot='switch-thumb']");
    expect(
      thumb?.querySelector("[data-slot='switch-thumb-spinner']"),
    ).toBeTruthy();
  });

  it("rejects interaction while loading and preserves the checked value", () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch
        aria-label="notify"
        loading
        defaultChecked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    const sw = screen.getByRole("switch", { name: /notify/i });
    expect(sw.getAttribute("aria-busy")).toBe("true");
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });

  it("re-enables interaction when loading is removed", () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Switch
        aria-label="notify"
        loading
        defaultChecked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    const sw = screen.getByRole("switch", { name: /notify/i });
    fireEvent.click(sw);
    expect(onCheckedChange).not.toHaveBeenCalled();

    rerender(
      <Switch
        aria-label="notify"
        loading={false}
        defaultChecked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    fireEvent.click(sw);
    expect(onCheckedChange).toHaveBeenCalled();
    expect(sw.getAttribute("aria-busy")).toBeNull();
  });
});

describe("coss Progress", () => {
  it("renders with the supplied value as aria-valuenow", () => {
    render(<Progress value={42} />);
    const root = document.querySelector("[data-slot='progress']");
    expect(root).toBeTruthy();
    expect(root?.getAttribute("aria-valuenow")).toBe("42");
  });
});

describe("coss Dialog", () => {
  it("renders content when open and unmounts when closed", () => {
    const { rerender } = render(
      <Dialog open={true}>
        <DialogContent aria-label="settings">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure preferences</DialogDescription>
          <p>Body</p>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: /settings/i })).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();

    rerender(
      <Dialog open={false}>
        <DialogContent aria-label="settings">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure preferences</DialogDescription>
          <p>Body</p>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByRole("dialog", { name: /settings/i })).toBeNull();
  });

  it("forwards onOpenChange when the close button is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent aria-label="dlg">
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("coss Command", () => {
  it("filters items by typed query and forwards onSelect", () => {
    const onSelect = vi.fn();
    render(
      <Command>
        <CommandInput aria-label="search" placeholder="Search" />
        <CommandList>
          <CommandEmpty>None</CommandEmpty>
          <CommandGroup heading="Items">
            <CommandItem value="alpha" onSelect={() => onSelect("alpha")}>
              Alpha
            </CommandItem>
            <CommandItem value="beta" onSelect={() => onSelect("beta")}>
              Beta
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    );
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/search/i), {
      target: { value: "alp" },
    });
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.queryByText("Beta")).toBeNull();
    fireEvent.keyDown(screen.getByLabelText(/search/i), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("alpha");
  });
});

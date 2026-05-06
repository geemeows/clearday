import { describe, expect, it, vi } from "vitest";
import {
  getProfile,
  type ProfileStore,
  type ProfileView,
  putProfile,
} from "#/features/settings/profile/api";

function makeStore(initial: ProfileView): ProfileStore {
  let row: ProfileView = { ...initial };
  return {
    load: vi.fn(async () => ({ ...row })),
    save: vi.fn(async (patch) => {
      row = { ...row, ...patch };
      return { ...row };
    }),
  };
}

const EMPTY: ProfileView = {
  display_name: null,
  timezone: null,
  locale: null,
  avatar_url: null,
};

describe("getProfile", () => {
  it("returns whatever the store reads", async () => {
    const store = makeStore({
      display_name: "Devy",
      timezone: "Europe/Paris",
      locale: "en-US",
      avatar_url: null,
    });
    const view = await getProfile(store);
    expect(view).toEqual({
      display_name: "Devy",
      timezone: "Europe/Paris",
      locale: "en-US",
      avatar_url: null,
    });
  });
});

describe("putProfile", () => {
  it("trims and persists supplied fields, leaves omitted fields untouched", async () => {
    const store = makeStore({
      display_name: "Old",
      timezone: "UTC",
      locale: null,
      avatar_url: null,
    });
    const out = await putProfile(
      { display_name: "  Devy  ", locale: "en-US" },
      store,
    );
    expect(out).toEqual({
      ok: true,
      profile: {
        display_name: "Devy",
        timezone: "UTC",
        locale: "en-US",
        avatar_url: null,
      },
    });
    expect(store.save).toHaveBeenCalledWith({
      display_name: "Devy",
      locale: "en-US",
    });
  });

  it("clears a field when null or empty string is supplied", async () => {
    const store = makeStore({
      display_name: "Old",
      timezone: "UTC",
      locale: "en-US",
      avatar_url: "https://example.com/a.png",
    });
    const out = await putProfile({ display_name: null, avatar_url: "" }, store);
    expect(out).toEqual({
      ok: true,
      profile: {
        display_name: null,
        timezone: "UTC",
        locale: "en-US",
        avatar_url: null,
      },
    });
  });

  it("treats whitespace-only strings as a clear", async () => {
    const store = makeStore({ ...EMPTY, display_name: "Old" });
    const out = await putProfile({ display_name: "   " }, store);
    expect(out).toEqual({
      ok: true,
      profile: { ...EMPTY, display_name: null },
    });
  });

  it("rejects non-string field values", async () => {
    const store = makeStore(EMPTY);
    const out = await putProfile(
      { display_name: 42 as unknown as string },
      store,
    );
    expect(out).toEqual({
      ok: false,
      error: "display_name must be a string",
    });
    expect(store.save).not.toHaveBeenCalled();
  });

  it("rejects values over the 200-character limit", async () => {
    const store = makeStore(EMPTY);
    const out = await putProfile({ display_name: "x".repeat(201) }, store);
    expect(out).toEqual({
      ok: false,
      error: "display_name must be at most 200 characters",
    });
    expect(store.save).not.toHaveBeenCalled();
  });

  it("is a no-op when no recognized fields are supplied", async () => {
    const store = makeStore(EMPTY);
    const out = await putProfile({} as Parameters<typeof putProfile>[0], store);
    expect(out).toEqual({ ok: true, profile: EMPTY });
    expect(store.save).toHaveBeenCalledWith({});
  });
});

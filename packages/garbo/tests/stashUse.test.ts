import { beforeEach, expect, test, vi } from "vitest";
import type { Item } from "kolmafia";

const state = vi.hoisted(() => ({
  prefs: { stashClan: "none" },
  available: false,
  use: vi.fn(),
}));
vi.mock("kolmafia", () => ({ use: state.use }));
vi.mock("libram", () => ({
  get: (_: string, fallback: string) => fallback,
  have: () => state.available,
  withProperty: (name: string, value: boolean, action: () => void) => {
    expect([name, value]).toEqual(["autoSatisfyWithMall", false]);
    action();
  },
}));
vi.mock("../src/clan", () => ({}));
vi.mock("../src/cleanup", () => ({}));
vi.mock("../src/config", () => ({ globalOptions: { prefs: state.prefs } }));
vi.mock("../src/lib", () => ({}));
import { stash } from "../src/stash";

const car = { name: "BittyCar MeatCar" } as Item;
beforeEach(() => {
  state.available = false;
  state.prefs.stashClan = "none";
  state.use.mockClear();
  vi.restoreAllMocks();
});
test.each(["", "0", "none"])(
  "missing item with stash %j is skipped",
  (clan) => {
    state.prefs.stashClan = clan;
    expect(stash.canBorrowOrHave(car)).toBe(false);
  },
);
test.each([false, true])(
  "check the borrow outcome before use (%s)",
  (borrowed) => {
    state.prefs.stashClan = "123";
    expect(stash.canBorrowOrHave(car)).toBe(true);
    vi.spyOn(stash, "with").mockImplementation((_items, action) => {
      state.available = borrowed;
      return action();
    });
    stash.useIfAvailable(car);
    expect(state.use).toHaveBeenCalledTimes(borrowed ? 1 : 0);
  },
);
test("owned copies remain eligible with borrowing disabled", () => {
  state.available = true;
  expect(stash.canBorrowOrHave(car)).toBe(true);
});

import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  clan: 123,
  failCleanup: false,
  failEntry: false,
  output: [] as string[],
}));
vi.mock("kolmafia", () => ({
  getClanId: () => state.clan,
  print: (text: string) => state.output.push(text),
}));
vi.mock("libram", () => ({
  get: () => "",
  Clan: {
    join: (id: number) => {
      if (
        (id === 123 && state.failCleanup) ||
        (id === 456 && state.failEntry)
      ) {
        throw new Error("Could not join clan");
      }
      state.clan = id;
    },
  },
}));
vi.mock("../src/config", () => ({
  globalOptions: { prefs: { vipClan: "456" } },
}));
vi.mock("../src/lib", () => ({}));
vi.mock("../src/combat", () => ({}));

import { withVIPClan } from "../src/clan";

beforeEach(() => {
  Object.assign(state, {
    clan: 123,
    failCleanup: false,
    failEntry: false,
    output: [],
  });
});

test("successful action restores the original clan", () => {
  expect(withVIPClan(() => state.clan)).toBe(456);
  expect(state.clan).toBe(123);
});

test("cleanup cannot replace the actionable Rufus failure", () => {
  state.failCleanup = true;
  const original = new Error("Rufus left choice 1497 open");
  expect(() =>
    withVIPClan(() => {
      throw original;
    }),
  ).toThrow(original);
  expect(state.output.join("\n")).toMatch(/restore.*123.*Could not join clan/);
});

test("cleanup failure still fails an otherwise successful action", () => {
  state.failCleanup = true;
  expect(() => withVIPClan(() => "done")).toThrow(/Could not join clan/);
});

test("failed clan entry never runs the action", () => {
  state.failEntry = true;
  let ran = false;
  expect(() =>
    withVIPClan(() => {
      ran = true;
    }),
  ).toThrow(/Could not join clan/);
  expect(ran).toBe(false);
});

import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  quest: "unstarted",
  type: "",
  handlingChoice: false,
  choice: 1497,
  result: true,
  leaveOpen: false,
  wrongType: false,
  phoneCalls: 0,
}));
vi.mock("kolmafia", () => ({
  handlingChoice: () => state.handlingChoice,
  lastChoice: () => state.choice,
}));
vi.mock("libram", () => ({
  get: (key: string) => (key === "questRufus" ? state.quest : state.type),
  ClosedCircuitPayphone: {
    chooseQuest: (choose: () => number) => {
      // Model libram's early return for an existing quest.
      if (state.quest !== "unstarted") return false;
      state.phoneCalls++;
      state.handlingChoice = state.leaveOpen;
      if (state.result) {
        state.quest = "started";
        state.type = state.wrongType
          ? "entity"
          : choose() === 2
            ? "artifact"
            : "items";
      }
      return state.result;
    },
  },
}));

import { chooseRufusQuest } from "../src/rufus";

beforeEach(() => {
  Object.assign(state, {
    quest: "unstarted",
    type: "",
    handlingChoice: false,
    choice: 1497,
    result: true,
    leaveOpen: false,
    wrongType: false,
    phoneCalls: 0,
  });
});

test.each([2, 3] as const)("accept quest option %i", (choice) => {
  expect(chooseRufusQuest(choice)).toBe(true);
  expect(state.type).toBe(choice === 2 ? "artifact" : "items");
});

test("an existing quest is left alone", () => {
  state.quest = "started";
  state.type = "artifact";
  expect(chooseRufusQuest(3)).toBe(false);
  expect(state.phoneCalls).toBe(0);
  expect(state.type).toBe("artifact");
});

test("failed selection stops instead of continuing potion setup", () => {
  state.result = false;
  expect(() => chooseRufusQuest(3)).toThrow(/Rufus.*failed/i);
});

test.each([false, true])(
  "unresolved menu stops even with result %s",
  (result) => {
    state.result = result;
    state.leaveOpen = true;
    expect(() => chooseRufusQuest(3)).toThrow(/choice 1497/);
    expect(state.phoneCalls).toBe(1);
  },
);

test("an already open choice is never submitted as a Rufus option", () => {
  state.handlingChoice = true;
  state.choice = 1501;
  expect(() => chooseRufusQuest(3)).toThrow(/choice 1501/);
  expect(state.phoneCalls).toBe(0);
});

test("a mismatched quest type cannot masquerade as success", () => {
  state.wrongType = true;
  expect(() => chooseRufusQuest(3)).toThrow(/Rufus.*failed/i);
});

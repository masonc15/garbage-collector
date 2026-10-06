import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  lost: false,
  beaten: false,
  monster: "BRICKO airship",
  setupStarted: false,
  options: {
    version: false,
    help: false,
    simdiet: false,
    returnstash: false,
    prefs: { farmingMethod: "barf" },
  },
}));

// Stop at the first setup command: nothing past this boundary is needed to
// reproduce a prior loss reaching purchasing/setup instead of the safety check.
vi.mock("kolmafia", () => ({
  currentRound: () => 0,
  handlingChoice: () => false,
  visitUrl: () => "",
  lastMonster: () => state.monster,
  cliExecute: () => {
    state.setupStarted = true;
    throw new Error("setup reached");
  },
}));
vi.mock("libram", () => ({
  sinceKolmafiaRevision: () => {},
  $effect: (s: TemplateStringsArray) => s[0],
  $monster: (s: TemplateStringsArray) => s[0],
  have: () => state.beaten,
  get: () => state.lost,
  set: (_key: string, value: string) => {
    state.lost = value === "true";
  },
}));
vi.mock("grimoire-kolmafia", () => ({
  Args: { fill: () => {}, showHelp: () => {} },
}));
vi.mock("../src/config", () => ({
  globalOptions: state.options,
  FarmingMethod: { BARF_MOUNTAIN: "barf", THE_CORAL_CORRAL: "coral" },
}));
vi.mock("../src/lib", () => ({ checkGithubVersion: () => {} }));
vi.mock("../src/familiar/preflight", () => ({
  checkFamiliarAbilities: () => {},
}));
vi.mock("../src/clan", () => ({}));
vi.mock("../src/dailies", () => ({}));
vi.mock("../src/diet", () => ({}));
vi.mock("../src/fights", () => ({}));
vi.mock("../src/mood", () => ({}));
vi.mock("../src/potions", () => ({}));
vi.mock("../src/session", () => ({}));
vi.mock("../src/turns", () => ({}));
vi.mock("../src/garboValue", () => ({}));
vi.mock("../src/farmingStrategy", () => ({}));
vi.mock("../src/log", () => ({}));
vi.mock("../src/tasks/cockroach/prep", () => ({}));
vi.mock("../src/tasks/embezzler", () => ({}));
vi.mock("../src/tasks/engine", () => ({}));
vi.mock("../src/tasks/farm", () => ({}));
vi.mock("../src/tasks/finishUp", () => ({}));
vi.mock("../src/tasks/post", () => ({}));
vi.mock("../src/tasks/target", () => ({}));
vi.mock("../src/tasks/buffExtension", () => ({}));
vi.mock("../src/combat", () => ({}));
vi.mock("../src/acquire", () => ({}));

import { main } from "../src/index";
import { checkCombatSafety } from "../src/combatSafety";

beforeEach(() => {
  Object.assign(state, {
    lost: false,
    beaten: false,
    monster: "BRICKO airship",
    setupStarted: false,
  });
  Object.assign(state.options, {
    version: false,
    help: false,
    simdiet: false,
    returnstash: false,
  });
});

test("a previous loss stops before setup even without Beaten Up", () => {
  state.lost = true;
  expect(() => main()).toThrow(/lost your most recent combat/);
  expect(state.setupStarted).toBe(false);
  expect(state.lost).toBe(false);
  // Preserve the existing acknowledgement behavior for a subsequent rerun.
  expect(() => main()).toThrow("setup reached");
});

test("Beaten Up blocks startup even when the loss was acknowledged", () => {
  state.beaten = true;
  expect(() => main()).toThrow(/beaten up/);
  expect(state.setupStarted).toBe(false);
});

test("a healthy character can reach setup", () => {
  expect(() => main()).toThrow("setup reached");
});

test("the intentional sea loss keeps its existing exception", () => {
  state.monster = "Sssshhsssblllrrggghsssssggggrrgglsssshhssslblgl";
  state.lost = true;
  state.beaten = true;
  expect(() => main()).toThrow("setup reached");
  expect(state.lost).toBe(true);
});

test.each(["help", "version"] as const)(
  "%s remains available after a loss",
  (option) => {
    state.options[option] = true;
    state.lost = true;
    expect(() => main()).not.toThrow();
    expect(state.lost).toBe(true);
    expect(state.setupStarted).toBe(false);
  },
);

test.each(["simdiet", "returnstash"] as const)(
  "%s does not acknowledge a loss or block on Beaten Up",
  (option) => {
    state.options[option] = true;
    state.lost = true;
    state.beaten = true;
    expect(() => main()).toThrow("setup reached");
    expect(state.lost).toBe(true);
  },
);

test("the recovery override permits Beaten Up but never a combat loss", () => {
  state.beaten = true;
  expect(() => checkCombatSafety(true)).not.toThrow();
  state.lost = true;
  expect(() => checkCombatSafety(true)).toThrow(/lost your most recent combat/);
});

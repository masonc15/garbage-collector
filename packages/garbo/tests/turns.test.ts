import { beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({ adventures: 10, owned: new Set<string>() }));
vi.mock("kolmafia", () => ({
  fullnessLimit: () => 15,
  inebrietyLimit: () => 14,
  myFullness: () => 0,
  myInebriety: () => 0,
  myAdventures: () => state.adventures,
  myTurncount: () => 100,
}));
vi.mock("libram", () => ({
  $familiar: (s: TemplateStringsArray) => s[0],
  $item: (s: TemplateStringsArray) => s[0],
  have: (s: string) => state.owned.has(s),
  get: (s: string) => (s === "_chocolatesUsed" ? 3 : 0),
  clamp: (n: number, low: number, high: number) =>
    Math.min(high, Math.max(low, n)),
}));
vi.mock("../src/config", () => ({
  globalOptions: {
    nodiet: true,
    ascend: false,
    saveTurns: 0,
    stopTurncount: 0,
    nobarf: false,
  },
}));
vi.mock("../src/outfit/dropsgearAccessories", () => ({
  usingThumbRing: () => false,
}));
vi.mock("../src/target/fights", () => ({ copyTargetCount: () => 0 }));
vi.mock("../src/lib", () => ({
  howManySausagesCouldIEat: () => 0,
  targetingMeat: () => false,
}));
vi.mock("../src/tasks/embezzler", () => ({ embezzlerFights: () => 0 }));
vi.mock("../src/resources/sealclub", () => ({ nextWeekFights: () => 0 }));
vi.mock("../src/resources/lucky", () => ({}));
import { estimatedGarboTurns } from "../src/turns";
import { globalOptions } from "../src/config";
beforeEach(() => {
  state.adventures = 10;
  state.owned.clear();
  Object.assign(globalOptions, {
    nodiet: true,
    stopTurncount: 0,
    saveTurns: 0,
  });
});
test("nodiet does not keep 218 imaginary organ adventures alive", () => {
  expect(estimatedGarboTurns()).toBe(10);
  state.adventures = 0;
  expect(estimatedGarboTurns()).toBe(0);
});
test("nodiet excludes Pantsgiving snacks too", () => {
  state.owned.add("Pantsgiving");
  expect(estimatedGarboTurns()).toBe(10);
});
test("normal dieting retains organ estimates", () => {
  globalOptions.nodiet = false;
  expect(estimatedGarboTurns()).toBe(228);
  expect(estimatedGarboTurns(false)).toBe(10);
});
test("explicit turn limits and saved turns remain respected", () => {
  globalOptions.saveTurns = 3;
  expect(estimatedGarboTurns()).toBe(7);
  globalOptions.stopTurncount = 105;
  expect(estimatedGarboTurns()).toBe(5);
});

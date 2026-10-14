import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  lost: false,
  beaten: false,
  monster: "garbage tourist",
}));

vi.mock("kolmafia", () => ({
  eat: vi.fn(),
  inebrietyLimit: () => 15,
  lastMonster: () => state.monster,
  myHp: () => 1,
  myInebriety: () => 0,
  myMaxhp: () => 1000,
  myMaxmp: () => 500,
  myMp: () => 0,
  mySoulsauce: () => 0,
  restoreHp: vi.fn(),
  restoreMp: vi.fn(),
  soulsauceCost: () => 5,
  useSkill: vi.fn(),
}));
vi.mock("libram", () => ({
  $effect: (s: TemplateStringsArray) => s[0],
  $item: (s: TemplateStringsArray) => s[0],
  $monster: (s: TemplateStringsArray) => s[0],
  $skill: (s: TemplateStringsArray) => s[0],
  get: (key: string, fallback?: unknown) =>
    key === "_lastCombatLost" ? state.lost : fallback,
  have: () => state.beaten,
  set: (_key: string, value: string) => {
    state.lost = value === "true";
  },
  uneffect: vi.fn(() => {
    state.beaten = false;
  }),
}));
vi.mock("../src/farmingStrategy", () => ({
  FarmingStrategy: { isUnderwater: () => false },
}));
vi.mock("../src/lib", () => ({
  burnLibrams: vi.fn(),
  howManySausagesCouldIEat: () => 1,
}));

import { eat, restoreHp, restoreMp, useSkill } from "kolmafia";
import { uneffect } from "libram";
import { burnLibrams } from "../src/lib";
import { safeRestore } from "../src/restore";

beforeEach(() => {
  Object.assign(state, {
    lost: false,
    beaten: false,
    monster: "garbage tourist",
  });
  vi.clearAllMocks();
});

test.each(["lost", "beaten"] as const)(
  "%s blocks all recovery spending in the relocated module",
  (condition) => {
    state[condition] = true;
    expect(() => safeRestore()).toThrow(
      condition === "lost" ? /lost your most recent combat/ : /beaten up/,
    );
    for (const action of [
      eat,
      restoreHp,
      restoreMp,
      useSkill,
      uneffect,
      burnLibrams,
    ]) {
      expect(action).not.toHaveBeenCalled();
    }
    if (condition === "lost") expect(state.lost).toBe(false);
  },
);

test("a healthy character still restores HP and MP", () => {
  safeRestore();
  expect(restoreHp).toHaveBeenCalledWith(900);
  expect(restoreMp).toHaveBeenCalledWith(200);
  expect(uneffect).not.toHaveBeenCalled();
});

test("the intentional sea loss is cured before recovery", () => {
  state.monster = "Sssshhsssblllrrggghsssssggggrrgglsssshhssslblgl";
  state.lost = true;
  state.beaten = true;
  safeRestore();
  expect(uneffect).toHaveBeenCalledWith("Beaten Up");
  expect(state.lost).toBe(true);
  expect(state.beaten).toBe(false);
  expect(restoreHp).toHaveBeenCalledWith(900);
  expect(vi.mocked(uneffect).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(restoreHp).mock.invocationCallOrder[0],
  );
});

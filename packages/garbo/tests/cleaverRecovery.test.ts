import { beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  beaten: true,
  lost: false,
  encounter: "Poetic Justice",
  cures: true,
}));
vi.mock("libram", () => ({
  $effect: (s: TemplateStringsArray) => s[0],
  have: () => state.beaten,
  get: (key: string) =>
    key === "_lastCombatLost" ? state.lost : state.encounter,
  uneffect: vi.fn(() => {
    if (state.cures) state.beaten = false;
  }),
}));
import { uneffect } from "libram";
import { recoverCleaverReward } from "../src/cleaverRecovery";
beforeEach(() => {
  Object.assign(state, {
    beaten: true,
    lost: false,
    encounter: "Poetic Justice",
    cures: true,
  });
  vi.clearAllMocks();
});
test.each(["Poetic Justice", "Lost and Found"])(
  "clear a new reward effect from %s",
  (encounter) => {
    state.encounter = encounter;
    recoverCleaverReward(false);
    expect(state.beaten).toBe(false);
    expect(uneffect).toHaveBeenCalledTimes(1);
  },
);
test("never conceal a real combat loss", () => {
  state.lost = true;
  recoverCleaverReward(false);
  expect(uneffect).not.toHaveBeenCalled();
});
test("never clear an effect that was already present", () => {
  recoverCleaverReward(true);
  expect(uneffect).not.toHaveBeenCalled();
});
test("leave unknown causes for the normal safety check", () => {
  state.encounter = "garbage tourist";
  recoverCleaverReward(false);
  expect(uneffect).not.toHaveBeenCalled();
});
test("failed recovery stops before another fight with no retry", () => {
  state.cures = false;
  expect(() => recoverCleaverReward(false)).toThrow(/could not clear/);
  expect(uneffect).toHaveBeenCalledTimes(1);
});
test("do not spend recovery when no effect was gained", () => {
  state.beaten = false;
  recoverCleaverReward(false);
  expect(uneffect).not.toHaveBeenCalled();
});

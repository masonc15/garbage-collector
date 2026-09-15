import { beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({ cursed: false }));
vi.mock("libram", () => ({
  $effect: (s: TemplateStringsArray) => s[0],
  have: (effect: string) => effect === "SOME PIGS" && state.cursed,
}));
import { checkFamiliarAbilities } from "../src/familiar/preflight";
beforeEach(() => {
  state.cursed = false;
});
test("normal familiars pass the farming preflight", () => {
  expect(checkFamiliarAbilities).not.toThrow();
});
test("pig curse stops farming with the required cure", () => {
  state.cursed = true;
  expect(checkFamiliarAbilities).toThrow(/SOME PIGS.*White Citadel.*witch/);
});
test("clearing the curse permits the next run", () => {
  state.cursed = true;
  expect(checkFamiliarAbilities).toThrow();
  state.cursed = false;
  expect(checkFamiliarAbilities).not.toThrow();
});

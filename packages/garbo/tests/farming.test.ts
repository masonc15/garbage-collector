import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  owned: new Set<string>(),
  entities: new Map<string, any>(),
  prefs: new Map<string, any>(),
  turns: 74,
  accessible: true,
}));
vi.mock("kolmafia", () => ({
  Familiar: {
    all: () => [...state.entities.values()],
    get none() {
      return entity("none");
    },
  },
  canAdventure: () => state.accessible,
  totalTurnsPlayed: () => state.turns,
  myFamiliar: vi.fn(),
  runChoice: vi.fn(),
  useFamiliar: vi.fn(),
  visitUrl: vi.fn(),
}));
function entity(name: string) {
  if (!state.entities.has(name))
    state.entities.set(name, {
      name,
      fairy: 0,
      physicalDamage: false,
      elementalDamage: false,
    });
  return state.entities.get(name);
}
vi.mock("libram", () => ({
  $familiar: (s: TemplateStringsArray) => entity(s[0]),
  $item: (s: TemplateStringsArray) => entity(s[0]),
  $monster: (s: TemplateStringsArray) => entity(s[0]),
  $location: (s: TemplateStringsArray) => entity(s[0]),
  have: (e: any) => state.owned.has(e.name),
  findFairyMultiplier: (e: any) => e.fairy,
  get: (name: string, fallback?: any) => state.prefs.get(name) ?? fallback,
  set: vi.fn(),
  maxBy: (items: any[], value: (x: any) => number) => {
    if (!items.length) throw new Error("empty maxBy");
    return items.reduce((best, x) => (value(x) > value(best) ? x : best));
  },
}));
vi.mock("../src/familiar/freeFightFamiliar", () => ({ menu: () => [] }));
vi.mock("../src/familiar/lib", () => ({
  getUsedTcbFamiliars: () => [],
  tcbValue: () => 0,
}));
vi.mock("../src/combat", () => ({ Macro: {} }));
vi.mock("../src/combatStrategy", () => ({ GarboStrategy: class {} }));
vi.mock("../src/lib", () => ({ sober: () => true }));
vi.mock("../src/outfit", () => ({ meatTargetOutfit: vi.fn() }));
import { sandwormFamiliar } from "../src/familiar/sandwormFamiliar";
import { lightsOutTask } from "../src/tasks/farm/lightsOut";

beforeEach(() => {
  state.owned.clear();
  state.entities.clear();
  state.prefs.clear();
  state.turns = 74;
  state.accessible = true;
});
test("no familiars does not fail while evaluating sandworms", () => {
  expect(sandwormFamiliar().name).toBe("none");
});
test("no fairy uses an owned non-attacking familiar", () => {
  entity("Leprechaun");
  state.owned.add("Leprechaun");
  expect(sandwormFamiliar().name).toBe("Leprechaun");
});
test("fallback does not select a damaging familiar", () => {
  entity("Mosquito").physicalDamage = true;
  state.owned.add("Mosquito");
  expect(sandwormFamiliar().name).toBe("none");
});
test("cheerleader alone does not reach empty maxBy", () => {
  state.owned.add("Steam-Powered Cheerleader");
  expect(sandwormFamiliar().name).toBe("Steam-Powered Cheerleader");
});
test("normal fairy selection still works", () => {
  entity("Baby Gravy Fairy").fairy = 1;
  state.owned.add("Baby Gravy Fairy");
  expect(sandwormFamiliar().name).toBe("Baby Gravy Fairy");
});
const ready = () => (lightsOutTask.ready as () => boolean)();
test("optional boss is skipped by default at its encounter turn", () => {
  state.prefs.set(
    "nextSpookyravenStephenRoom",
    entity("The Haunted Laboratory"),
  );
  expect(ready()).toBe(false);
});
test("explicit boss opt-in still permits the fight", () => {
  state.prefs.set(
    "nextSpookyravenStephenRoom",
    entity("The Haunted Laboratory"),
  );
  state.prefs.set("garbo_fightStephen", true);
  expect(ready()).toBe(true);
});
test("earlier noncombat rooms remain available", () => {
  state.prefs.set("nextSpookyravenStephenRoom", entity("The Haunted Kitchen"));
  expect(ready()).toBe(true);
  state.turns = 75;
  expect(ready()).toBe(false);
  state.turns = 74;
  state.accessible = false;
  expect(ready()).toBe(false);
});

import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  canFight: false,
  copies: false,
  ownsHat: true,
  hatPrice: 4000,
  outfitCandy: 9000,
  block: "",
  usedMap: false,
  use: vi.fn(),
  acquire: vi.fn(),
}));
vi.mock("grimoire-kolmafia", () => ({}));
vi.mock("kolmafia", () => ({
  canEquip: () => true,
  holiday: () => "",
  getOutfits: () => ["eldritch"],
  outfitPieces: () => [],
  outfitTreats: () => ({ essence: 1 }),
  toItem: (s: string) => s,
  mallPrice: (item: string) =>
    item.startsWith("map") ? 33750 : state.hatPrice,
  use: state.use,
}));
vi.mock("libram", () => ({
  $items: ([s]: string[]) => s.split(", "),
  $item: ([s]: string[]) => s,
  $familiar: ([s]: string[]) => s,
  getSaleValue: () => 0,
  get: (key: string) =>
    key === "_trickOrTreatBlock" ? state.block : state.usedMap,
  have: (item: string) => item === "mummy costume" && state.ownsHat,
  maxBy: (values: unknown[]) => values[0],
  sum: (values: unknown[], mapper: (x: unknown) => number) =>
    values.reduce<number>((a, v) => a + mapper(v), 0),
  withChoice: (_id: number, _choice: number, cb: () => unknown) => cb(),
}));
vi.mock("../src/garboValue", () => ({ garboValue: () => state.outfitCandy }));
vi.mock("../src/acquire", () => ({ acquire: state.acquire }));
vi.mock("../src/lib", () => ({
  freeFightQuestReady: () => state.canFight,
  targetCopiesInProgress: () => state.copies,
}));
vi.mock("../src/combat", () => ({}));
vi.mock("../src/outfit/free", () => ({}));
vi.mock("../src/config", () => ({
  globalOptions: { prefs: { valueOfFreeFight: 2000 } },
}));
vi.mock("../src/combatStrategy", () => ({ GarboStrategy: class {} }));

import { candyMapDailyTasks } from "../src/resources/candyMap";
const [map, , hat] = candyMapDailyTasks();
const ready = (task: typeof map) => (task.ready as () => boolean)();
beforeEach(() => {
  Object.assign(state, {
    canFight: false,
    copies: false,
    ownsHat: true,
    hatPrice: 4000,
    outfitCandy: 9000,
    block: "",
    usedMap: false,
  });
  vi.clearAllMocks();
  state.acquire.mockReturnValue(1);
});

test("preserve the map when its value depends on unreachable tricks", () => {
  expect(ready(map)).toBe(false);
  state.canFight = true;
  expect(ready(map)).toBe(true);
  state.copies = true;
  expect(ready(map)).toBe(false);
});
test("treats alone can justify opening a map at zero adventures", () => {
  state.outfitCandy = 12000;
  expect(ready(map)).toBe(true);
  (map.do as () => void)();
  expect(state.acquire).toHaveBeenCalledWith(
    1,
    "map to a candy-rich block",
    35999,
    false,
  );
  expect(state.use).toHaveBeenCalledOnce();
});
test("charge the cost of a missing hat against attainable tricks", () => {
  state.ownsHat = false;
  state.canFight = true;
  expect(ready(map)).toBe(false);
  state.hatPrice = 1000;
  expect(ready(map)).toBe(true);
  expect(ready(hat)).toBe(false);
  state.usedMap = true;
  state.block = "DDllDDllDlll";
  expect(ready(hat)).toBe(true);
  state.canFight = false;
  expect(ready(hat)).toBe(false);
});

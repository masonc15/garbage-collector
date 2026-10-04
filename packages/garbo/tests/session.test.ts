import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  turns: 0,
  meat: 0,
  items: {} as Record<string, number>,
  remaining: 300,
  output: [] as string[],
  prefs: new Map<string, unknown>(),
}));
vi.mock("kolmafia", () => ({
  print: (s: string) => state.output.push(s),
  myName: () => "noctys",
  todayToString: () => "20261004",
  totalTurnsPlayed: () => state.turns,
  mySessionMeat: () => state.meat,
  mySessionItems: () => state.items,
  myClosetMeat: () => 0,
  myStorageMeat: () => 0,
  getCloset: () => ({}),
  getDisplay: () => ({}),
  getStorage: () => ({}),
  getCampground: () => ({}),
  toItem: (name: string) => name,
}));
// Exercise libram's real inventory union, diff, value and MPA arithmetic.
vi.mock("libram/dist/lib.js", () => ({ getFoldGroup: () => [] }));
vi.mock("libram/dist/template-string.js", () => ({
  $item: (s: TemplateStringsArray) => s[0],
  $items: (s: TemplateStringsArray) => s[0].split(", "),
}));
vi.mock("libram/dist/utils.js", () => ({
  sum: (xs: any[], f: any) =>
    xs.reduce((n, x) => n + (typeof f === "function" ? f(x) : x[f]), 0),
}));
vi.mock("libram", async () => ({
  Session: (await import("libram/dist/session.js")).Session,
  $items: (s: TemplateStringsArray) => s[0].split(", "),
  get: (s: string, fallback = 0) => state.prefs.get(s) ?? fallback,
  set: (s: string, v: unknown) => state.prefs.set(s, v),
}));
vi.mock("../src/config", () => ({ globalOptions: { nodiet: true } }));
vi.mock("../src/lib", () => ({
  formatNumber: (n: number) => String(n),
  HIGHLIGHT: "blue",
  resetDailyPreference: () => false,
}));
vi.mock("../src/potions", () => ({ failedWishes: [] }));
vi.mock("../src/garboValue", () => ({
  garboValue: (item: string) =>
    ({ drop: 100, potion: 200, rare: 10000 })[item] ?? 0,
}));
vi.mock("../src/turns", () => ({ estimatedGarboTurns: () => state.remaining }));

let startSession: typeof import("../src/session").startSession;
let trackMarginalMpa: typeof import("../src/session").trackMarginalMpa;
let endSession: typeof import("../src/session").endSession;
let trackMarginalTurnExtraValue: typeof import("../src/session").trackMarginalTurnExtraValue;

beforeEach(async () => {
  vi.resetModules();
  ({ startSession, trackMarginalMpa, endSession, trackMarginalTurnExtraValue } =
    await import("../src/session"));
  Object.assign(state, {
    turns: 0,
    meat: 0,
    items: {},
    remaining: 300,
    output: [],
  });
  state.prefs.clear();
  startSession();
});
function sample(turn: number, remaining: number, meat = turn * 3000) {
  Object.assign(state, { turns: turn, remaining, meat });
  trackMarginalMpa();
}
function report() {
  endSession();
  const line = state.output.find((s) => s.startsWith("GARBO_LATE_RUN "));
  expect(line, "durable structured measurement in session log").toBeDefined();
  return JSON.parse(line!.slice("GARBO_LATE_RUN ".length));
}
test("elapsed-turn fallback opens items even when remaining estimate stays high", () => {
  sample(0, 500);
  sample(101, 500);
  state.items = { drop: 10 };
  sample(120, 75);
  sample(170, 25);
  sample(195, 0);
  state.remaining = 500;
  endSession();
  expect(state.output.join("\n")).toContain("10.64 [items]");
  expect(state.output.join("\n")).not.toMatch(/NaN|Infinity/);
});
test("short run does not divide a zero-width meat sample", () => {
  sample(0, 10);
  sample(1, 0);
  endSession();
  expect(state.output.join("\n")).not.toMatch(/NaN|Infinity/);
});
test("late window nets cash costs and depleted inventory without deleting losses as outliers", () => {
  state.items = { potion: 2, rare: 1 };
  sample(0, 60, 0);
  for (let turn = 1; turn <= 60; turn++) {
    if (turn === 11) state.items = { drop: 10 }; // consumed inventory disappears entirely
    sample(turn, 60 - turn, turn * 3000 - (turn >= 11 ? 1000 : 0));
  }
  const r = report();
  expect(r).toMatchObject({
    account: "noctys",
    turns: 50,
    startTurn: 10,
    endTurn: 60,
    netMeat: 149000,
    itemGains: 1000,
    itemDepletion: 10400,
    netItems: -9400,
    netTotal: 139600,
    netMpa: 2792,
    outlierValue: 0,
    adjustedMpa: 2792,
  });
});
test("positive rare drops are visible separately from adjusted net value", () => {
  sample(0, 15);
  state.items = { rare: 1 };
  sample(15, 0);
  const r = report();
  expect(r).toMatchObject({
    turns: 15,
    netTotal: 55000,
    outlierValue: 10000,
    adjustedMpa: 3000,
  });
});
test("free fights retain their income but do not invent paid turns", () => {
  sample(0, 10, 0);
  sample(0, 10, 1000);
  sample(10, 0, 31000);
  expect(report()).toMatchObject({ turns: 10, netMeat: 31000, netMpa: 3100 });
});
test("new invocation clears old windows", () => {
  sample(0, 100);
  sample(100, 0);
  startSession();
  state.output = [];
  const r = report();
  expect(r).toMatchObject({ status: "insufficient-data", turns: 0 });
  expect(state.output.join("\n")).not.toMatch(/NaN|Infinity/);
});
test("cleanup after the last farming sample cannot inflate late-run income", () => {
  sample(0, 20);
  sample(20, 0);
  state.meat += 500000;
  expect(report()).toMatchObject({ turns: 20, netMeat: 60000, netMpa: 3000 });
});
test("modeled familiar adjustment only applies inside its item window", () => {
  sample(0, 500);
  trackMarginalTurnExtraValue(1000);
  sample(101, 500);
  state.items = { drop: 10 };
  trackMarginalTurnExtraValue(200);
  sample(120, 75);
  sample(170, 25);
  sample(195, 0);
  endSession();
  expect(state.output.join("\n")).toContain("8.51 [items]");
});
test("zero-turn farming reports insufficient data without numeric MPA", () => {
  sample(0, 0);
  expect(report()).toMatchObject({ status: "insufficient-data", turns: 0 });
});

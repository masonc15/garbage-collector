import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  adventures: 0,
  sausages: 0,
  events: [] as string[],
  options: { saveTurns: 0, stopTurncount: null as number | null },
}));
vi.mock("kolmafia", () => ({
  myAdventures: () => state.adventures,
  myTurncount: () => 100,
  maximize: vi.fn(),
  eat: (n: number) => {
    state.events.push("eat");
    state.adventures += n;
    state.sausages -= n;
  },
}));
vi.mock("libram", () => ({
  $item: ([name]: string[]) => ({ name, dailyusesleft: 0 }),
  DesignerSweatpants: { canUseSkill: () => false },
  $skill: () => ({ dailylimit: 0 }),
}));
vi.mock("../src/config", () => ({ globalOptions: state.options }));
vi.mock("../src/diet", () => ({}));
vi.mock("../src/lib", () => ({
  howManySausagesCouldIEat: () => state.sausages,
}));
vi.mock("../src/session", () => ({ trackMarginalMpa: vi.fn() }));
vi.mock("../src/tasks/post", () => ({ PostQuest: () => ({ tasks: [] }) }));
vi.mock("../src/tasks/buffExtension", () => ({
  PostBuffExtensionQuest: { tasks: [] },
}));
vi.mock("../src/tasks/farm/dailyExtras", () => ({
  DailyExtrasQuest: { tasks: [] },
}));
vi.mock("../src/tasks/farm/nonBarfTurn", () => ({
  NonBarfTurnQuest: { tasks: [] },
}));
vi.mock("../src/tasks/farm/wanderer", () => ({ WandererQuest: { tasks: [] } }));
vi.mock("../src/tasks/farm/farmTurn", () => ({
  FarmTurnQuest: () => ({
    tasks: [
      {
        do: () => {
          state.events.push("farm");
          state.adventures--;
        },
      },
    ],
  }),
}));
type TestTask = {
  ready?: () => boolean;
  completed?: () => boolean;
  do: () => void;
};
vi.mock("../src/tasks/engine", () => ({
  runGarboQuests: vi.fn(),
  runGarboFarmQuests: (
    quests: { completed?: () => boolean; tasks: TestTask[] }[],
  ) => {
    for (const quest of quests) {
      for (const task of quest.tasks) {
        if (
          !quest.completed?.() &&
          !task.completed?.() &&
          (task.ready?.() ?? true)
        )
          task.do();
      }
    }
  },
}));
import { runFarm } from "../src/tasks/farm";
beforeEach(() => {
  state.adventures = state.sausages = state.options.saveTurns = 0;
  state.options.stopTurncount = null;
  state.events = [];
});
const run = () => runFarm(() => state.events.push("prepare"));
test("an exhausted account consumes no combat preparation", () => {
  run();
  expect(state.events).toEqual([]);
});
test("a sausage at zero adventures enables preparation and farming in order", () => {
  state.sausages = 1;
  run();
  expect(state.events).toEqual(["eat", "prepare", "farm"]);
  expect(state.adventures).toBe(0);
});
test("a normal farm start prepares once", () => {
  state.adventures = 10;
  run();
  expect(state.events).toEqual(["prepare", "farm"]);
});
test("reserved adventures and the turn limit both suppress preparation", () => {
  state.adventures = state.options.saveTurns = 1;
  run();
  state.options.saveTurns = 0;
  state.options.stopTurncount = 100;
  run();
  expect(state.events).toEqual([]);
});

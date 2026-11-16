import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  mimic: { experience: 550 },
  familiar: "mimic",
}));
vi.mock("kolmafia", async (original) => ({
  ...(await original<typeof import("kolmafia")>()),
  myFamiliar: () => (state.familiar === "mimic" ? state.mimic : null),
}));
vi.mock("libram/dist/lib.js", () => ({ getTodaysHolidayWanderers: () => [] }));
vi.mock("libram/dist/property.js", () => ({ get: () => 0, set: () => {} }));
vi.mock("libram", async () => {
  const { StrictMacro } = await import("libram/dist/combat.js");
  const { Skill } = await import("kolmafia");
  const egg = Object.assign(new Skill(), {
    id: 7494,
    name: "%fn, lay an egg",
    combat: true,
    toString: () => "%fn, lay an egg",
  });
  return { StrictMacro, $familiar: () => state.mimic, $skill: () => egg };
});
vi.mock("../src/config", () => ({
  globalOptions: { target: "monsterid 1942" },
}));
vi.mock("../src/familiar/lib", () => ({}));
vi.mock("../src/familiar/meatFamiliar", () => ({}));
vi.mock("../src/turns", () => ({}));
vi.mock("../src/lib", () => ({}));
vi.mock("../src/target/fights", () => ({}));
vi.mock("../src/garboValue", () => ({}));
vi.mock("../src/resources/bloodCubicZirconia", () => ({}));
vi.mock("../src/resources/yachtzee", () => ({}));
vi.mock("../src/farmingStrategy", () => ({}));
vi.mock("../src/resources/banish", () => ({}));

import { Macro } from "../src/combat";

// Interpret only the BALLS instructions emitted by tryEgg plus a kill sentinel.
// Unknown instructions fail rather than silently making a safety test pass.
function replay(hp = 900, round = 0, monster = 1942, eggsLeft = 11) {
  const lines = Macro.tryEgg().attack().toString().split(";").filter(Boolean);
  let eggs = 0;
  let attacked = false;
  const damage = [103, 99, 105, 103, 99, 102, 105, 98, 95];
  const condition = (text: string): boolean =>
    text.split(" && ").every((part) => {
      if (part.startsWith("!")) return !condition(part.slice(1));
      if (part === "monsterid 1942") return monster === 1942;
      if (part.startsWith("hasskill ")) return eggs < eggsLeft;
      if (part.startsWith("hppercentbelow "))
        return (hp / 900) * 100 < Number(part.split(" ")[1]);
      if (part.startsWith("pastround "))
        return round > Number(part.split(" ")[1]);
      throw new Error(`unsupported predicate ${part}`);
    });
  const blockEnd = (start: number, kind: string) => {
    let depth = 1;
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].startsWith(`${kind} `)) depth++;
      if (lines[i] === `end${kind}` && --depth === 0) return i;
    }
    throw new Error("unclosed block");
  };
  const run = (start: number, end: number) => {
    for (let i = start; i < end && hp > 0; i++) {
      const line = lines[i];
      if (line.startsWith("if ") || line.startsWith("while ")) {
        const kind = line.split(" ")[0];
        const finish = blockEnd(i, kind);
        let iterations = 0;
        while (condition(line.slice(kind.length + 1)) && hp > 0) {
          if (++iterations > 20) throw new Error("unbounded macro");
          run(i + 1, finish);
          if (kind === "if") break;
        }
        i = finish;
      } else if (line.startsWith("skill ")) {
        hp -= damage[eggs] ?? 100;
        eggs++;
        round++;
      } else if (line.startsWith("repeat ")) {
        if (condition(line.slice(7))) i -= 2;
      } else if (line === "attack") attacked = true;
      else throw new Error(`unsupported instruction ${line}`);
    }
  };
  run(0, lines.length);
  return { hp, eggs, attacked };
}

beforeEach(() => {
  state.familiar = "mimic";
  state.mimic.experience = 550;
});

test("Bishop damage cannot trap egg collection until death", () => {
  const result = replay();
  expect(result.attacked).toBe(true);
  expect(result.hp).toBeGreaterThan(500);
  expect(result.eggs).toBeGreaterThan(0);
});
test("low health goes straight to fighting", () => {
  expect(replay(400)).toEqual({ hp: 400, eggs: 0, attacked: true });
});
test("a later macro invocation cannot start egg stasis again", () => {
  expect(replay(900, 8)).toEqual({ hp: 900, eggs: 0, attacked: true });
});
test("an exhausted egg skill falls through", () => {
  expect(replay(900, 0, 1942, 0).eggs).toBe(0);
});
test("other monsters are not copied", () => {
  expect(replay(900, 0, 1).eggs).toBe(0);
});
test("another familiar cannot lay eggs", () => {
  state.familiar = "other";
  expect(replay().eggs).toBe(0);
});
test("a mimic without enough experience cannot lay eggs", () => {
  state.mimic.experience = 49;
  expect(replay().eggs).toBe(0);
});

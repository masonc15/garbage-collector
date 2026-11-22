import { expect, test } from "vitest";
import { DietAvailability, UnavailableDietItemError } from "../src/dietCap";

const base = ["transdermal smoke patch", "prismatic wad", "voodoo snuff"];
const generated = ["handful of Smithereens", "cute mushroom"];
const entries = (names: string[]) => names.map((name) => ({ item: { name } }));

test("finish the funded low-Meat diet after four refusals, including generated potions", () => {
  const availability = new DietAvailability();
  const tried: string[] = [];
  let alreadyEaten = false;
  let helpersUsed = 0;
  const reported: string[] = [];
  availability.consume(
    () => {
      // A retry starts from the current organs. The potion pass adds its own entries.
      if (!alreadyEaten) {
        alreadyEaten = true;
        tried.push("owned food");
      }
      for (const { item } of availability.menu(
        entries([...base, ...generated]),
      )) {
        tried.push(item.name);
        if (item.name !== "cute mushroom")
          throw new UnavailableDietItemError(item.name, 10765);
        helpersUsed++;
      }
    },
    (message) => reported.push(message),
  );
  expect(tried).toEqual(["owned food", ...base, ...generated]);
  expect(helpersUsed).toBe(1);
  expect(reported).toHaveLength(4);
  expect(availability.skippedPurchases).toBe(true);
});

test("finish with unused capacity when every remaining target is unavailable", () => {
  const availability = new DietAvailability();
  const attempts: string[] = [];
  availability.consume(
    () => {
      for (const { item } of availability.menu(entries(generated))) {
        attempts.push(item.name);
        throw new UnavailableDietItemError(item.name, 10765);
      }
    },
    () => {},
  );
  expect(attempts).toEqual(generated);
  expect(availability.skippedPurchases).toBe(true);
});

test("propagate unrelated errors and stop a planner that ignores an exclusion", () => {
  const availability = new DietAvailability();
  const unexpected = new Error("failed to use helper");
  expect(() =>
    availability.consume(
      () => {
        throw unexpected;
      },
      () => {},
    ),
  ).toThrow(unexpected);
  expect(availability.skippedPurchases).toBe(false);
  let attempts = 0;
  expect(() =>
    availability.consume(
      () => {
        if (++attempts > 2) throw new Error("unbounded retries");
        throw new UnavailableDietItemError("cute mushroom", 33633);
      },
      () => {},
    ),
  ).toThrow(/excluded.*cute mushroom/i);
  expect(attempts).toBe(2);
});

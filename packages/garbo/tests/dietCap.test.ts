import { expect, test } from "vitest";
import {
  dietTargetCap,
  isUnavailableDietItem,
  UnavailableDietItemError,
} from "../src/dietCap";

test("toasted brie with aioli can be bought at the price the planner accepted", () => {
  // 2026-11-02 noctys: 4.5 adventures at 4000 MPA, entry valued at 26000
  // with a 7490 aioli, brie listed at 18475
  const cap = dietTargetCap({
    ownValue: 4.5 * 4000,
    entryValuePerUnit: 26000,
    helperPricePerUnit: 7490,
    plannedPrice: 18475,
  });
  expect(cap).toBe(18510);
  expect(cap).toBeGreaterThanOrEqual(18475);
});

test("a target chosen for its effect on other entries keeps its planned price", () => {
  // brie on its own is worth less than it costs; Refined Palate pays for it
  expect(
    dietTargetCap({
      ownValue: 18000,
      entryValuePerUnit: 18000,
      helperPricePerUnit: 0,
      plannedPrice: 18475,
    }),
  ).toBe(18475);
});

test("own value still wins when it is the largest", () => {
  expect(
    dietTargetCap({
      ownValue: 40000,
      entryValuePerUnit: 40000,
      helperPricePerUnit: 0,
      plannedPrice: 1002,
    }),
  ).toBe(40000);
});

test("missing prices never raise the cap", () => {
  expect(
    dietTargetCap({
      ownValue: 0,
      entryValuePerUnit: 5000,
      helperPricePerUnit: Infinity,
      plannedPrice: Infinity,
    }),
  ).toBe(0);
  expect(
    dietTargetCap({
      ownValue: -10,
      entryValuePerUnit: NaN,
      helperPricePerUnit: 0,
      plannedPrice: NaN,
    }),
  ).toBe(0);
});

test("unavailable item errors are recognised without instanceof", () => {
  const error = new UnavailableDietItemError("toasted brie", 18510.4);
  expect(isUnavailableDietItem(error)).toBe(true);
  expect(error.message).toContain("at most 18510 meat");

  const downlevelled = Object.assign(new Error("x"), {
    name: "UnavailableDietItemError",
    itemName: "toasted brie",
  });
  expect(isUnavailableDietItem(downlevelled)).toBe(true);

  expect(isUnavailableDietItem(new Error("Failed to purchase"))).toBe(false);
  expect(isUnavailableDietItem("Unable to find an order")).toBe(false);
});

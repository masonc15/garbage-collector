/**
 * The most garbo should pay for one unit of a diet entry's target item.
 *
 * The planner credits a target with more than its own adventures: helpers
 * such as mini kiwi aioli, Special Seasoning, or a salad fork add adventures
 * to the entry, and toasted brie earns its place through Refined Palate on
 * the wine that follows. Capping the purchase at the target's own adventures
 * can therefore refuse an item the plan was built on. On 2026-11-02 the cap
 * for toasted brie was 18000 (4.5 adventures at 4000 MPA) while the planner
 * had accepted it at 18475, after the aioli had already been used.
 *
 * The cap is the largest of the target's own value, the entry's per-unit
 * value less what its helpers cost, and the price the planner accepted.
 * Non-finite inputs are ignored so a missing price never lifts the cap.
 */
export function dietTargetCap({
  ownValue,
  entryValuePerUnit,
  helperPricePerUnit,
  plannedPrice,
}: {
  ownValue: number;
  entryValuePerUnit: number;
  helperPricePerUnit: number;
  plannedPrice: number;
}): number {
  const candidates = [
    Math.max(0, ownValue),
    entryValuePerUnit - helperPricePerUnit,
    plannedPrice,
  ].filter((value) => Number.isFinite(value));
  return Math.max(0, ...candidates);
}

/**
 * Thrown when a diet entry's target cannot be bought within its cap. It is
 * raised before any of the entry's helpers are used, so the caller can plan
 * again without the item and nothing has been wasted.
 */
export class UnavailableDietItemError extends Error {
  constructor(
    readonly itemName: string,
    readonly cap: number,
  ) {
    super(
      `Could not buy ${itemName} for at most ${Math.floor(cap)} meat; planning the diet again without it.`,
    );
    this.name = "UnavailableDietItemError";
  }
}

/**
 * Checks by name rather than `instanceof`, which a down-levelled `extends Error`
 * does not preserve under KoLmafia's Rhino runtime.
 */
export function isUnavailableDietItem(
  error: unknown,
): error is UnavailableDietItemError {
  return (
    error instanceof Error &&
    error.name === "UnavailableDietItemError" &&
    typeof (error as Partial<UnavailableDietItemError>).itemName === "string"
  );
}

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
 * Raised before spending helpers when acquisition leaves too few copies of
 * the target. Any copies already bought stay in inventory.
 */
export class UnavailableDietItemError extends Error {
  constructor(
    readonly itemName: string,
    readonly cap: number,
  ) {
    super(`Could not buy ${itemName} for at most ${Math.floor(cap)} meat.`);
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

/** Purchase failures apply to every planning pass, including generated potion tiers. */
export class DietAvailability {
  private readonly excluded = new Set<string>();

  get skippedPurchases(): boolean {
    return this.excluded.size > 0;
  }

  menu<T extends { item: { name: string } }>(entries: T[]): T[] {
    return entries.filter(({ item }) => !this.excluded.has(item.name));
  }

  consume(attempt: () => void, report: (message: string) => void): void {
    for (;;) {
      try {
        attempt();
        return;
      } catch (error) {
        if (!isUnavailableDietItem(error)) throw error;
        if (this.excluded.has(error.itemName)) {
          throw new Error(
            `Diet planner retried excluded item: ${error.itemName}`,
          );
        }
        this.excluded.add(error.itemName);
        report(`${error.message} Replanning without it.`);
      }
    }
  }
}

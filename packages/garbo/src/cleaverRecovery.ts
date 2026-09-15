import { $effect, get, have, uneffect } from "libram";

/** Clear only a newly acquired, known noncombat penalty before an adventure retry. */
export function recoverCleaverReward(wasBeatenUp: boolean): void {
  if (
    wasBeatenUp ||
    get("_lastCombatLost") ||
    !["Poetic Justice", "Lost and Found"].includes(get("lastEncounter")) ||
    !have($effect`Beaten Up`)
  )
    return;

  uneffect($effect`Beaten Up`);
  if (have($effect`Beaten Up`)) {
    throw new Error(
      "June Cleaver granted Beaten Up, but recovery could not clear it. Stopping before the next fight.",
    );
  }
}

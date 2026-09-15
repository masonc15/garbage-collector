import { $effect, have } from "libram";

/** Check before diet purchases or any familiar-dependent combat. */
export function checkFamiliarAbilities(): void {
  if (have($effect`SOME PIGS`)) {
    throw new Error(
      "SOME PIGS disables all familiar abilities. Finish the White Citadel witch encounter to clear the curse, then run garbo again. Ordinary effect removal cannot clear this curse.",
    );
  }
}

import { lastMonster } from "kolmafia";
import { $effect, $monster, get, have, set } from "libram";

/** Check for unsafe combat state without spending recovery resources. */
export function checkCombatSafety(ignoreBeatenUp = false): void {
  // This sea encounter deliberately ends in a loss; safeRestore handles its cure.
  if (
    lastMonster() === $monster`Sssshhsssblllrrggghsssssggggrrgglsssshhssslblgl`
  ) {
    return;
  }
  if (get("_lastCombatLost")) {
    set("_lastCombatLost", "false");
    throw new Error(
      "You lost your most recent combat! Check to make sure everything is alright before rerunning.",
    );
  }
  if (have($effect`Beaten Up`) && !ignoreBeatenUp) {
    throw new Error(
      "Hey, you're beaten up, and that's a bad thing. Lick your wounds, handle your problems, and run me again when you feel ready.",
    );
  }
}

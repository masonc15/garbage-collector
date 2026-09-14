import { canAdventure, Location, totalTurnsPlayed } from "kolmafia";
import { $item, $location, $monster, get } from "libram";
import { Macro } from "../../combat";
import { GarboStrategy } from "../../combatStrategy";
import { sober } from "../../lib";
import { meatTargetOutfit } from "../../outfit";
import type { GarboTask } from "../engine";

const isSteve = () =>
  get("nextSpookyravenStephenRoom") === $location`The Haunted Laboratory`;

// The final encounter is an optional boss, not an ordinary farming fight.
// Keep it opt-in: a meat outfit and basic combat are not safe for every account.
export const lightsOutTask: GarboTask = {
  name: "Lights Out",
  ready: () =>
    (!isSteve() || get("garbo_fightStephen", false)) &&
    canAdventure(get("nextSpookyravenStephenRoom") ?? $location`none`) &&
    get("nextSpookyravenStephenRoom") !== get("ghostLocation") &&
    totalTurnsPlayed() % 37 === 0,
  completed: () => totalTurnsPlayed() === get("lastLightsOutTurn"),
  do: () => get("nextSpookyravenStephenRoom") as Location,
  outfit: () =>
    meatTargetOutfit(sober() ? {} : { offhand: $item`Drunkula's wineglass` }),
  spendsTurn: isSteve,
  combat: new GarboStrategy(() =>
    Macro.if_($monster`Stephen Spookyraven`, Macro.basicCombat()).abortWithMsg(
      "Expected to fight Stephen Spookyraven, but didn't!",
    ),
  ),
};

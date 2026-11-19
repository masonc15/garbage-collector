import { FarmTurnQuest } from "./farmTurn";
import { DailyExtrasQuest } from "./dailyExtras";
import { NonBarfTurnQuest } from "./nonBarfTurn";
import { TurnGenQuest } from "./turnGen";
import { WandererQuest } from "./wanderer";
import { runGarboFarmQuests, runGarboQuests } from "../engine";
import { PostQuest } from "../post";
import { PostBuffExtensionQuest } from "../buffExtension";
import { canContinue } from "./lib";
import { trackMarginalMpa } from "../../session";

export function runFarm(prepare: () => void): void {
  if (!canContinue()) {
    // Mining, postcombat actions and turn generators can still pay out here.
    runGarboQuests([PostBuffExtensionQuest]);
    runGarboFarmQuests([
      PostQuest(canContinue),
      { ...TurnGenQuest, completed: canContinue },
      { ...DailyExtrasQuest, completed: canContinue },
    ]);
    if (!canContinue()) return;
  }

  prepare();
  trackMarginalMpa();
  runGarboFarmQuests([
    PostQuest(),
    TurnGenQuest,
    DailyExtrasQuest,
    WandererQuest,
    NonBarfTurnQuest,
    FarmTurnQuest(),
  ]);
  trackMarginalMpa();
}

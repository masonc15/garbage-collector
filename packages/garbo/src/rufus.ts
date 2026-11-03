import { handlingChoice, lastChoice, visitUrl } from "kolmafia";
import { ClosedCircuitPayphone, get } from "libram";

// The Burning Leaves pile. KoLmafia's `leaves` command burns from it, and the
// result page offers the pile again, so mafia reports the choice as open after
// every burn. Walking away is safe.
const BURNING_LEAVES_CHOICE = 1510;

function checkRufusChoice(): void {
  if (handlingChoice() && lastChoice() === BURNING_LEAVES_CHOICE) {
    visitUrl("main.php");
  }
  if (handlingChoice()) {
    throw new Error(
      `Rufus quest selection is blocked by choice ${lastChoice()}. Finish that choice (or hang up Rufus's phone) before rerunning. Stopping before further setup.`,
    );
  }
}

type QuestSelector = Parameters<typeof ClosedCircuitPayphone.chooseQuest>[0];
export function chooseRufusQuest(choice: 2 | 3 | QuestSelector): boolean {
  checkRufusChoice();
  // The potion loop may already have a quest to complete.
  if (get("questRufus") !== "unstarted") return false;
  let selected: number | undefined;
  const accepted = ClosedCircuitPayphone.chooseQuest((options) => {
    selected = typeof choice === "function" ? choice(options) : choice;
    if (selected !== 2 && selected !== 3)
      throw new Error("Unsupported Rufus quest option");
    return selected;
  });
  // Concurrent requests can interrupt the phone call or leave misleading quest
  // preferences. Never issue subsequent setup requests while a choice is open.
  checkRufusChoice();
  if (
    !accepted ||
    selected === undefined ||
    get("questRufus") === "unstarted" ||
    get("rufusQuestType") !== (selected === 2 ? "artifact" : "items")
  ) {
    throw new Error(
      "Rufus quest selection failed. Stopping before further setup.",
    );
  }
  return true;
}

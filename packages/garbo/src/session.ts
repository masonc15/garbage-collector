import { Item, myName, print, todayToString } from "kolmafia";
import { $items, get, Session, set } from "libram";
import { globalOptions } from "./config";
import { formatNumber, HIGHLIGHT, resetDailyPreference } from "./lib";
import { failedWishes } from "./potions";
import { garboValue } from "./garboValue";
import { estimatedGarboTurns } from "./turns";

type SessionKey =
  | "full"
  | "barf"
  | "meat-start"
  | "meat-end"
  | "item-start"
  | "item-end";
const sessions: Map<SessionKey, Session> = new Map();
const lateSnapshots: Session[] = [];
let lateEnd: Session | undefined;
let itemExtraStart = 0;
let itemExtraEnd = 0;
/**
 * Start a new session, deleting any old session
 */
export function startSession(): void {
  sessions.clear();
  lateSnapshots.length = 0;
  lateEnd = undefined;
  extraValue = itemExtraStart = itemExtraEnd = 0;
  sessions.set("full", Session.current());
}

/**
 * Compute the difference between the current drops and starting session (if any)
 * @returns The difference
 */
export function sessionSinceStart(): Session {
  const session = sessions.get("full");
  if (session) {
    return Session.current().diff(session);
  }
  return Session.current();
}

let extraValue = 0;
export function trackMarginalTurnExtraValue(additionalValue: number) {
  extraValue += additionalValue;
}

export function trackMarginalMpa(remainingTurns?: number) {
  recordMarginalSnapshot(remainingTurns, false);
}

function recordMarginalSnapshot(
  remainingTurns: number | undefined,
  finalizing: boolean,
) {
  const barf = sessions.get("barf");
  if (finalizing && !barf) return;
  const current = finalizing && lateEnd ? lateEnd : Session.current();
  if (!finalizing) {
    lateEnd = current;
    // Preserve the first snapshot at a turn count so free income is not lost.
    if (
      lateSnapshots[lateSnapshots.length - 1]?.totalTurns !== current.totalTurns
    ) {
      lateSnapshots.push(current);
    }
    while (
      lateSnapshots.length > 1 &&
      lateSnapshots[1].totalTurns <= current.totalTurns - 50
    ) {
      lateSnapshots.shift();
    }
  }
  if (!barf) {
    sessions.set("barf", current);
  }
  const turns = barf ? current.diff(barf).totalTurns : 0;
  remainingTurns ??= estimatedGarboTurns();
  // track items if we have run at least 100 turns in barf mountain or we have less than 200 turns left in barf mountain
  const item = sessions.get("item-start");
  if (!item && !finalizing && (turns >= 100 || remainingTurns <= 200)) {
    sessions.set("item-start", current);
    itemExtraStart = extraValue;
  }
  // start tracking meat if there are less than 75 turns left in barf mountain
  const meatStart = sessions.get("meat-start");
  if (!meatStart && !finalizing && remainingTurns <= 75) {
    sessions.set("meat-start", current);
  }

  // Stop tracking meat once fewer than 25 estimated turns remain.
  const meatEnd = sessions.get("meat-end");
  if (
    !meatEnd &&
    meatStart &&
    current.totalTurns > meatStart.totalTurns &&
    remainingTurns <= 25
  ) {
    sessions.set("meat-end", current);
  }

  const itemEnd = sessions.get("item-end");
  if ((!itemEnd || finalizing) && remainingTurns <= 0) {
    sessions.set("item-end", current);
    itemExtraEnd = extraValue;
  }
}

const outlierItemList = $items`Extrovermectin™, Volcoino, Poké-Gro fertilizer`;

function printLateRunSession() {
  const start = lateSnapshots[0];
  const end = lateEnd;
  const turns = start && end ? end.totalTurns - start.totalTurns : 0;
  const identity = {
    schemaVersion: 1,
    account: myName(),
    date: todayToString(),
    build: process.env.GITHUB_REF_NAME ?? "CustomBuild",
    recordedAt: new Date().toISOString(),
    nodiet: globalOptions.nodiet,
    valueOfAdventure: get("valueOfAdventure"),
    scope:
      "late farming interval; includes intervening side trips and free fights; excludes subsequent cleanup",
  };
  if (!start || !end || turns <= 0) {
    print(
      `GARBO_LATE_RUN ${JSON.stringify({ ...identity, status: "insufficient-data", turns: 0 })}`,
    );
    return;
  }
  const { meat, items, itemDetails } = end.diff(start).value(garboValue);
  const details = itemDetails.map((d) => ({
    item: String(d.item),
    quantity: d.quantity,
    value: d.value,
    unitValue: d.value / d.quantity,
    outlier:
      d.quantity > 0 &&
      (outlierItemList.includes(d.item) ||
        (d.quantity === 1 && d.value >= 5000)),
  }));
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const outlierValue = sum(
    details.filter((d) => d.outlier).map((d) => d.value),
  );
  const netTotal = meat + items;
  const report = {
    ...identity,
    status: turns < 15 ? "short-sample" : "measured",
    startTurn: start.totalTurns,
    endTurn: end.totalTurns,
    turns,
    targetTurns: 50,
    netMeat: meat,
    itemGains: sum(details.filter((d) => d.value > 0).map((d) => d.value)),
    itemDepletion: -sum(details.filter((d) => d.value < 0).map((d) => d.value)),
    netItems: items,
    netTotal,
    netMpa: netTotal / turns,
    outlierValue,
    adjustedMpa: (netTotal - outlierValue) / turns,
    valuation:
      "garboValue at report time, not realized sales; net Meat includes observed spending; inventory depletion valued, not charged twice; excludes pre-window setup and unobserved costs; no modeled familiar or outfit bonuses added",
    items: details,
  };
  print(`GARBO_LATE_RUN ${JSON.stringify(report)}`);
  print(
    `Late-run net MPA (${turns} paid turns): ${report.netMpa.toFixed(2)}; excluding positive outliers: ${report.adjustedMpa.toFixed(2)}. Item values are estimates; inspect GARBO_LATE_RUN before changing valueOfAdventure.`,
    HIGHLIGHT,
  );
}

function printMarginalSession() {
  const barf = sessions.get("barf");
  const meatStart = sessions.get("meat-start");
  const meatEnd = sessions.get("meat-end");
  const itemStart = sessions.get("item-start");
  const itemEnd = sessions.get("item-end");

  // we can only print out marginal items if we've started tracking for marginal value
  if (
    barf &&
    meatStart &&
    meatEnd &&
    meatEnd.totalTurns > meatStart.totalTurns
  ) {
    const { itemDetails: barfItemDetails } = barf.value(garboValue);

    const isOutlier = (detail: {
      item: Item;
      value: number;
      quantity: number;
    }) =>
      detail.quantity > 0 &&
      (outlierItemList.includes(detail.item) ||
        (detail.quantity === 1 &&
          detail.value >= 5000 &&
          barfItemDetails.some(
            (d) => d.item === detail.item && d.quantity <= 2,
          )));

    const meatMpa = Session.computeMPA(meatStart, meatEnd, {
      value: garboValue,
      isOutlier,
    });

    if (itemStart && itemEnd && itemEnd.totalTurns > itemStart.totalTurns) {
      // MPA printout including maringal items
      const itemMpa = Session.computeMPA(itemStart, itemEnd, {
        value: garboValue,
        isOutlier,
        excludeValue: { item: itemExtraEnd - itemExtraStart },
      });

      print(`Outliers:`, HIGHLIGHT);
      for (const detail of itemMpa.outlierItems) {
        print(
          `${detail.quantity} ${detail.item} worth ${detail.value.toFixed(
            0,
          )} total`,
          HIGHLIGHT,
        );
      }

      const effectiveMpa =
        itemMpa.mpa.effective - itemMpa.mpa.meat + meatMpa.mpa.meat;
      const totalMpa = itemMpa.mpa.total - itemMpa.mpa.meat + meatMpa.mpa.meat;

      print(
        `Marginal MPA: ${formatNumber(
          Math.round(meatMpa.mpa.meat * 100) / 100,
        )} [raw] + ${formatNumber(
          Math.round(itemMpa.mpa.items * 100) / 100,
        )} [items] (${formatNumber(
          Math.round((itemMpa.mpa.total - itemMpa.mpa.effective) * 100) / 100,
        )} [outliers]) = ${formatNumber(
          Math.round(effectiveMpa * 100) / 100,
        )} [total] (${formatNumber(
          Math.round(totalMpa * 100) / 100,
        )} [w/ outliers])`,
        HIGHLIGHT,
      );
    } else {
      // MPA printout excluding marginal items
      print(
        "Warning: Insufficient turns were run, so this estimate is subject to large variance. Be careful when using these values as is.",
        "red",
      );
      print(
        `Marginal MPA: ${formatNumber(
          Math.round(meatMpa.mpa.meat * 100) / 100,
        )} [raw] + ${formatNumber(
          Math.round(meatMpa.mpa.items * 100) / 100,
        )} [items] = ${formatNumber(
          Math.round(meatMpa.mpa.total * 100) / 100,
        )} [total]`,
        HIGHLIGHT,
      );
    }
  } else {
    print(
      "Marginal MPA unavailable: no positive-width meat sampling window. See late-run measurement.",
      "red",
    );
  }
}

const garboResultsProperties = [
  "garboResultsMeat",
  "garboResultsItems",
  "garboResultsTurns",
] as const;
type GarboResultsProperty = (typeof garboResultsProperties)[number];

function getGarboDaily(property: GarboResultsProperty): number {
  return get(property, 0);
}
function setGarboDaily(property: GarboResultsProperty, value: number) {
  set(property, value);
}
function resetGarboDaily() {
  if (resetDailyPreference("garboResultsDate")) {
    for (const prop of garboResultsProperties) {
      setGarboDaily(prop, 0);
    }
  }
}

export function endSession(printLog = true): void {
  // force marginal mpa to always have a 0 turns remaining calculation
  recordMarginalSnapshot(0, true);
  resetGarboDaily();
  const message = (head: string, turns: number, meat: number, items: number) =>
    print(
      `${head}, across ${formatNumber(
        turns,
      )} turns you generated ${formatNumber(
        meat + items,
      )} meat, with ${formatNumber(meat)} raw meat and ${formatNumber(
        items,
      )} from items`,
      HIGHLIGHT,
    );

  const { meat, items, itemDetails, turns } =
    sessionSinceStart().value(garboValue);
  const totalMeat = meat + getGarboDaily("garboResultsMeat");
  const totalItems = items + getGarboDaily("garboResultsItems");
  const totalTurns = turns + getGarboDaily("garboResultsTurns");

  if (printLog) {
    // list the top 3 gaining and top 3 losing items
    const losers = itemDetails.sort((a, b) => a.value - b.value).slice(0, 3);
    const winners = itemDetails.reverse().slice(0, 3);
    print(`Extreme Items:`, HIGHLIGHT);
    for (const detail of [...winners, ...losers]) {
      print(
        `${detail.quantity} ${detail.item} worth ${detail.value.toFixed(
          0,
        )} total`,
        HIGHLIGHT,
      );
    }
  }

  setGarboDaily("garboResultsMeat", totalMeat);
  setGarboDaily("garboResultsItems", totalItems);
  setGarboDaily("garboResultsTurns", totalTurns);

  if (printLog) {
    message("This run of garbo", turns, meat, items);
    message("So far today", totalTurns, totalMeat, totalItems);

    printMarginalSession();
    printLateRunSession();
  }
  if (globalOptions.loginvalidwishes) {
    if (failedWishes.length === 0) {
      print("No invalid wishes found.");
    } else {
      print("Found the following unwishable effects:");
      failedWishes.forEach((effect) => print(`${effect}`));
    }
  }
}

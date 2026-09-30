# Changelog

## 1.0.1-nightcap.5 - 2026-09-30

- Install under names upstream never uses, so KoLmafia's `git update` can no
  longer overwrite the fork: `garbo-nightcap.js`, `garbo-nightcap-choice.js`,
  `garbo-nightcap-price.js`, `relay_garbo_nightcap.js`, the
  `relay/garbo-nightcap/` assets, and `garbo_nightcap_*.json` data.
- Retire the old upstream-named paths. Publishing replaces untouched copies
  there with upstream's files, so stock garbo stays installed beside the fork.
- Add a `garbo` gCLI alias for `garbo-nightcap`, so the plain command still
  runs the fork.
- Clear stale build output before each deployment build.

## 1.0.1-nightcap.4 - 2026-09-14

- Clear Beaten Up from known June Cleaver rewards before Grimoire repeats the adventure.
- Keep actual combat losses and existing or unknown Beaten Up effects subject to the normal safety checks.
- Stop after one unsuccessful cure attempt instead of entering another fight.

## 1.0.1-nightcap.3 - 2026-09-14

- Check for the SOME PIGS curse before diet purchases or combat.
- Explain that the White Citadel witch encounter must be completed to restore familiar abilities.
- Prevent repeated Eagle pledge failures caused by this curse.

## 1.0.1-nightcap.2 - 2026-09-14

- Publish the tested build once for all Nuada accounts through shared script releases.
- Include script files, relay assets, static data, and release metadata in the package.
- Add `--build-only` for the runner deployment. Account-specific deployment is removed.

## 1.0.1-nightcap.1 - 2026-09-14

- Require `garbo_fightStephen=true` before the optional Lights Out boss fight.
  Earlier noncombat rooms still run. The default does not risk a farming day
  on a boss fought in a meat outfit.
- Select an owned non-attacking familiar, or none, when sandworm setup has no
  fairy candidates. Support accounts with only a Steam-Powered Cheerleader.
- Add regression tests for both failures.

Based on upstream b4465d97f9acc646f2a8905e1c8a2f0c004bf01d, matching the
previous installed build. Source changes are kept on fix/low-resource-farming.

### Deployment

Run `tools/deploy-nightcap.sh` from this repository after committing.
The command tests, builds, type-checks, saves a versioned release and backup,
and verifies each installed file. It refuses to replace a running session.
The runner does not run `git update` each night, so the fork remains installed.
Use this source branch for upgrades; a manual upstream `git update` can replace
local fixes. Rebase the fixes, bump the version, and rerun the tests before an
upgrade. Do not reuse a deployed version.

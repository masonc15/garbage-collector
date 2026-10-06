#!/usr/bin/env bash
# Keep the Nightcap fork current with upstream garbo.
#
# Runs hourly on nuada (garbo-upstream-sync.timer, installed by kol-cloud-runner's
# bin/deploy.sh) in a clone used only for this. When loathers/main has commits the
# fork lacks, it merges them, releases the result as the next nightcap version
# once tests, the build and the typecheck pass, and pushes it to the fork. Then it
# publishes whatever the fork branch holds if nuada runs anything else.
#
# Nothing that fails is pushed or published. A conflict or failure is emailed
# once per upstream commit and retried every hour; publishing while an account
# session holds a lease is retried quietly. Failures exit from inside functions,
# because `set -e` does not apply to a function called as a condition.
set -euo pipefail

UPSTREAM=${GARBO_UPSTREAM_URL:-https://github.com/loathers/garbage-collector.git}
BRANCH=fix/low-resource-farming
KOL_DIR=${KOL_DIR:-$HOME/docker/kol}
STATE_DIR=${XDG_STATE_HOME:-$HOME/.local/state}/garbo-upstream-sync

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
yarn() { node .yarn/releases/yarn-3.6.4.cjs "$@"; }

notify() { # $1=key sent once, $2=subject, stdin=body
    local sent=$STATE_DIR/notified to from
    if grep -qxF "$1" "$sent" 2>/dev/null; then
        cat >/dev/null
        return 0
    fi
    to=$(sed -n 's/^EMAIL_TO=//p' "$KOL_DIR/.env")
    from=$(sed -n 's/^EMAIL_FROM=//p' "$KOL_DIR/.env")
    { printf 'To: %s\nFrom: %s\nSubject: %s\n\n' "$to" "$from" "$2"; cat; } | msmtp -t \
        && printf '%s\n' "$1" >>"$sent"
}

deployed_version() {
    python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["version"])' \
        "$KOL_DIR/state/managed-scripts/garbo/current/release.json"
}

merge_upstream() {
    local upstream count subject version next conflicts
    upstream=$(git rev-parse --short=8 upstream/main)
    count=$(git rev-list --count HEAD..upstream/main)
    subject=$(git log -1 --format=%s upstream/main)
    log "merging $count upstream commits through $upstream ($subject)"
    if ! git merge -q --no-ff --no-edit -m "merge upstream main" upstream/main; then
        conflicts=$(git diff --name-only --diff-filter=U)
        if [ "$conflicts" != yarn.lock ]; then
            git merge --abort
            log "conflicts: $(echo $conflicts)"
            printf '%s\n' "Merging loathers/main (through $upstream, $count commits) into $BRANCH conflicts in:" \
                "" "$conflicts" "" "The fork stays on its current release; nothing was published." \
                "Resolve the merge by hand on the Mac, push $BRANCH, and the next hourly sync releases it." \
                | notify "conflict-$upstream" "garbo upstream sync: merge conflict"
            exit 1
        fi
        # Two dependency changes: take upstream's lockfile and let yarn re-add ours.
        git checkout -q --theirs yarn.lock
        git add yarn.lock
        git commit -q --no-edit
    fi
    if ! yarn install >"$STATE_DIR/build.log" 2>&1; then
        tail -n 60 "$STATE_DIR/build.log" | notify "install-$upstream" "garbo upstream sync: yarn install failed"
        exit 1
    fi
    version=$(node -p 'require("./packages/garbo/package.json").version')
    next=$(node -p 'const [, a, n] = process.argv[1].match(/^(.*nightcap\.)(\d+)$/); a + (+n + 1)' "$version")
    VERSION=$next UPSTREAM_SHA=$upstream COUNT=$count node <<'NODE'
const fs = require("fs");
const { VERSION, UPSTREAM_SHA, COUNT } = process.env;
const pkg = "packages/garbo/package.json";
fs.writeFileSync(pkg, fs.readFileSync(pkg, "utf8").replace(/"version": "[^"]+"/, `"version": "${VERSION}"`));
const date = new Date().toISOString().slice(0, 10);
const entry = `## ${VERSION} - ${date}\n\n- Bring in ${COUNT} upstream commit${COUNT === "1" ? "" : "s"} through loathers/garbage-collector@${UPSTREAM_SHA}.\n- No Nightcap change.\n\n`;
const log = fs.readFileSync("CHANGELOG.md", "utf8");
fs.writeFileSync("CHANGELOG.md", log.replace(/^# Changelog\n\n/, `# Changelog\n\n${entry}`));
NODE
    git add -A packages/garbo/package.json CHANGELOG.md yarn.lock .yarn/cache
    git commit -q -m "release nightcap.${next##*nightcap.}"
    if ! tools/deploy-nightcap.sh --build-only >"$STATE_DIR/build.log" 2>&1; then
        log "build failed; see $STATE_DIR/build.log"
        tail -n 60 "$STATE_DIR/build.log" | sed 's/\x1b\[[0-9;]*m//g' \
            | notify "build-$upstream" "garbo upstream sync: tests or build failed"
        exit 1
    fi
    git push -q fork "HEAD:refs/heads/$BRANCH"
    log "pushed $next"
}

main() {
    mkdir -p "$STATE_DIR"
    exec 9>"$STATE_DIR/lock"
    flock -n 9 || { log "another sync is running"; return 0; }
    cd "$(dirname "$0")/.."

    git fetch -q fork "$BRANCH"
    git fetch -q "$UPSTREAM" +main:refs/remotes/upstream/main
    git checkout -q "$BRANCH"
    git reset -q --hard "fork/$BRANCH"
    git clean -qfd
    if ! git merge-base --is-ancestor upstream/main HEAD; then
        merge_upstream
    fi
    # Keep the fork's main the same as upstream's (GitHub's "Sync fork").
    git push -q fork upstream/main:refs/heads/main || log "could not update the fork's main"

    local version deployed
    version=$(node -p 'require("./packages/garbo/package.json").version')
    deployed=$(deployed_version)
    if [ "$version" = "$deployed" ]; then
        log "up to date: $version"
        return 0
    fi
    log "publishing $version (nuada runs $deployed)"
    if GARBO_HOST=local tools/deploy-nightcap.sh >"$STATE_DIR/publish.log" 2>&1; then
        log "published $version"
    elif grep -q "account lease is active" "$STATE_DIR/publish.log"; then
        log "an account session is active; publishing next hour"
    else
        log "publish failed; see $STATE_DIR/publish.log"
        tail -n 60 "$STATE_DIR/publish.log" | sed 's/\x1b\[[0-9;]*m//g' \
            | notify "publish-$version" "garbo upstream sync: publishing $version failed"
        return 1
    fi
}

# One line, read whole before it runs: the reset above can rewrite this file.
{ main "$@"; exit $?; }

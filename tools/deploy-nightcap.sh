#!/usr/bin/env bash
# Build, test, and publish the Nightcap fork for every account on nuada.
set -euo pipefail
cd "$(dirname "$0")/.."
mode=${1:-publish}
[[ "$mode" = publish || "$mode" = --build-only ]] || {
    echo 'usage: tools/deploy-nightcap.sh [--build-only] (publishes to every account)' >&2
    exit 2
}
host=${GARBO_HOST:-nuada-ts}
version=$(node -p 'require("./packages/garbo/package.json").version')
[[ "$version" =~ ^[A-Za-z0-9._-]+$ ]] || exit 2
git diff --quiet HEAD -- packages yarn.lock || { echo 'Commit source changes before deployment.' >&2; exit 1; }
export GITHUB_SHA=$(git rev-parse HEAD)
export GITHUB_REF_NAME="nightcap-$version"
node .yarn/releases/yarn-3.6.4.cjs workspace garbo test
node .yarn/releases/yarn-3.6.4.cjs build
node .yarn/releases/yarn-3.6.4.cjs workspace garbo check
python3 - "$version" "$GITHUB_SHA" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path('dist')
files = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
         for p in sorted(root.rglob('*')) if p.is_file() and str(p.relative_to(root)) not in ('nightcap-release.json', 'release.json', 'data/nightcap-garbo-release.json')}
(root / 'nightcap-release.json').write_text(json.dumps(dict(version=sys.argv[1], commit=sys.argv[2], files=files), indent=2) + '\n')
PY
python3 - <<'PACK'
import json, hashlib
from pathlib import Path
root = Path('dist')
meta = json.loads((root / 'nightcap-release.json').read_text())
(root / 'data/nightcap-garbo-release.json').write_text(json.dumps(meta, indent=2) + '\n')
paths = sorted(name for name in meta['files'] if name.startswith(('scripts/', 'relay/', 'data/')))
paths.append('data/nightcap-garbo-release.json')
files = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in paths}
(root / 'release.json').write_text(json.dumps(dict(package='garbo', version=meta['version'], paths=paths, files=files), indent=2) + '\n')
PACK
[ "$mode" != --build-only ] || exit 0
remote=$(ssh "$host" 'mktemp -d /tmp/kol-garbo.XXXXXXXX')
rsync -az dist/ "$host:$remote/"
ssh "$host" "python3 ~/docker/kol/docker/runner/managed_scripts.py publish --state ~/docker/kol/state --source '$remote'"
ssh "$host" "rm -rf '$remote'"

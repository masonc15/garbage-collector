#!/usr/bin/env bash
# Build, test, and install the Nightcap fork for one idle account on nuada.
set -euo pipefail
cd "$(dirname "$0")/.."
account=${1:?usage: tools/deploy-nightcap.sh ACCOUNT}
[[ "$account" =~ ^[A-Za-z0-9_-]+$ ]] || exit 2
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
         for p in sorted(root.rglob('*')) if p.is_file() and p.name != 'nightcap-release.json'}
(root / 'nightcap-release.json').write_text(json.dumps(dict(version=sys.argv[1], commit=sys.argv[2], files=files), indent=2) + '\n')
PY
remote="docker/kol/state/managed-garbo/$version"
ssh "$host" "test ! -e '$remote' && mkdir -p '$remote'"
rsync -az dist/ "$host:$remote/"
ssh "$host" python3 - "$account" "$version" <<'PY'
import hashlib, json, os, pathlib, shutil, sys, tempfile
account, version = sys.argv[1:]
base = pathlib.Path.home() / 'docker/kol/state'
root = base / 'accounts' / account
release = base / 'managed-garbo' / version
if not (root / 'settings').is_dir():
    raise SystemExit('Account root does not exist')
if any((root / 'data' / name).exists() for name in ('kolrunner_relay.pwd', 'kolrunner_relay.json')):
    raise SystemExit('Account has a session. Stop it before deployment.')
manifest = json.loads((release / 'nightcap-release.json').read_text())
for name, digest in manifest['files'].items():
    path = pathlib.Path(name)
    if path.is_absolute() or '..' in path.parts:
        raise SystemExit('Invalid release path')
    if hashlib.sha256((release / path).read_bytes()).hexdigest() != digest:
        raise SystemExit(f'Release hash mismatch: {name}')
backup = base / 'garbo-backups' / account / version
backup.mkdir(parents=True, exist_ok=False)
for name in manifest['files']:
    dest = root / name
    if dest.exists():
        saved = backup / name
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(dest, saved)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=dest.parent, delete=False) as temp:
        temp.write((release / name).read_bytes())
        temporary = temp.name
    os.chmod(temporary, 0o644)
    os.replace(temporary, dest)
    if hashlib.sha256(dest.read_bytes()).hexdigest() != manifest['files'][name]:
        raise SystemExit(f'Installed hash mismatch: {name}')
shutil.copy2(release / 'nightcap-release.json', root / 'data' / 'nightcap-garbo-release.json')
print(f'Installed garbo {version} for {account}; all file hashes match.')
PY

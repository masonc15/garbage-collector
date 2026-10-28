"""Offline integration tests: real Git repositories, stubbed build/mail boundaries."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("sync-upstream.sh")
BRANCH = "fix/low-resource-farming"


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.env = os.environ.copy()
        self.env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL="/dev/null",
                        GIT_AUTHOR_NAME="Test", GIT_AUTHOR_EMAIL="test@example.invalid",
                        GIT_COMMITTER_NAME="Test", GIT_COMMITTER_EMAIL="test@example.invalid")
        self.git("init", "-q", "-b", BRANCH)
        (self.repo / "tools").mkdir()
        shutil.copy(SCRIPT, self.repo / "tools/sync-upstream.sh")
        (self.repo / "packages/garbo").mkdir(parents=True)
        (self.repo / "packages/garbo/package.json").write_text('{"version": "1.0.1-nightcap.1"}')
        (self.repo / "CHANGELOG.md").write_text("# Changelog\n\n")
        (self.repo / "yarn.lock").write_text("fixture lock\n")
        (self.repo / ".yarn/cache").mkdir(parents=True)
        (self.repo / ".yarn/cache/fixture").write_text("fixture cache")
        (self.repo / ".gitignore").write_text(".worktrees/\n")
        deploy = self.repo / "tools/deploy-nightcap.sh"
        deploy.write_text("""#!/bin/sh
if [ \"$1\" = --build-only ]; then
    echo build >> \"$KOL_DIR/builds\"
    [ \"${TEST_BUILD_FAIL:-0}\" != 1 ]
    exit $?
fi
python3 - <<'PYTHON'
import json, os
from pathlib import Path
p = Path(os.environ['KOL_DIR']) / 'state/managed-scripts/garbo/current/release.json'
p.write_text(Path('packages/garbo/package.json').read_text())
(p.parent / 'published').touch()
PYTHON
""")
        deploy.chmod(0o755)
        (self.repo / "conflict.txt").write_text("base\n")
        self.commit("base")
        self.base = self.git("rev-parse", "HEAD").stdout.strip()
        self.fork = self.root / "fork.git"
        self.upstream = self.root / "upstream.git"
        for p in [self.fork, self.upstream]:
            self.git("clone", "-q", "--bare", str(self.repo), str(p))
        self.git("remote", "add", "fork", str(self.fork))
        self.git("push", "-q", str(self.upstream), "HEAD:main")
        (self.repo / "conflict.txt").write_text("fork\n")
        self.commit("fork change")
        self.git("push", "-q", "fork", BRANCH)
        self.env.update(GARBO_UPSTREAM_URL=str(self.upstream), KOL_DIR=str(self.root / "kol"),
                        XDG_STATE_HOME=str(self.root / "state"))
        self.state = self.root / "state/garbo-upstream-sync"
        (self.root / "kol").mkdir()
        (self.root / "kol/.env").write_text("EMAIL_TO=test@example.invalid\nEMAIL_FROM=test@example.invalid\n")
        deployed = self.root / "kol/state/managed-scripts/garbo/current"
        deployed.mkdir(parents=True)
        (deployed / "release.json").write_text('{"version": "1.0.1-nightcap.1"}')
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        node = bin_dir / "node"
        real_node = shutil.which("node")
        node.write_text('#!/bin/sh\nif [ "$1" = .yarn/releases/yarn-3.6.4.cjs ]; then exit 0; fi\nexec ' + str(real_node) + ' "$@"\n')
        node.chmod(0o755)
        mail = bin_dir / "msmtp"
        mail.write_text('#!/bin/sh\ncat >> "$KOL_DIR/mail"\n')
        mail.chmod(0o755)
        self.env["PATH"] = str(bin_dir) + ":" + self.env["PATH"]
        self.up = self.root / "up"
        self.git("clone", "-q", "-b", "main", str(self.upstream), str(self.up))
        self.change_upstream("upstream")

    def git(self, *args, cwd=None, check=True):
        return subprocess.run(["git", *args], cwd=cwd or self.repo, env=self.env,
                              capture_output=True, text=True, check=check)

    def commit(self, message, cwd=None):
        self.git("add", ".", cwd=cwd)
        self.git("commit", "-qm", message, cwd=cwd)

    def change_upstream(self, text):
        (self.up / "conflict.txt").write_text(text + "\n")
        self.commit("upstream change", cwd=self.up)
        self.git("push", "-q", "origin", "main", cwd=self.up)

    def run_sync(self, *args):
        return subprocess.run(["bash", str(self.repo / "tools/sync-upstream.sh"), *args],
                              cwd=self.repo, env=self.env, capture_output=True, text=True, timeout=25)

    def test_conflict_is_held_until_an_input_changes(self):
        first = self.run_sync()
        self.assertNotEqual(first.returncode, 0)
        second = self.run_sync()
        self.assertNotEqual(second.returncode, 0)
        self.assertIn("unchanged blocked merge", second.stdout)
        self.assertNotIn("Auto-merging", second.stdout)
        self.change_upstream("different upstream")
        third = self.run_sync()
        self.assertIn("Auto-merging", third.stdout)
        self.assertNotEqual(third.returncode, 0)

    def test_local_tracked_changes_are_preserved(self):
        p = self.repo / "conflict.txt"
        p.write_text("uncommitted work\n")
        r = self.run_sync()
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(p.read_text(), "uncommitted work\n")
        self.assertIn("local changes", r.stdout)

    def test_untracked_files_are_preserved(self):
        p = self.repo / "precious.txt"
        p.write_text("keep me")
        self.run_sync()
        self.assertTrue(p.exists())
        self.assertEqual(self.git("status", "--porcelain").stdout.strip(), "?? precious.txt")
        self.assertFalse((self.repo / ".git/MERGE_HEAD").exists())

    def test_unpushed_commits_are_preserved(self):
        (self.repo / "local.txt").write_text("local work")
        self.commit("local change")
        before = self.git("rev-parse", "HEAD").stdout
        r = self.run_sync()
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(self.git("rev-parse", "HEAD").stdout, before)
        self.assertIn("unpublished", r.stdout)

    def test_no_notify_never_sends_mail(self):
        r = self.run_sync("--no-notify")
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse((self.root / "kol/mail").exists())

    def prepare_clean_merge(self):
        self.git("reset", "--hard", self.base, cwd=self.up)
        (self.up / "new.txt").write_text("upstream addition")
        self.commit("nonconflicting upstream", cwd=self.up)
        self.git("push", "-q", "--force", "origin", "main", cwd=self.up)

    def test_success_publishes_validated_merge_without_changing_source(self):
        self.prepare_clean_merge()
        before = self.git("rev-parse", "HEAD").stdout
        r = self.run_sync("--no-notify")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.git("rev-parse", "HEAD").stdout, before)
        version = json.loads((self.root / "kol/state/managed-scripts/garbo/current/release.json").read_text())["version"]
        self.assertEqual(version, "1.0.1-nightcap.2")
        self.assertFalse((self.repo / ".worktrees/upstream-sync").exists())
        r = self.run_sync("--no-notify")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("up to date", r.stdout)

    def test_no_push_validates_without_publishing(self):
        self.prepare_clean_merge()
        before = self.git("ls-remote", "fork", "refs/heads/" + BRANCH).stdout
        r = self.run_sync("--no-push", "--no-notify")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.git("ls-remote", "fork", "refs/heads/" + BRANCH).stdout, before)
        self.assertTrue((self.root / "kol/builds").exists())
        self.assertFalse((self.root / "kol/state/managed-scripts/garbo/current/published").exists())
        self.git("show-ref", "--verify", "refs/garbo-upstream-sync/verified")

    def test_failed_build_cannot_publish_or_push(self):
        self.prepare_clean_merge()
        self.env["TEST_BUILD_FAIL"] = "1"
        before = self.git("ls-remote", "fork", "refs/heads/" + BRANCH).stdout
        first = self.run_sync("--no-notify")
        self.assertNotEqual(first.returncode, 0)
        second = self.run_sync("--no-notify")
        self.assertNotEqual(second.returncode, 0)
        self.assertIn("unchanged blocked merge", second.stdout)
        self.assertEqual((self.root / "kol/builds").read_text().splitlines(), ["build"])
        self.assertEqual(self.git("ls-remote", "fork", "refs/heads/" + BRANCH).stdout, before)
        self.assertFalse((self.root / "kol/state/managed-scripts/garbo/current/published").exists())

    def test_changed_fork_rechecks_blocked_inputs(self):
        self.run_sync("--no-notify")
        (self.repo / "fork-new.txt").write_text("fork input changed")
        self.commit("fork update")
        self.git("push", "-q", "fork", BRANCH)
        r = self.run_sync("--no-notify")
        self.assertIn("Auto-merging", r.stdout)
        self.assertNotEqual(r.returncode, 0)

    def test_existing_worktree_is_not_removed(self):
        p = self.repo / ".worktrees/upstream-sync"
        p.mkdir(parents=True)
        (p / "precious.txt").write_text("inspect me")
        r = self.run_sync("--no-notify")
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual((p / "precious.txt").read_text(), "inspect me")

    def test_explicit_retry_rechecks_blocked_inputs(self):
        self.run_sync("--no-notify")
        r = self.run_sync("--retry-blocked", "--no-notify")
        self.assertIn("Auto-merging", r.stdout)
        self.assertNotEqual(r.returncode, 0)

    def test_unknown_option_has_no_side_effects(self):
        r = self.run_sync("--typo")
        self.assertEqual(r.returncode, 2)
        self.assertFalse(self.state.exists())


if __name__ == "__main__":
    unittest.main()

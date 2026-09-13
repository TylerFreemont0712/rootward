# Git and version control

## Mental model
- Content-addressed objects: blobs, trees, commits, tags; the DAG of commits; refs are pointers (branches, HEAD, tags); the index/staging area; working tree.
- Three states: modified, staged, committed. `git status` is the map.
- Remotes, tracking branches, fetch vs pull, push, upstream.

## Daily workflow
`init/clone`, `add -p` (hunk staging), `commit` (good messages: imperative subject, why in body), `log --oneline --graph --all`, `diff` (working vs index vs HEAD), `branch`, `switch`/`checkout`, `merge` (fast-forward vs merge commit), `rebase` (linear history; never rebase shared history), `stash`, `tag`, `.gitignore`, `blame`, `show`.

## Recovery and surgery
`reflog` (nothing is lost for ~90 days), `reset --soft/--mixed/--hard`, `revert` (safe undo of public commits), `cherry-pick`, `rebase -i` (squash, reorder, edit, drop), `commit --amend`, `restore`, `clean`, `bisect`, `worktree`, `filter-repo` (rewriting history for removed secrets), detached HEAD.

## Collaboration
- Branching strategies: trunk-based with short-lived branches, GitHub flow, git-flow (know why it fell out of favor).
- Pull requests: small, described, reviewed; review etiquette; CI gating; squash vs merge vs rebase merges; protected branches.
- Merge conflicts: how they arise, reading conflict markers, resolving with intent, `rerere`, testing after resolution.
- Conventional commits, semantic versioning, changelogs, tags and releases.
- Monorepos vs polyrepos; submodules vs subtrees vs package registries.
- Hooks (pre-commit), signing commits, `.gitattributes`, LFS for binaries.

## Misconceptions / error tags
- Committing secrets (`secret-in-history`)
- Force-pushing shared branches (`force-push-shared`)
- Giant commits mixing concerns (`mixed-commit`)
- Resolving conflicts by picking a side blindly (`blind-conflict-resolution`)
- Confusing `reset` and `revert` (`reset-vs-revert`)

## Challenge ideas (terminal rooms; a seeded repo inside the container)
1. **The Stash Sprite** — save work in progress, switch branches, restore; checks inspect the stash list and the working tree.
2. **Merge Conflict** (boss) — three conflicting branches; resolve so that all tests pass and history is sane; phase 2: rebase a feature branch onto main.
3. **Reflog Resurrection** — a branch was "deleted"; recover it; commit hash must match.
4. **Bisect the Blight** — find the bad commit (see debugging).
5. **Interactive Rebase Imp** — squash 7 messy commits into 3 clean ones with conventional messages; checks parse `git log`.
6. **Secret Sweeper** — a token was committed 5 commits ago; purge it from history (and rotate it, narratively).
7. **Blame Game** (Puzzle) — from a `git blame` output, which commit introduced the bug and what was its stated intent?
8. **Hook Hound** — write a pre-commit hook that blocks commits containing `TODO!`; checks try to commit one.
9. **Cherry Pick Pixie** — port one fix from a release branch to main without the rest.
10. **Worktree Warden** — work on two branches simultaneously with worktrees to run their tests side by side.

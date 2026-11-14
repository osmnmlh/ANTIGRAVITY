---
name: team-git-workflow
description: Git branching, commits, pull requests and merge-conflict handling for a 6-person hackathon team working in parallel on web, iOS and watchOS. Use whenever creating branches, committing, opening or reviewing PRs, or resolving conflicts.
---

# Team Git Workflow (6 people, 24 hours)

## Ownership (avoid conflicts by design)

| Area | Folder | Owners |
| --- | --- | --- |
| Web dashboard | `web/` | 2-3 people |
| iPhone app | `mobile/ios/` | 1-2 people |
| watchOS app | `watch/` | 1 person |
| Data contract / mock | `shared/` | 1 named owner, changes announced |
| Docs, demo, README | `docs/`, root | demo lead |

One person per Xcode project at a time when adding targets/files: `project.pbxproj` conflicts are painful. Announce "I'm touching the pbxproj" in chat.

## Flow

```bash
git switch main && git pull
git switch -c feat/web-body-map        # feat|fix|docs|test/<area>-<short>
# ...work, commit small...
git add -p && git commit -m "feat(web): clickable body map with status colors"
git fetch origin && git rebase origin/main   # or merge; just stay current
git push -u origin feat/web-body-map
# open PR into main
```

- Commit messages: Conventional Commits `type(scope): what` — scopes `web|ios|watch|shared|docs`.
- PRs: small (< ~300 lines), title like the commit, body = what + how verified (+ screenshot for UI).
- Review: 1 teammate approves, max 10 minutes; author merges (squash). Don't sit on reviews.
- `main` must always build and run the demo. Broken main = top priority for whoever broke it.
- Merge every 2-3 hours at minimum; long-lived branches die in hackathons.
- Last 3 hours: **feature freeze**, only fixes and demo polish.

## Conflicts

1. `git fetch origin && git rebase origin/main`
2. Fix files, keep both sides' intent; for `project.pbxproj` prefer taking `main`'s version and re-adding your files in Xcode.
3. `git add <file> && git rebase --continue`, then re-run build/tests.
4. Never `git push --force` to `main`; `--force-with-lease` on your own branch only.

## Agents

- Agents work on a feature branch, never commit directly to `main`.
- Agent must not merge PRs or push to someone else's branch without asking that person.

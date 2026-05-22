import assert from "node:assert/strict";
import test from "node:test";

import { isDeniedChangedPath, isPendingApprovalRun } from "./approve-fork-pr-workflows.ts";

test("isPendingApprovalRun matches approval-gated fork PR runs from GitHub's captured payload shape", () => {
  const pull = {
    number: 2683,
    state: "open",
    changed_files: 1,
    head: {
      sha: "734076155c44e569304856590019cea54506fdab",
      repo: { full_name: "someone/open-design" },
    },
    base: {
      ref: "main",
      sha: "4cd93a5c7a7b0db1961c854e55f8e0e6b1b45542",
      repo: { full_name: "nexu-io/open-design" },
    },
  };

  const run = {
    id: 26273463769,
    name: "CI",
    event: "pull_request",
    status: "completed",
    conclusion: "action_required",
    head_sha: "734076155c44e569304856590019cea54506fdab",
    path: ".github/workflows/ci.yml@main",
    pull_requests: [],
  };

  assert.equal(isPendingApprovalRun(run, pull), true);
});

test("isPendingApprovalRun rejects runs outside the allowlist or without action_required conclusion", () => {
  const pull = {
    number: 2683,
    state: "open",
    changed_files: 1,
    head: {
      sha: "734076155c44e569304856590019cea54506fdab",
      repo: { full_name: "someone/open-design" },
    },
    base: {
      ref: "main",
      sha: "4cd93a5c7a7b0db1961c854e55f8e0e6b1b45542",
      repo: { full_name: "nexu-io/open-design" },
    },
  };

  assert.equal(
    isPendingApprovalRun(
      {
        id: 26273463769,
        name: "CI",
        event: "pull_request",
        status: "completed",
        conclusion: "success",
        head_sha: "734076155c44e569304856590019cea54506fdab",
        path: ".github/workflows/ci.yml@main",
        pull_requests: [],
      },
      pull,
    ),
    false,
  );

  assert.equal(
    isPendingApprovalRun(
      {
        id: 26273463770,
        name: "Visual PR Comment",
        event: "pull_request",
        status: "completed",
        conclusion: "action_required",
        head_sha: "734076155c44e569304856590019cea54506fdab",
        path: ".github/workflows/visual-pr-comment.yml@main",
        pull_requests: [],
      },
      pull,
    ),
    false,
  );
});

test("isDeniedChangedPath blocks common tool config files under allowlisted source trees", () => {
  assert.equal(isDeniedChangedPath("apps/web/vitest.config.ts"), true);
  assert.equal(isDeniedChangedPath("apps/web/vite.config.ts"), true);
  assert.equal(isDeniedChangedPath("apps/web/playwright.config.ts"), true);
  assert.equal(isDeniedChangedPath("apps/web/src/app/page.tsx"), false);
});

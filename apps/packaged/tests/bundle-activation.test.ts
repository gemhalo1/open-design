import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { addBundle } from "@open-design/bundle";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PACKAGED_WEB_SIDECAR_BUNDLE_KEY,
  createPackagedBundleActivationFile,
  resolvePackagedWebSidecarImplementation,
  sidecarImplementationEnv,
} from "../src/bundle-activation.js";
import type { PackagedNamespacePaths } from "../src/paths.js";

let roots: string[] = [];

async function tempRoot(label: string): Promise<string> {
  const root = join(tmpdir(), `od-packaged-bundle-${label}-${process.pid}-${Date.now()}-${roots.length}`);
  roots.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

function fakePaths(root: string): PackagedNamespacePaths {
  return {
    bundleActivationPath: join(root, "data", "bundle-activation.json"),
    bundleBasePath: join(root, "data", "bundles"),
    cacheRoot: join(root, "cache"),
    dataRoot: join(root, "data"),
    desktopIdentityPath: join(root, "runtime", "desktop-root.json"),
    desktopLogPath: join(root, "logs", "desktop", "latest.log"),
    desktopLogsRoot: join(root, "logs", "desktop"),
    electronSessionDataRoot: join(root, "user-data", "session"),
    electronUserDataRoot: join(root, "user-data"),
    headlessIdentityPath: join(root, "runtime", "headless-root.json"),
    logsRoot: join(root, "logs"),
    namespaceRoot: root,
    resourceRoot: join(root, "resources"),
    runtimeRoot: join(root, "runtime"),
    updateRoot: join(root, "updates"),
    webIdentityPath: join(root, "runtime", "web-root.json"),
  };
}

async function writeActivation(paths: PackagedNamespacePaths, payload: unknown): Promise<void> {
  await mkdir(join(paths.bundleActivationPath, ".."), { recursive: true });
  await writeFile(paths.bundleActivationPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function makeWebBundleSource(root: string, version: string): Promise<string> {
  const source = await tempRoot(root);
  await mkdir(join(source, "sidecar"), { recursive: true });
  await writeFile(join(source, "sidecar", "index.mjs"), "export const marker = 'bundle';\n", "utf8");
  await mkdir(join(source, "web", "standalone"), { recursive: true });
  await writeFile(join(source, "web", "standalone", "server.js"), "console.log('standalone');\n", "utf8");
  await writeFile(join(source, "bundle.json"), `${JSON.stringify({
    entry: { kind: "js", path: "sidecar/index.mjs" },
    key: PACKAGED_WEB_SIDECAR_BUNDLE_KEY,
    schemaVersion: 2,
    version,
    web: { outputMode: "standalone", standaloneRoot: "web/standalone" },
  }, null, 2)}\n`, "utf8");
  return source;
}

beforeEach(() => {
  roots = [];
});

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
});

describe("packaged web sidecar bundle activation", () => {
  it("falls back to builtin when activation is absent", async () => {
    const root = await tempRoot("missing");
    const paths = fakePaths(root);

    const selected = await resolvePackagedWebSidecarImplementation({
      builtinEntryPath: "/app/resources/builtin-web.mjs",
      bundleEpoch: "0.8.0-beta.4",
      paths,
    });

    expect(selected.entryPath).toBe("/app/resources/builtin-web.mjs");
    expect(selected.webStandaloneRoot).toBeNull();
    expect(selected.implementation).toEqual({
      entryPath: "/app/resources/builtin-web.mjs",
      fallbackReason: "activation-missing",
      source: "builtin",
    });
  });

  it("resolves a bundle activation into a concrete web sidecar entry path", async () => {
    const root = await tempRoot("bundle");
    const paths = fakePaths(root);
    const source = await makeWebBundleSource("source", "0.8.0-beta.4.web.1");
    await addBundle({
      basePath: paths.bundleBasePath,
      ref: { key: PACKAGED_WEB_SIDECAR_BUNDLE_KEY, version: "0.8.0-beta.4.web.1" },
      sourcePath: source,
    });
    await writeActivation(paths, createPackagedBundleActivationFile({
      web: { version: "0.8.0-beta.4.web.1" },
    }));

    const selected = await resolvePackagedWebSidecarImplementation({
      builtinEntryPath: "/app/resources/builtin-web.mjs",
      bundleEpoch: "0.8.0-beta.4",
      paths,
    });

    expect(selected.implementation.source).toBe("bundle");
    expect(selected.entryPath).toMatch(/sidecar\/index\.mjs$/);
    expect(selected.webStandaloneRoot).toMatch(/web\/standalone$/);
    if (selected.implementation.source !== "bundle") throw new Error("expected bundle implementation");
    expect(selected.implementation.ref).toEqual({ key: PACKAGED_WEB_SIDECAR_BUNDLE_KEY, version: "0.8.0-beta.4.web.1" });
    expect(selected.implementation.basePath).toBe(paths.bundleBasePath);
    expect(selected.implementation.bundlePath).toContain(paths.bundleBasePath);
    expect(selected.implementation.descriptorPath).toMatch(/bundle\.json$/);
  });

  it("falls back to builtin when an activated bundle targets a different host epoch", async () => {
    const root = await tempRoot("epoch-mismatch");
    const paths = fakePaths(root);
    const source = await makeWebBundleSource("source-mismatch", "0.8.0-beta.3.web.1");
    await addBundle({
      basePath: paths.bundleBasePath,
      ref: { key: PACKAGED_WEB_SIDECAR_BUNDLE_KEY, version: "0.8.0-beta.3.web.1" },
      sourcePath: source,
    });
    await writeActivation(paths, createPackagedBundleActivationFile({
      web: { version: "0.8.0-beta.3.web.1" },
    }));

    const selected = await resolvePackagedWebSidecarImplementation({
      builtinEntryPath: "/app/resources/builtin-web.mjs",
      bundleEpoch: "0.8.0-beta.4",
      paths,
    });

    expect(selected.entryPath).toBe("/app/resources/builtin-web.mjs");
    expect(selected.implementation).toMatchObject({
      fallbackReason: "bundle-epoch-mismatch:0.8.0-beta.3",
      source: "builtin",
    });
  });

  it("falls back to builtin when bundle activation cannot resolve", async () => {
    const root = await tempRoot("unresolved");
    const paths = fakePaths(root);
    await writeActivation(paths, createPackagedBundleActivationFile({
      web: { version: "0.8.0-beta.4.web.99" },
    }));

    const selected = await resolvePackagedWebSidecarImplementation({
      builtinEntryPath: null,
      bundleEpoch: "0.8.0-beta.4",
      paths,
    });

    expect(selected.entryPath).toBeNull();
    expect(selected.implementation).toMatchObject({
      fallbackReason: expect.stringContaining("bundle-unresolved:bundle-not-found"),
      source: "builtin",
    });
  });

  it("serializes implementation diagnostics for the web sidecar status env", () => {
    expect(sidecarImplementationEnv({
      entryPath: "/app/resources/builtin-web.mjs",
      fallbackReason: "activation-missing",
      source: "builtin",
    })).toEqual({
      OD_SIDECAR_IMPLEMENTATION_JSON: JSON.stringify({
        entryPath: "/app/resources/builtin-web.mjs",
        fallbackReason: "activation-missing",
        source: "builtin",
      }),
    });
  });
});

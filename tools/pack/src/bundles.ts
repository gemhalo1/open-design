import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parseBundleEpochVersion, validateBundleRef } from "@open-design/bundle";

import type { ToolPackConfig } from "./config.js";

export const TOOLS_PACK_WEB_BUNDLE_KEY = "od:sidecar:web";
export const TOOLS_PACK_WEB_BUNDLE_SLUG = "web";

export type PackagedWebBundleActivationResult = {
  activationPath: string;
  bundleBasePath: string;
  key: typeof TOOLS_PACK_WEB_BUNDLE_KEY;
  namespace: string;
  platform: ToolPackConfig["platform"];
  source: "builtin" | "bundle" | "missing";
  version?: string;
};

function activationPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "data", "bundle-activation.json");
}

function bundleBasePath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "data", "bundles");
}

function baseResult(config: ToolPackConfig): Omit<PackagedWebBundleActivationResult, "source"> {
  return {
    activationPath: activationPath(config),
    bundleBasePath: bundleBasePath(config),
    key: TOOLS_PACK_WEB_BUNDLE_KEY,
    namespace: config.namespace,
    platform: config.platform,
  };
}

function validateWebBundleVersion(version: string): string {
  const parsed = parseBundleEpochVersion(version);
  if (parsed.slug !== TOOLS_PACK_WEB_BUNDLE_SLUG) {
    throw new Error(`web bundle activation version must use .${TOOLS_PACK_WEB_BUNDLE_SLUG}.M: ${version}`);
  }
  return validateBundleRef({ key: TOOLS_PACK_WEB_BUNDLE_KEY, version: parsed.version }).version;
}

export async function activatePackagedWebBundle(
  config: ToolPackConfig,
  version: string,
): Promise<PackagedWebBundleActivationResult> {
  const validVersion = validateWebBundleVersion(version);
  const path = activationPath(config);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({ key: TOOLS_PACK_WEB_BUNDLE_KEY, version: validVersion }, null, 2)}\n`,
    "utf8",
  );
  return {
    ...baseResult(config),
    source: "bundle",
    version: validVersion,
  };
}

export async function activatePackagedBuiltinWebBundle(
  config: ToolPackConfig,
): Promise<PackagedWebBundleActivationResult> {
  const path = activationPath(config);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({ key: TOOLS_PACK_WEB_BUNDLE_KEY, source: "builtin" }, null, 2)}\n`,
    "utf8",
  );
  return {
    ...baseResult(config),
    source: "builtin",
  };
}

export async function readPackagedWebBundleActivation(
  config: ToolPackConfig,
): Promise<PackagedWebBundleActivationResult> {
  const result = baseResult(config);
  try {
    const parsed = JSON.parse(await readFile(result.activationPath, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
      throw new Error("activation file must contain a JSON object");
    }
    const record = parsed as Record<string, unknown>;
    if (record.key !== TOOLS_PACK_WEB_BUNDLE_KEY) {
      throw new Error(`activation key must be ${TOOLS_PACK_WEB_BUNDLE_KEY}`);
    }
    if (record.source === "builtin") return { ...result, source: "builtin" };
    if (typeof record.version !== "string") {
      throw new Error("activation file must contain version or source=builtin");
    }
    return {
      ...result,
      source: "bundle",
      version: validateWebBundleVersion(record.version),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...result, source: "missing" };
    }
    throw error;
  }
}

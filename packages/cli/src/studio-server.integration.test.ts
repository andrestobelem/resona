import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { startStudioServer, type StudioServer } from "./studio-server.js";

const engineModulePath = fileURLToPath(new URL("../../engine/dist/index.js", import.meta.url));
let exactProjectRoot: string;
let exactEntryPoint: string;
const servers: StudioServer[] = [];

beforeAll(async () => {
  exactProjectRoot = await realpath(await mkdtemp(join(tmpdir(), "resona-studio-")));
  await mkdir(join(exactProjectRoot, "src"), { recursive: true });
  exactEntryPoint = join(exactProjectRoot, "src", "index.tsx");
  await writeFile(
    exactEntryPoint,
    `import { Composition, Sequence, duration, position, rational, registerRoot } from ${JSON.stringify(engineModulePath)};
const Song = () => <Sequence id="root" from={position.seconds(0n)} />;
const Root = () => <Composition id="StudioFixture" component={Song} duration={duration.seconds(1n)} bpm={rational(120n)} timeSignature={{ beatsPerBar: 4, beatUnit: 4 }} />;
registerRoot(Root);`,
  );
});

afterAll(async () => {
  await rm(exactProjectRoot, { recursive: true, force: true });
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const createServer = async (): Promise<StudioServer> => {
  const server = await startStudioServer({
    projectRoot: exactProjectRoot,
    entryPoint: exactEntryPoint,
  });
  servers.push(server);
  return server;
};

const apiHeaders = (server: StudioServer, additional: Record<string, string> = {}) => ({
  authorization: `Bearer ${server.token}`,
  ...additional,
});

describe("Studio local service", () => {
  it("serves a token-bound static shell and rejects foreign origins or sessions", async () => {
    const server = await createServer();

    const shell = await fetch(server.url);
    expect(shell.status).toBe(200);
    const html = await shell.text();
    expect(html).toContain("Resona Studio");
    expect(html).toContain(server.token);
    expect(html).not.toContain("registerRoot");

    const foreignShell = await fetch(server.url, {
      headers: { origin: "http://evil.example" },
    });
    expect(foreignShell.status).toBe(403);

    const missingToken = await fetch(`${server.url}/api/v1/compositions`);
    expect(missingToken.status).toBe(401);

    const foreignOrigin = await fetch(`${server.url}/api/v1/compositions`, {
      headers: apiHeaders(server, { origin: "http://evil.example" }),
    });
    expect(foreignOrigin.status).toBe(403);

    const compositions = await fetch(`${server.url}/api/v1/compositions`, {
      headers: apiHeaders(server),
    });
    const compositionsDocument = await compositions.json();
    expect(compositions.status).toBe(200);
    expect(compositionsDocument).toMatchObject({
      format: "resona/studio-envelope",
      schemaVersion: 1,
      type: "compositions",
      sessionId: server.sessionId,
      compositions: [expect.objectContaining({ id: "StudioFixture" })],
    });

    const session = await fetch(`${server.url}/api/v1/session`, {
      headers: apiHeaders(server),
    });
    await expect(session.json()).resolves.toMatchObject({
      type: "session",
      sessionId: server.sessionId,
      session: { host: "127.0.0.1", port: server.port },
    });
  });

  it("creates a serializable variant and exposes only its plan and authorized hashes", async () => {
    const server = await createServer();
    const requestId = "request-variant-1";
    const created = await fetch(`${server.url}/api/v1/variants`, {
      method: "POST",
      headers: apiHeaders(server, { "content-type": "application/json" }),
      body: JSON.stringify({ compositionId: "StudioFixture", requestId }),
    });

    const document = (await created.json()) as {
      format: string;
      schemaVersion: number;
      type: string;
      requestId: string;
      variantId: string;
      payload: { plan: { format: string; compositionId: string }; variant: unknown };
    };
    expect(created.status).toBe(201);
    expect(document).toMatchObject({
      format: "resona/studio-envelope",
      schemaVersion: 1,
      type: "variant",
      requestId,
      payload: {
        plan: { format: "resona/execution-plan", compositionId: "StudioFixture" },
      },
    });
    expect(document.variantId).toMatch(/^variant-/);
    expect(JSON.stringify(document)).not.toContain("sourcePaths");
    expect(JSON.stringify(document)).not.toContain(exactProjectRoot);

    const plan = await fetch(`${server.url}/api/v1/variants/${document.variantId}/plan`, {
      headers: apiHeaders(server),
    });
    expect(plan.status).toBe(200);
    await expect(plan.json()).resolves.toMatchObject({
      format: "resona/studio-envelope",
      type: "plan",
      variantId: document.variantId,
      payload: { format: "resona/execution-plan", compositionId: "StudioFixture" },
    });

    const unauthorizedResource = await fetch(
      `${server.url}/api/v1/variants/${document.variantId}/resources/sha256:${"0".repeat(64)}`,
      { headers: apiHeaders(server) },
    );
    expect(unauthorizedResource.status).toBe(404);
  }, 15_000);

  it("returns protocol errors for malformed or unknown variant requests", async () => {
    const server = await createServer();
    const malformed = await fetch(`${server.url}/api/v1/variants`, {
      method: "POST",
      headers: apiHeaders(server, { "content-type": "application/json" }),
      body: JSON.stringify({ inputs: [] }),
    });

    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      format: "resona/studio-envelope",
      schemaVersion: 1,
      type: "error",
      error: { code: "studio.invalid-request" },
    });

    const unknown = await fetch(`${server.url}/api/v1/variants/variant-missing`, {
      headers: apiHeaders(server),
    });
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toMatchObject({
      type: "error",
      error: { code: "studio.variant-not-found" },
    });
  });
});

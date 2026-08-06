import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
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
  await mkdir(join(exactProjectRoot, "public"), { recursive: true });
  exactEntryPoint = join(exactProjectRoot, "src", "index.tsx");
  const wav = Buffer.alloc(48);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(40, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(3, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48_000, 24);
  wav.writeUInt32LE(192_000, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(32, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(4, 40);
  wav.writeFloatLE(0.25, 44);
  await writeFile(join(exactProjectRoot, "public", "tone.wav"), wav);
  await writeFile(
    exactEntryPoint,
    `import { AudioClip, Composition, Sequence, Track, duration, position, rational, registerRoot, staticAudio } from ${JSON.stringify(engineModulePath)};
const Song = () => <Sequence id="root" from={position.seconds(0n)} />;
const ResourceSong = () => <Sequence id="root" from={position.seconds(0n)}><Track id="audio" source={<AudioClip id="tone" src={staticAudio("tone.wav")} from={position.seconds(0n)} duration={duration.seconds(1n, 48000n)} />} /></Sequence>;
const prepareResource = async ({ resources }) => { await resources.audio(staticAudio("tone.wav")); return {}; };
const Root = () => <><Composition id="StudioFixture" component={Song} duration={duration.seconds(1n)} bpm={rational(120n)} timeSignature={{ beatsPerBar: 4, beatUnit: 4 }} /><Composition id="ResourceFixture" component={ResourceSong} prepare={prepareResource} duration={duration.seconds(1n, 48000n)} bpm={rational(120n)} timeSignature={{ beatsPerBar: 4, beatUnit: 4 }} /></>;
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
    expect(html).toContain("audioWorklet.addModule('/studio/audio-worklet.js')");
    expect(html).toContain("outputChannelCount: [2]");
    expect(html).toContain("Float32Array.from");
    expect(html).toContain("resources.map(resource => resource.samples.buffer)");
    expect(html).toContain("type: 'play'");
    expect(html).toContain("type: 'pause'");
    expect(html).toContain("Preview error: ");

    const worklet = await fetch(`${server.url}/studio/audio-worklet.js`);
    expect(worklet.status).toBe(200);
    expect(worklet.headers.get("content-type")).toContain("text/javascript");
    expect(await worklet.text()).toContain("resona-audio");

    const engine = await fetch(`${server.url}/studio/audio-engine.js`);
    expect(engine.status).toBe(200);
    expect(await engine.text()).toContain("createAudioEngine");

    const foreignWorklet = await fetch(`${server.url}/studio/audio-worklet.js`, {
      headers: { origin: "http://evil.example" },
    });
    expect(foreignWorklet.status).toBe(403);

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
      compositions: expect.arrayContaining([expect.objectContaining({ id: "StudioFixture" })]),
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

  it("redacts physical project paths from discovery failures", async () => {
    const server = await startStudioServer({
      projectRoot: exactProjectRoot,
      entryPoint: join(exactProjectRoot, "missing.tsx"),
    });
    servers.push(server);
    const response = await fetch(`${server.url}/api/v1/compositions`, {
      headers: apiHeaders(server),
    });
    const document = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(document)).not.toContain(exactProjectRoot);
    expect(document).toMatchObject({
      type: "error",
      error: { code: "studio.compositions-failed", message: expect.stringContaining("<project>") },
    });
  });

  it("redacts canonical paths when the project root is a symlink", async () => {
    const linkedProjectRoot = join(tmpdir(), `resona-studio-link-${randomUUID()}`);
    await symlink(exactProjectRoot, linkedProjectRoot, "dir");
    try {
      const server = await startStudioServer({
        projectRoot: linkedProjectRoot,
        entryPoint: "missing.tsx",
      });
      servers.push(server);
      const response = await fetch(`${server.url}/api/v1/compositions`, {
        headers: apiHeaders(server),
      });
      const document = await response.json();

      expect(response.status).toBe(500);
      expect(JSON.stringify(document)).not.toContain(exactProjectRoot);
      expect(JSON.stringify(document)).not.toContain(linkedProjectRoot);
      expect(document).toMatchObject({
        type: "error",
        error: {
          code: "studio.compositions-failed",
          message: expect.stringContaining("<project>"),
        },
      });
    } finally {
      await rm(linkedProjectRoot, { force: true });
    }
  });

  it("serves samples only for a hash authorized by the created variant", async () => {
    const server = await createServer();
    const created = await fetch(`${server.url}/api/v1/variants`, {
      method: "POST",
      headers: apiHeaders(server, { "content-type": "application/json" }),
      body: JSON.stringify({ compositionId: "ResourceFixture" }),
    });
    const document = (await created.json()) as {
      variantId: string;
      payload: { resources: readonly { hash: string }[] };
    };
    expect(created.status).toBe(201);
    const resourceHash = document.payload.resources[0]?.hash;
    expect(resourceHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const resource = await fetch(
      `${server.url}/api/v1/variants/${document.variantId}/resources/${resourceHash}`,
      { headers: apiHeaders(server) },
    );
    expect(resource.status).toBe(200);
    await expect(resource.json()).resolves.toMatchObject({
      type: "resource",
      variantId: document.variantId,
      payload: { resource: { hash: resourceHash, samples: [0.25] } },
    });
  }, 15_000);
});

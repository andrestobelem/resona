import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";

import {
  createRenderJob,
  loadProjectCompositions,
  ResonaError,
  type CreateRenderJobResult,
  type Diagnostic,
  type JsonObject,
  type ProjectSourceOptions,
} from "@resona/engine";

const protocolFormat = "resona/studio-envelope" as const;
const protocolVersion = 1 as const;
const host = "127.0.0.1" as const;
const maxBodyBytes = 1_048_576;
const rendererDist = new URL("../../renderer/dist/", import.meta.url);

export type StudioServerOptions = Readonly<{
  projectRoot: string;
  configPath?: string;
  entryPoint?: string;
  port?: number;
}>;

export type StudioServer = Readonly<{
  host: typeof host;
  port: number;
  url: string;
  token: string;
  sessionId: string;
  close: () => Promise<void>;
}>;

type StoredVariant = Readonly<{
  job: CreateRenderJobResult;
  controller: AbortController;
}>;

type StudioState = {
  readonly options: StudioServerOptions;
  readonly token: string;
  readonly sessionId: string;
  readonly variants: Map<string, StoredVariant>;
  readonly activeByComposition: Map<string, AbortController>;
  port: number;
  url: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const json = (response: ServerResponse, status: number, document: unknown): void => {
  const body = JSON.stringify(document);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(body);
};

const envelope = (
  state: StudioState,
  requestId: string,
  type: string,
  payload: Record<string, unknown> = {},
  variantId?: string,
): Record<string, unknown> => ({
  format: protocolFormat,
  schemaVersion: protocolVersion,
  sessionId: state.sessionId,
  requestId,
  ...(variantId === undefined ? {} : { variantId }),
  type,
  ...payload,
});

const errorEnvelope = (
  state: StudioState,
  requestId: string,
  status: number,
  code: string,
  message: string,
  variantId?: string,
): { status: number; document: Record<string, unknown> } => ({
  status,
  document: envelope(state, requestId, "error", { error: { code, message } }, variantId),
});

const requestIdFrom = (request: IncomingMessage, body?: Record<string, unknown>): string => {
  const header = request.headers["x-resona-request-id"];
  if (typeof header === "string" && header.length > 0 && header.length <= 128) return header;
  const requested = body?.requestId;
  return typeof requested === "string" && requested.length > 0 && requested.length <= 128
    ? requested
    : `request-${randomUUID()}`;
};

const tokenFrom = (request: IncomingMessage): string | undefined => {
  const authorization = request.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }
  const header = request.headers["x-resona-token"];
  return typeof header === "string" ? header : undefined;
};

const tokenMatches = (actual: string | undefined, expected: string): boolean => {
  if (actual === undefined) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
};

const expectedOrigin = (state: StudioState): string => `${state.url}`;

const hostOriginError = (
  state: StudioState,
  request: IncomingMessage,
): { status: number; message: string } | undefined => {
  const expectedHost = `${host}:${state.port}`;
  if (request.headers.host !== expectedHost) {
    return { status: 403, message: "The request Host is not authorized." };
  }
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== expectedOrigin(state)) {
    return { status: 403, message: "The request Origin is not authorized." };
  }
  return undefined;
};

const accessError = (
  state: StudioState,
  request: IncomingMessage,
): { status: number; message: string } | undefined => {
  const hostOrigin = hostOriginError(state, request);
  if (hostOrigin !== undefined) return hostOrigin;
  if (!tokenMatches(tokenFrom(request), state.token)) {
    return { status: 401, message: "A valid Studio session token is required." };
  }
  return undefined;
};

const readBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maxBodyBytes) throw new Error("Request body is too large.");
    chunks.push(bytes);
  }
  if (size === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
};

const sourceOptions = (options: StudioServerOptions): ProjectSourceOptions => ({
  ...(options.configPath === undefined ? {} : { configPath: options.configPath }),
  ...(options.entryPoint === undefined ? {} : { entryPoint: options.entryPoint }),
});

const studioProject = (project: CreateRenderJobResult["project"]): Record<string, unknown> => {
  return { buildId: project.buildId, configuration: project.configuration };
};

const serializeVariant = (job: CreateRenderJobResult): Record<string, unknown> => ({
  project: studioProject(job.project),
  composition: job.composition,
  variant: job.variant,
  spec: job.spec,
  fingerprint: job.fingerprint,
  plan: job.plan,
  resources: job.runtimeResources.map(({ type, hash, channels, sampleRate, frameCount }) => ({
    type,
    hash,
    channels,
    sampleRate,
    frameCount,
  })),
  diagnostics: job.diagnostics,
});

const diagnosticFrom = (error: unknown): readonly Diagnostic[] | undefined =>
  error instanceof ResonaError ? error.diagnostics : undefined;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Studio request failed.";

const redactProjectPath = (projectRoot: string, value: unknown): unknown => {
  if (typeof value === "string") return value.replaceAll(projectRoot, "<project>");
  if (Array.isArray(value)) return value.map((item) => redactProjectPath(projectRoot, item));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactProjectPath(projectRoot, item)]),
    );
  }
  return value;
};

const safeErrorMessage = (state: StudioState, error: unknown): string =>
  String(redactProjectPath(state.options.projectRoot, errorMessage(error)));

const safeDiagnostics = (state: StudioState, error: unknown): readonly Diagnostic[] | undefined => {
  const diagnostics = diagnosticFrom(error);
  return diagnostics === undefined
    ? undefined
    : (redactProjectPath(state.options.projectRoot, diagnostics) as readonly Diagnostic[]);
};

const shell = (state: StudioState): string => {
  const bootstrap = JSON.stringify({ token: state.token, sessionId: state.sessionId });
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resona Studio</title>
    <style>body{font:15px system-ui,sans-serif;max-width:1000px;margin:2rem auto;padding:0 1rem;background:#111827;color:#e5e7eb}button,select{font:inherit;padding:.45rem .7rem;margin:.25rem;background:#1f2937;color:#e5e7eb;border:1px solid #4b5563;border-radius:.35rem}pre{white-space:pre-wrap;background:#030712;padding:1rem;border-radius:.4rem;overflow:auto}header{display:flex;align-items:center;gap:1rem}</style>
  </head>
  <body><header><h1>Resona Studio</h1><span id="status">Loading compositions…</span><span id="cursor"></span></header>
    <label>Composition <select id="composition"></select></label><button id="inspect">Inspect variant</button><button id="play" disabled>Play</button><button id="pause" disabled>Pause</button><pre id="details"></pre>
    <script>
      const session = ${bootstrap};
      const headers = () => ({Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json'});
      const status = document.querySelector('#status');
      const cursor = document.querySelector('#cursor');
      const select = document.querySelector('#composition');
      const details = document.querySelector('#details');
      const inspect = document.querySelector('#inspect');
      const play = document.querySelector('#play');
      const pause = document.querySelector('#pause');
      let audioContext;
      let audioNode;
      let activeVariant;
      let ready = false;
      let ended = false;
      const request = async (path, options = {}) => fetch(path, { ...options, headers: {...headers(), ...(options.headers || {})} }).then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error?.message || 'Studio request failed'); return value; });
      const load = async () => { const value = await request('/api/v1/compositions'); for (const composition of value.compositions) { const option = document.createElement('option'); option.value = composition.id; option.textContent = composition.id; select.append(option); } status.textContent = value.compositions.length + ' compositions'; };
      const closeAudio = async () => { ready = false; audioNode?.disconnect(); audioNode = undefined; if (audioContext !== undefined) await audioContext.close(); audioContext = undefined; play.disabled = true; pause.disabled = true; };
      const prepareAudio = async (variantId, payload) => {
        if (typeof AudioContext === 'undefined') throw new Error('This browser does not support AudioWorklet preview.');
        audioContext = new AudioContext({sampleRate: 48000});
        if (audioContext.sampleRate !== 48000) throw new Error('Studio preview requires a 48 kHz AudioContext.');
        await audioContext.audioWorklet.addModule('/studio/audio-worklet.js');
        const node = new AudioWorkletNode(audioContext, 'resona-audio', {numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2]});
        audioNode = node;
        node.connect(audioContext.destination);
        const readyPromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('AudioWorklet readiness timed out.')), 5000);
          node.port.onmessage = event => {
            const message = event.data;
            if (message.type === 'ready') { clearTimeout(timeout); ready = true; resolve(message); }
            if (message.type === 'snapshot') cursor.textContent = ' · frame ' + message.cursorFrame;
            if (message.type === 'ended') { ended = true; play.disabled = false; pause.disabled = true; status.textContent = 'Playback ended'; }
            if (message.type === 'error') { clearTimeout(timeout); ready = false; play.disabled = true; pause.disabled = true; status.textContent = 'Preview error: ' + message.message; reject(new Error(message.message)); }
          };
        });
        const resources = [];
        for (const resource of payload.resources) {
          const value = await request('/api/v1/variants/' + encodeURIComponent(variantId) + '/resources/' + encodeURIComponent(resource.hash));
          const resolved = value.payload.resource;
          resources.push({...resolved, samples: Float32Array.from(resolved.samples)});
        }
        node.port.postMessage({type: 'load', plan: payload.plan, resources}, resources.map(resource => resource.samples.buffer));
        await readyPromise;
        play.disabled = false;
        pause.disabled = false;
      };
      inspect.addEventListener('click', async () => { status.textContent = 'Preparing…'; inspect.disabled = true; play.disabled = true; pause.disabled = true; try { await closeAudio(); const value = await request('/api/v1/variants', {method: 'POST', body: JSON.stringify({compositionId: select.value})}); activeVariant = value.variantId; ended = false; details.textContent = JSON.stringify(value.payload, null, 2); await prepareAudio(value.variantId, value.payload); status.textContent = 'Variant ' + value.variantId + ' ready'; } catch (error) { status.textContent = error.message; await closeAudio(); } finally { inspect.disabled = false; } });
      play.addEventListener('click', async () => { if (!ready || audioNode === undefined || audioContext === undefined) return; try { if (ended) { audioNode.port.postMessage({type: 'seek', frame: 0}); ended = false; } await audioContext.resume(); audioNode.port.postMessage({type: 'play'}); status.textContent = 'Playing'; } catch (error) { status.textContent = error.message; } });
      pause.addEventListener('click', async () => { if (!ready || audioNode === undefined || audioContext === undefined) return; audioNode.port.postMessage({type: 'pause'}); await audioContext.suspend(); status.textContent = 'Paused'; });
      load().catch(error => { status.textContent = error.message; });
    </script>
  </body>
</html>`;
};

const studioModule = async (name: "audio-worklet.js" | "audio-engine.js"): Promise<Buffer> =>
  readFile(new URL(name, rendererDist));

const handle = async (
  state: StudioState,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const parsed = new URL(request.url ?? "/", state.url);
  if (parsed.pathname === "/" && request.method === "GET") {
    const hostOrigin = hostOriginError(state, request);
    if (hostOrigin !== undefined) {
      json(
        response,
        hostOrigin.status,
        errorEnvelope(
          state,
          requestIdFrom(request),
          hostOrigin.status,
          "studio.unauthorized",
          hostOrigin.message,
        ).document,
      );
      return;
    }
    response.statusCode = 200;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.end(shell(state));
    return;
  }
  const moduleName =
    parsed.pathname === "/studio/audio-worklet.js"
      ? "audio-worklet.js"
      : parsed.pathname === "/studio/audio-engine.js"
        ? "audio-engine.js"
        : undefined;
  if (moduleName !== undefined && request.method === "GET") {
    const hostOrigin = hostOriginError(state, request);
    if (hostOrigin !== undefined) {
      response.statusCode = hostOrigin.status;
      response.end();
      return;
    }
    try {
      response.statusCode = 200;
      response.setHeader("content-type", "text/javascript; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.setHeader("x-content-type-options", "nosniff");
      response.end(await studioModule(moduleName));
    } catch {
      response.statusCode = 404;
      response.end();
    }
    return;
  }
  if (!parsed.pathname.startsWith("/api/v1/")) {
    response.statusCode = 404;
    response.end();
    return;
  }
  const access = accessError(state, request);
  if (access !== undefined) {
    json(
      response,
      access.status,
      errorEnvelope(
        state,
        requestIdFrom(request),
        access.status,
        "studio.unauthorized",
        access.message,
      ).document,
    );
    return;
  }

  let body: Record<string, unknown> | undefined;
  if (request.method === "POST") {
    try {
      const value = await readBody(request);
      if (!isRecord(value)) throw new Error("Request body must be a JSON object.");
      body = value;
    } catch (error) {
      const failure = errorEnvelope(
        state,
        requestIdFrom(request),
        400,
        "studio.invalid-request",
        errorMessage(error),
      );
      json(response, failure.status, failure.document);
      return;
    }
  }
  const requestId = requestIdFrom(request, body);
  if (parsed.pathname === "/api/v1/session" && request.method === "GET") {
    json(
      response,
      200,
      envelope(state, requestId, "session", { session: { host, port: state.port } }),
    );
    return;
  }
  if (parsed.pathname === "/api/v1/compositions" && request.method === "GET") {
    try {
      const catalog = await loadProjectCompositions(
        state.options.projectRoot,
        sourceOptions(state.options),
      );
      json(
        response,
        200,
        envelope(state, requestId, "compositions", {
          project: studioProject(catalog.project as CreateRenderJobResult["project"]),
          compositions: catalog.compositions,
        }),
      );
    } catch (error) {
      json(
        response,
        500,
        envelope(state, requestId, "error", {
          error: {
            code: "studio.compositions-failed",
            message: safeErrorMessage(state, error),
            diagnostics: safeDiagnostics(state, error),
          },
        }),
      );
    }
    return;
  }
  if (parsed.pathname === "/api/v1/variants" && request.method === "POST") {
    const compositionId = body?.compositionId;
    const inputs = body?.inputs;
    const seed = body?.seed;
    if (
      typeof compositionId !== "string" ||
      compositionId.length === 0 ||
      (inputs !== undefined && !isRecord(inputs)) ||
      (seed !== undefined && typeof seed !== "string")
    ) {
      const failure = errorEnvelope(
        state,
        requestId,
        400,
        "studio.invalid-request",
        "compositionId, inputs, and seed have invalid types.",
      );
      json(response, failure.status, failure.document);
      return;
    }
    state.activeByComposition.get(compositionId)?.abort();
    const controller = new AbortController();
    state.activeByComposition.set(compositionId, controller);
    try {
      const job = await createRenderJob({
        projectRoot: state.options.projectRoot,
        compositionId,
        ...(inputs === undefined ? {} : { inputs: inputs as JsonObject }),
        ...(seed === undefined ? {} : { seed }),
        signal: controller.signal,
        ...sourceOptions(state.options),
      });
      const variantId = `variant-${randomUUID()}`;
      state.variants.set(variantId, { job, controller });
      const document = envelope(
        state,
        requestId,
        "variant",
        { payload: serializeVariant(job) },
        variantId,
      );
      json(response, 201, document);
    } catch (error) {
      json(
        response,
        409,
        envelope(state, requestId, "error", {
          error: {
            code: controller.signal.aborted ? "studio.variant-cancelled" : "studio.variant-failed",
            message: safeErrorMessage(state, error),
            diagnostics: safeDiagnostics(state, error),
          },
        }),
      );
    } finally {
      if (state.activeByComposition.get(compositionId) === controller)
        state.activeByComposition.delete(compositionId);
    }
    return;
  }

  const variantMatch = /^\/api\/v1\/variants\/([^/]+)(?:\/(plan)|\/resources\/([^/]+))?$/.exec(
    parsed.pathname,
  );
  if (variantMatch !== null && request.method === "GET") {
    const variantId = decodeURIComponent(variantMatch[1] ?? "");
    const stored = state.variants.get(variantId);
    if (stored === undefined) {
      const failure = errorEnvelope(
        state,
        requestId,
        404,
        "studio.variant-not-found",
        "The requested variant is not available.",
        variantId,
      );
      json(response, failure.status, failure.document);
      return;
    }
    if (variantMatch[2] === "plan") {
      json(
        response,
        200,
        envelope(state, requestId, "plan", { payload: stored.job.plan }, variantId),
      );
      return;
    }
    if (variantMatch[3] !== undefined) {
      const hash = decodeURIComponent(variantMatch[3] ?? "");
      if (!/^sha256:[0-9a-f]{64}$/.test(hash)) {
        const failure = errorEnvelope(
          state,
          requestId,
          404,
          "studio.resource-not-found",
          "The requested resource is not authorized.",
          variantId,
        );
        json(response, failure.status, failure.document);
        return;
      }
      const resource = stored.job.runtimeResources.find((candidate) => candidate.hash === hash);
      if (resource === undefined) {
        const failure = errorEnvelope(
          state,
          requestId,
          404,
          "studio.resource-not-found",
          "The requested resource is not authorized.",
          variantId,
        );
        json(response, failure.status, failure.document);
        return;
      }
      json(
        response,
        200,
        envelope(
          state,
          requestId,
          "resource",
          {
            payload: {
              resource: {
                type: resource.type,
                hash: resource.hash,
                channels: resource.channels,
                sampleRate: resource.sampleRate,
                frameCount: resource.frameCount,
                samples: Array.from(resource.samples),
              },
            },
          },
          variantId,
        ),
      );
      return;
    }
    json(
      response,
      200,
      envelope(state, requestId, "variant", { payload: serializeVariant(stored.job) }, variantId),
    );
    return;
  }
  const failure = errorEnvelope(
    state,
    requestId,
    404,
    "studio.route-not-found",
    "The requested Studio route does not exist.",
  );
  json(response, failure.status, failure.document);
};

export const startStudioServer = async (options: StudioServerOptions): Promise<StudioServer> => {
  const canonicalProjectRoot = await realpath(options.projectRoot);
  const canonicalPath = async (path: string | undefined): Promise<string | undefined> => {
    if (path === undefined) return undefined;
    const lexicalRoot = resolve(options.projectRoot);
    const lexicalPath = resolve(lexicalRoot, path);
    const relativePath = relative(lexicalRoot, lexicalPath);
    const canonicalPath = resolve(canonicalProjectRoot, relativePath);
    try {
      return await realpath(canonicalPath);
    } catch {
      return canonicalPath;
    }
  };
  const canonicalConfigPath = await canonicalPath(options.configPath);
  const canonicalEntryPoint = await canonicalPath(options.entryPoint);
  const canonicalOptions: StudioServerOptions = {
    ...options,
    projectRoot: canonicalProjectRoot,
    ...(canonicalConfigPath === undefined ? {} : { configPath: canonicalConfigPath }),
    ...(canonicalEntryPoint === undefined ? {} : { entryPoint: canonicalEntryPoint }),
  };
  const state: StudioState = {
    options: canonicalOptions,
    token: randomBytes(32).toString("hex"),
    sessionId: `session-${randomUUID()}`,
    variants: new Map(),
    activeByComposition: new Map(),
    port: 0,
    url: "",
  };
  const server: Server = createServer((request, response) => {
    void handle(state, request, response).catch((error: unknown) => {
      const failure = errorEnvelope(
        state,
        requestIdFrom(request),
        500,
        "studio.internal-error",
        safeErrorMessage(state, error),
      );
      if (!response.headersSent) json(response, failure.status, failure.document);
      else response.destroy();
    });
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(options.port ?? 0, host);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("Studio server did not expose a TCP port.");
  }
  state.port = address.port;
  state.url = `http://${host}:${state.port}`;
  let closePromise: Promise<void> | undefined;
  return {
    host,
    port: state.port,
    url: state.url,
    token: state.token,
    sessionId: state.sessionId,
    close: () => {
      closePromise ??= new Promise<void>((resolve, reject) => {
        for (const controller of state.activeByComposition.values()) controller.abort();
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
      return closePromise;
    },
  };
};

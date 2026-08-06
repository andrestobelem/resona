import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
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
  staticDirectory?: string;
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

const staticAudioPaths = async (directory: string): Promise<readonly string[]> => {
  const paths: string[] = [];
  const visit = async (current: string, prefix: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const logicalPath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      const absolutePath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath, logicalPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".wav")) {
        paths.push(logicalPath);
      }
    }
  };
  await visit(directory, "");
  return paths.sort();
};

const shell = (state: StudioState): string => {
  const bootstrap = JSON.stringify({ token: state.token, sessionId: state.sessionId });
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resona Studio</title>
    <style>body{font:15px system-ui,sans-serif;max-width:1000px;margin:2rem auto;padding:0 1rem;background:#111827;color:#e5e7eb}button,select,input,textarea{font:inherit;padding:.45rem .7rem;margin:.25rem;background:#1f2937;color:#e5e7eb;border:1px solid #4b5563;border-radius:.35rem}textarea{display:block;width:100%;box-sizing:border-box;font-family:ui-monospace,monospace}fieldset{border:1px solid #4b5563;border-radius:.35rem;margin:.5rem 0;padding:.5rem}#input-error{display:block;color:#fca5a5;min-height:1.3rem}pre{white-space:pre-wrap;background:#030712;padding:1rem;border-radius:.4rem;overflow:auto}header{display:flex;align-items:center;gap:1rem}#studio-inspection{margin-top:1.5rem}#studio-inspection h2,#studio-inspection h3{margin-bottom:.5rem}.inspection-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(18rem,1fr));gap:1rem}.inspection-card{border:1px solid #4b5563;border-radius:.35rem;padding:.75rem;margin:.75rem 0}.studio-timeline{position:relative;min-height:8rem;border:1px solid #4b5563;border-radius:.35rem;padding:2rem .75rem .75rem;overflow-x:auto}.studio-timeline-sequences{display:grid;gap:.2rem;margin-bottom:.5rem;color:#9ca3af}.studio-timeline-tracks{display:grid;gap:.4rem}.timeline-track{display:grid;grid-template-columns:minmax(8rem,12rem) minmax(20rem,1fr);gap:.75rem;align-items:center;min-height:2.5rem}.timeline-track-label{font-weight:600}.timeline-clips{position:relative;display:block;min-height:2rem;margin:0;padding:0;list-style:none}.timeline-clip{position:absolute;top:0;display:flex;align-items:center;box-sizing:border-box;min-width:2rem;min-height:2rem;padding:.35rem .5rem;border:1px solid #60a5fa;border-radius:.25rem;background:#1e3a5f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.timeline-playhead{position:absolute;z-index:1;top:0;bottom:0;width:2px;background:#fbbf24;pointer-events:none;transition:left .1s linear}.meter-row{display:grid;grid-template-columns:minmax(8rem,12rem) minmax(8rem,1fr);gap:.75rem;align-items:center;margin:.4rem 0}.meter-row meter{width:100%;height:1rem}.inspection-list{margin:.25rem 0;padding-left:1.2rem}.inspection-muted{color:#9ca3af}</style>
  </head>
  <body><header><h1>Resona Studio</h1><span id="status">Loading compositions…</span><span id="cursor"></span></header>
    <label>Composition <select id="composition"></select></label><button id="inspect">Prepare variant</button><button id="play" disabled>Play</button><button id="pause" disabled>Pause</button><label>Seek <input id="seek" type="range" min="0" max="0" value="0" step="1" disabled><span id="seek-value">0</span></label><label><input id="loop" type="checkbox" disabled> Loop</label>
    <section id="inputs" hidden><h2>Inputs</h2><div id="input-controls"></div><label>JSON fallback<textarea id="input-json" rows="8"></textarea></label><span id="input-error" role="alert"></span></section>
    <section id="studio-inspection" hidden aria-labelledby="inspection-title">
      <h2 id="inspection-title">Read-only composition inspection</h2>
      <section class="inspection-card" aria-labelledby="timeline-title">
        <h3 id="timeline-title">Timeline</h3>
        <div id="studio-timeline" class="studio-timeline" aria-label="Composition timeline">
          <div id="studio-timeline-sequences" class="studio-timeline-sequences" aria-label="Sequences"></div>
          <div id="studio-timeline-tracks" class="studio-timeline-tracks" role="list"></div>
          <div id="studio-timeline-playhead" class="timeline-playhead" aria-hidden="true"></div>
        </div>
      </section>
      <div class="inspection-grid">
        <section class="inspection-card" aria-labelledby="chain-title"><h3 id="chain-title">Track chains</h3><div id="studio-chain"></div></section>
        <section class="inspection-card" aria-labelledby="meters-title"><h3 id="meters-title">Meters</h3><div class="meter-row"><span>Master</span><meter id="meter-master" min="0" max="1" low="0.2" high="0.8" optimum="0.6" value="0">0</meter></div><div id="studio-track-meters"></div></section>
      </div>
      <div class="inspection-grid">
        <details id="composition-ir" class="inspection-card"><summary>CompositionIR</summary><pre id="composition-ir-json"></pre></details>
        <details id="execution-plan" class="inspection-card"><summary>ExecutionPlan</summary><pre id="execution-plan-json"></pre></details>
      </div>
      <section id="studio-diagnostics" class="inspection-card" aria-labelledby="diagnostics-title"><h3 id="diagnostics-title">Diagnostics</h3><ol id="studio-diagnostics-list" class="inspection-list"></ol></section>
    </section>
    <pre id="details"></pre>
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
      const seek = document.querySelector('#seek');
      const seekValue = document.querySelector('#seek-value');
      const loop = document.querySelector('#loop');
      const inputSection = document.querySelector('#inputs');
      const inputControls = document.querySelector('#input-controls');
      const inputJson = document.querySelector('#input-json');
      const inputError = document.querySelector('#input-error');
      const inspection = document.querySelector('#studio-inspection');
      const timelineSequences = document.querySelector('#studio-timeline-sequences');
      const timelineTracks = document.querySelector('#studio-timeline-tracks');
      const timelinePlayhead = document.querySelector('#studio-timeline-playhead');
      const chain = document.querySelector('#studio-chain');
      const masterMeter = document.querySelector('#meter-master');
      const trackMeters = document.querySelector('#studio-track-meters');
      const compositionIrJson = document.querySelector('#composition-ir-json');
      const executionPlanJson = document.querySelector('#execution-plan-json');
      const diagnosticsList = document.querySelector('#studio-diagnostics-list');
      let audioContext;
      let audioNode;
      let activeVariant;
      let ready = false;
      let ended = false;
      let compositions = [];
      let staticResources = [];
      let selectedComposition;
      let variantController;
      let variantRequestSequence = 0;
      let currentCursorFrame = 0;
      let isPlaying = false;
      let fallbackInputs = false;
      let audioClosePromise = Promise.resolve();
      let activePlan;
      let activeMeterEntries = [];
      const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
      const cloneJson = value => JSON.parse(JSON.stringify(value === undefined ? {} : value));
      const request = async (path, options = {}) => { const response = await fetch(path, { ...options, headers: {...headers(), ...(options.headers || {})} }); const value = await response.json(); if (!response.ok) throw new Error(value.error?.message || 'Studio request failed'); return value; };
      const resourceHint = schema => { const hint = schema?.['x-resona-resource']; return hint === 'audio' || hint === 'audio-resource' || (isRecord(hint) && hint.type === 'audio-resource'); };
      const hasControl = schema => {
        if (!isRecord(schema)) return false;
        if (resourceHint(schema) || Array.isArray(schema.enum)) return true;
        if (schema.type === 'boolean' || schema.type === 'number' || schema.type === 'integer' || schema.type === 'string') return true;
        if (schema.type !== 'object' || !isRecord(schema.properties)) return false;
        if (schema.additionalProperties !== false || isRecord(schema.patternProperties)) return false;
        return Object.values(schema.properties).every(hasControl);
      };
      const labelFor = path => String(path[path.length - 1] || 'value');
      const setAt = (target, path, value) => { let current = target; for (let index = 0; index < path.length - 1; index += 1) { const key = path[index]; if (!isRecord(current[key])) current[key] = {}; current = current[key]; } current[path[path.length - 1]] = value; };
      const valueAt = (target, path) => path.reduce((current, key) => current === undefined ? undefined : current[key], target);
      const appendControl = (schema, path, value, parent) => {
        if (schema.type === 'object' && isRecord(schema.properties)) {
          const fieldset = document.createElement('fieldset');
          const legend = document.createElement('legend');
          legend.textContent = labelFor(path);
          fieldset.append(legend);
          for (const [key, childSchema] of Object.entries(schema.properties)) appendControl(childSchema, [...path, key], valueAt(value, [key]), fieldset);
          parent.append(fieldset);
          return;
        }
        const label = document.createElement('label');
        label.textContent = labelFor(path) + ' ';
        let control;
        if (resourceHint(schema)) {
          control = document.createElement('select');
          for (const resource of staticResources) { const option = document.createElement('option'); option.value = resource; option.textContent = resource; option.selected = isRecord(value) && value.path === resource; control.append(option); }
          if (staticResources.length === 0) { const option = document.createElement('option'); option.textContent = 'No WAV resources found'; option.disabled = true; option.selected = true; control.append(option); }
          control.dataset.inputKind = 'audio-resource';
        } else if (Array.isArray(schema.enum)) {
          control = document.createElement('select');
          for (const optionValue of schema.enum) { const option = document.createElement('option'); option.value = JSON.stringify(optionValue); option.textContent = String(optionValue); option.selected = JSON.stringify(optionValue) === JSON.stringify(value); control.append(option); }
          control.dataset.inputKind = 'enum';
        } else if (schema.type === 'boolean') {
          control = document.createElement('input'); control.type = 'checkbox'; control.checked = value === true;
        } else if (schema.type === 'number' || schema.type === 'integer') {
          control = document.createElement('input'); control.type = 'number'; control.value = typeof value === 'number' ? String(value) : ''; if (typeof schema.minimum === 'number') control.min = String(schema.minimum); if (typeof schema.maximum === 'number') control.max = String(schema.maximum); control.step = schema.type === 'integer' ? '1' : (typeof schema.multipleOf === 'number' ? String(schema.multipleOf) : 'any');
        } else {
          control = document.createElement(schema['x-resona-ui'] === 'textarea' || (isRecord(schema['x-resona-ui']) && schema['x-resona-ui'].control === 'textarea') ? 'textarea' : 'input'); control.type = 'text'; control.value = typeof value === 'string' ? value : '';
        }
        control.dataset.inputPath = JSON.stringify(path); control.dataset.inputPresent = value === undefined ? 'false' : 'true'; label.append(control); parent.append(label);
      };
      const renderInputs = composition => {
        selectedComposition = composition;
        inputError.textContent = '';
        const schema = composition.inputSchema?.jsonSchema || {type: 'object', properties: {}};
        const defaults = cloneJson(composition.defaultInputs);
        fallbackInputs = !hasControl(schema);
        inputSection.hidden = false;
        inputControls.hidden = fallbackInputs;
        inputJson.hidden = !fallbackInputs;
        inputJson.value = JSON.stringify(defaults, null, 2);
        inputControls.replaceChildren();
        if (fallbackInputs) { inputControls.textContent = 'This input schema uses JSON fallback with server-side validation.'; return; }
        appendControl(schema, [], defaults, inputControls);
      };
      const readInputs = () => {
        if (fallbackInputs) { const parsed = JSON.parse(inputJson.value); if (!isRecord(parsed)) throw new Error('Inputs JSON must be an object.'); return parsed; }
        const result = cloneJson(selectedComposition.defaultInputs);
        for (const control of inputControls.querySelectorAll('[data-input-path]')) { if (control.dataset.inputPresent !== 'true') continue; const path = JSON.parse(control.dataset.inputPath); let value; if (control.dataset.inputKind === 'audio-resource') value = {type: 'resona/static-audio', version: 1, path: control.value}; else if (control.dataset.inputKind === 'enum') value = JSON.parse(control.value); else if (control.type === 'checkbox') value = control.checked; else if (control.type === 'number') value = control.value === '' ? null : Number(control.value); else value = control.value; setAt(result, path, value); }
        return result;
      };
      const rationalLabel = value => isRecord(value) ? String(value.numerator) + '/' + String(value.denominator) : '?';
      const temporalLabel = value => {
        if (!isRecord(value)) return '';
        if (value.type === 'absolute-position' && isRecord(value.seconds)) return rationalLabel(value.seconds) + ' s';
        if (value.type === 'musical-position' && isRecord(value.quarterNotes)) return rationalLabel(value.quarterNotes) + ' qn';
        if (value.type === 'absolute-duration' && isRecord(value.seconds)) return rationalLabel(value.seconds) + ' s';
        if (value.type === 'musical-duration' && isRecord(value.quarterNotes)) return rationalLabel(value.quarterNotes) + ' qn';
        return '';
      };
      const rationalNumber = value => isRecord(value) ? Number(value.numerator) / Number(value.denominator) : 0;
      const positionSeconds = (value, tempo) => {
        if (!isRecord(value)) return 0;
        if (value.type === 'absolute-position' && isRecord(value.seconds)) return rationalNumber(value.seconds);
        if (value.type === 'musical-position' && isRecord(value.quarterNotes)) return rationalNumber(value.quarterNotes) * 60 / Math.max(1e-9, rationalNumber(tempo));
        return 0;
      };
      const durationSeconds = (value, tempo) => {
        if (!isRecord(value)) return 0;
        if (value.type === 'absolute-duration' && isRecord(value.seconds)) return rationalNumber(value.seconds);
        if (value.type === 'musical-duration' && isRecord(value.quarterNotes)) return rationalNumber(value.quarterNotes) * 60 / Math.max(1e-9, rationalNumber(tempo));
        return 0;
      };
      const pathLabel = value => Array.isArray(value) ? value.join(' / ') : 'unknown node';
      const secondsLabel = value => Number.isFinite(value) ? Number(value).toFixed(3) + ' s' : 'unknown';
      const collectTracks = (sequence, tempo, output = [], depth = 0, parentStart = 0, parentEnd = Infinity) => {
        if (!isRecord(sequence) || !Array.isArray(sequence.children)) return output;
        const sequenceStart = parentStart + positionSeconds(sequence.from, tempo);
        const sequenceEnd = sequence.duration ? Math.min(parentEnd, sequenceStart + durationSeconds(sequence.duration, tempo)) : parentEnd;
        for (const child of sequence.children) {
          if (child?.type === 'sequence') collectTracks(child, tempo, output, depth + 1, sequenceStart, sequenceEnd);
          else if (child?.type === 'instrument-track' || child?.type === 'audio-track') output.push({track: child, depth, start: sequenceStart, end: sequenceEnd});
        }
        return output;
      };
      const collectSequences = (sequence, tempo, output = [], depth = 0, parentStart = 0, parentEnd = Infinity) => {
        if (!isRecord(sequence)) return output;
        const start = parentStart + positionSeconds(sequence.from, tempo);
        const end = sequence.duration ? Math.min(parentEnd, start + durationSeconds(sequence.duration, tempo)) : parentEnd;
        output.push({sequence, depth, start, end});
        if (!Array.isArray(sequence.children)) return output;
        for (const child of sequence.children) if (child?.type === 'sequence') collectSequences(child, tempo, output, depth + 1, start, end);
        return output;
      };
      const textNode = (tag, text, className) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        node.textContent = text;
        return node;
      };
      const updatePlayhead = frame => {
        if (!activePlan || !timelinePlayhead) return;
        const duration = Number(activePlan.nominalDurationFrames) || 1;
        const ratio = Math.max(0, Math.min(1, Number(frame) / duration));
        timelinePlayhead.style.left = String(ratio * 100) + '%';
      };
      const updateMeters = levels => {
        if (!Array.isArray(levels) && !ArrayBuffer.isView(levels)) return;
        const masterIndex = Number(activePlan?.masterProcessor);
        const masterLevel = Number(levels[masterIndex]);
        if (masterMeter && Number.isFinite(masterLevel)) masterMeter.value = Math.max(0, Math.min(1, masterLevel));
        for (const entry of activeMeterEntries) {
          const level = Number(levels[entry.processorIndex]);
          if (Number.isFinite(level)) entry.meter.value = Math.max(0, Math.min(1, level));
        }
      };
      const renderInspection = payload => {
        if (!isRecord(payload) || !isRecord(payload.composition) || !isRecord(payload.plan)) return;
        activePlan = payload.plan;
        inspection.hidden = false;
        timelineSequences.replaceChildren();
        timelineTracks.replaceChildren();
        chain.replaceChildren();
        trackMeters.replaceChildren();
        diagnosticsList.replaceChildren();
        compositionIrJson.textContent = JSON.stringify(payload.composition, null, 2);
        executionPlanJson.textContent = JSON.stringify(payload.plan, null, 2);
        const tempo = payload.composition.tempo?.bpm;
        const totalSeconds = Math.max(1e-9, durationSeconds(payload.composition.duration, tempo));
        const sampleRate = Math.max(1, Number(activePlan.sampleRate) || 48_000);
        const audioRegionBuckets = new Map();
        for (const region of Array.isArray(activePlan.audioRegions) ? activePlan.audioRegions : []) {
          if (!isRecord(region)) continue;
          const key = String(region.destination) + ':' + String(region.startFrame);
          const bucket = audioRegionBuckets.get(key);
          if (bucket) bucket.push(region);
          else audioRegionBuckets.set(key, [region]);
        }
        for (const entry of collectSequences(payload.composition.root, tempo, [], 0, 0, totalSeconds)) {
          const sequenceDuration = Math.max(0, Math.min(totalSeconds, entry.end) - entry.start);
          const sequenceNode = textNode('div', (entry.depth ? '↳ ' : '') + 'Sequence · ' + String(entry.sequence.id) + ' · from ' + temporalLabel(entry.sequence.from) + ' · start ' + secondsLabel(entry.start) + ' · duration ' + secondsLabel(sequenceDuration), 'inspection-muted');
          sequenceNode.dataset.nodePath = pathLabel(entry.sequence.path);
          sequenceNode.dataset.startSeconds = String(entry.start);
          sequenceNode.dataset.endSeconds = String(entry.end);
          timelineSequences.append(sequenceNode);
        }
        const tracks = collectTracks(payload.composition.root, tempo, [], 0, 0, totalSeconds);
        let processorIndex = 0;
        activeMeterEntries = [];
        for (const entry of tracks) {
          const track = entry.track;
          const trackRow = document.createElement('div');
          trackRow.className = 'timeline-track';
          trackRow.setAttribute('role', 'listitem');
          trackRow.dataset.processorIndex = String(processorIndex);
          const trackName = textNode('span', (entry.depth ? '↳ ' : '') + String(track.id), 'timeline-track-label');
          trackRow.append(trackName);
          const clips = document.createElement('ol');
          clips.className = 'timeline-clips';
          for (const clip of Array.isArray(track.clips) ? track.clips : []) {
            const clipLabel = String(clip.type || 'clip') + ' · ' + String(clip.id || 'unnamed') + ' · from ' + temporalLabel(clip.from);
            const clipNode = textNode('li', clipLabel, 'timeline-clip');
            clipNode.dataset.nodePath = pathLabel(clip.path);
            const clipStart = entry.start + positionSeconds(clip.from, tempo);
            const regionKey = String(processorIndex) + ':' + String(Math.round(clipStart * sampleRate));
            const regionBucket = audioRegionBuckets.get(regionKey);
            const audioRegion = clip.type === 'audio-clip' && regionBucket ? regionBucket.shift() : undefined;
            const trackEnd = Math.min(totalSeconds, entry.end);
            const availableDuration = Math.max(0, trackEnd - clipStart);
            const eventDuration = Array.isArray(clip.events) ? clip.events.reduce((end, event) => Math.max(end, positionSeconds(event.at, tempo) + durationSeconds(event.duration, tempo)), 0) : 0;
            const clipDuration = clip.type === 'audio-clip'
              ? (audioRegion ? Number(audioRegion.durationFrames) / sampleRate : clip.duration ? durationSeconds(clip.duration, tempo) : availableDuration)
              : eventDuration;
            clipNode.style.left = String(Math.max(0, Math.min(100, clipStart / totalSeconds * 100))) + '%';
            clipNode.style.width = String(Math.max(2, Math.min(100, Math.min(availableDuration, clipDuration) / totalSeconds * 100))) + '%';
            clips.append(clipNode);
          }
          if (clips.children.length === 0) clips.append(textNode('li', 'No clips', 'inspection-muted'));
          trackRow.append(clips);
          timelineTracks.append(trackRow);

          const chainRow = document.createElement('div');
          chainRow.className = 'meter-row';
          const chainLabel = track.type === 'instrument-track' && isRecord(track.instrument)
            ? 'PolySynth · ' + String(track.instrument.oscillator)
            : 'Audio source';
          const effects = Array.isArray(track.effects) ? track.effects.map(effect => String(effect.type)).join(' → ') : '';
          chainRow.append(textNode('span', String(track.id), 'timeline-track-label'));
          chainRow.append(textNode('span', effects ? chainLabel + ' → ' + effects : chainLabel));
          chain.append(chainRow);

          const meterRow = document.createElement('div');
          meterRow.className = 'meter-row';
          meterRow.append(textNode('span', String(track.id)));
          const meter = document.createElement('meter');
          meter.min = 0;
          meter.max = 1;
          meter.low = 0.2;
          meter.high = 0.8;
          meter.optimum = 0.6;
          meter.value = 0;
          meter.setAttribute('aria-label', 'Level ' + String(track.id));
          meterRow.append(meter);
          trackMeters.append(meterRow);
          const effectCount = Array.isArray(track.effects) ? track.effects.length : 0;
          activeMeterEntries.push({meter, processorIndex: processorIndex + effectCount});
          processorIndex += 1 + effectCount;
        }
        const diagnostics = Array.isArray(payload.diagnostics) ? payload.diagnostics : [];
        if (diagnostics.length === 0) diagnosticsList.append(textNode('li', 'No diagnostics', 'inspection-muted'));
        for (const diagnostic of diagnostics) {
          const item = document.createElement('li');
          item.textContent = String(diagnostic.code || 'diagnostic') + ' — ' + String(diagnostic.message || '');
          if (diagnostic.nodePath) item.textContent += ' [' + pathLabel(diagnostic.nodePath) + ']';
          if (diagnostic.source) item.textContent += ' (' + String(diagnostic.source.file || '') + ':' + String(diagnostic.source.line || '') + ')';
          diagnosticsList.append(item);
        }
        updatePlayhead(0);
        updateMeters([]);
      };
      const load = async () => { const value = await request('/api/v1/compositions'); compositions = value.compositions; try { const resources = await request('/api/v1/static-resources'); staticResources = resources.payload.resources; } catch { staticResources = []; } for (const composition of compositions) { const option = document.createElement('option'); option.value = composition.id; option.textContent = composition.id; select.append(option); } if (compositions[0] !== undefined) renderInputs(compositions[0]); status.textContent = compositions.length + ' compositions'; };
      const closeAudio = () => { const close = async () => { ready = false; isPlaying = false; const node = audioNode; const context = audioContext; audioNode = undefined; audioContext = undefined; node?.disconnect(); if (context !== undefined) await context.close(); play.disabled = true; pause.disabled = true; seek.disabled = true; loop.disabled = true; }; audioClosePromise = audioClosePromise.then(close, close); return audioClosePromise; };
      const prepareAudio = async (variantId, payload, resumeFrame, resumePlayback, requestSequence, signal) => {
        if (typeof AudioContext === 'undefined') throw new Error('This browser does not support AudioWorklet preview.');
        const context = new AudioContext({sampleRate: 48000});
        const isCurrent = () => requestSequence === variantRequestSequence && !signal.aborted;
        let node;
        let completed = false;
        try {
          if (context.sampleRate !== 48000) throw new Error('Studio preview requires a 48 kHz AudioContext.');
          await context.audioWorklet.addModule('/studio/audio-worklet.js');
          if (!isCurrent()) return;
          node = new AudioWorkletNode(context, 'resona-audio', {numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2]});
          audioContext = context;
          audioNode = node;
          node.connect(context.destination);
          const readyPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('AudioWorklet readiness timed out.')), 5000);
            const abort = () => { clearTimeout(timeout); const error = new Error('AudioWorklet preparation was cancelled.'); error.name = 'AbortError'; reject(error); };
            signal.addEventListener('abort', abort, {once: true});
            node.port.onmessage = event => {
              if (!isCurrent()) return;
              const message = event.data;
              if (message.type === 'ready') { clearTimeout(timeout); signal.removeEventListener('abort', abort); ready = true; resolve(message); }
              if (message.type === 'snapshot') { currentCursorFrame = message.cursorFrame; cursor.textContent = ' · frame ' + message.cursorFrame; seekValue.textContent = String(message.cursorFrame); if (document.activeElement !== seek) seek.value = String(message.cursorFrame); updatePlayhead(message.cursorFrame); }
              if (message.type === 'meter') updateMeters(message.levels);
              if (message.type === 'ended') { currentCursorFrame = message.cursorFrame; isPlaying = false; ended = true; play.disabled = false; pause.disabled = true; status.textContent = 'Playback ended'; }
              if (message.type === 'underrun') { const code = message.diagnostic?.code || 'audio.underrun'; clearTimeout(timeout); signal.removeEventListener('abort', abort); ready = false; isPlaying = false; play.disabled = true; pause.disabled = true; seek.disabled = true; loop.disabled = true; inputError.textContent = message.diagnostic.message + ' (' + code + ')'; status.textContent = 'Preview error: ' + message.diagnostic.message; void context.suspend(); const error = new Error(message.diagnostic.message); error.name = code; reject(error); }
              if (message.type === 'error') { clearTimeout(timeout); signal.removeEventListener('abort', abort); ready = false; play.disabled = true; pause.disabled = true; seek.disabled = true; loop.disabled = true; status.textContent = 'Preview error: ' + message.message; reject(new Error(message.message)); }
            };
            if (signal.aborted) abort();
          });
          const resources = [];
          for (const resource of payload.resources) {
            if (!isCurrent()) return;
            const value = await request('/api/v1/variants/' + encodeURIComponent(variantId) + '/resources/' + encodeURIComponent(resource.hash), {signal});
            if (!isCurrent()) return;
            const resolved = value.payload.resource;
            resources.push({...resolved, samples: Float32Array.from(resolved.samples)});
          }
          node.port.postMessage({type: 'load', plan: payload.plan, resources}, resources.map(resource => resource.samples.buffer));
          await readyPromise;
          if (!isCurrent()) return;
          const seekFrame = Math.min(Math.max(0, resumeFrame), Math.max(0, payload.plan.nominalDurationFrames - 1));
          if (seekFrame > 0) node.port.postMessage({type: 'seek', frame: seekFrame});
          currentCursorFrame = seekFrame;
          seek.max = String(Math.max(0, payload.plan.nominalDurationFrames - 1));
          seek.value = String(seekFrame);
          seekValue.textContent = String(seekFrame);
          seek.disabled = false;
          loop.disabled = false;
          node.port.postMessage({type: 'loop', enabled: loop.checked});
          play.disabled = false;
          pause.disabled = false;
          if (resumePlayback) { await context.resume(); if (!isCurrent()) return; node.port.postMessage({type: 'play'}); isPlaying = true; ended = false; }
          completed = true;
        } finally {
          if (!completed || !isCurrent()) { node?.disconnect(); if (audioNode === node) audioNode = undefined; if (audioContext === context) audioContext = undefined; await context.close(); }
        }
      };
      const invalidateVariantRequest = () => { variantRequestSequence += 1; variantController?.abort(); variantController = undefined; activeVariant = undefined; details.textContent = ''; inspection.hidden = true; activePlan = undefined; activeMeterEntries = []; currentCursorFrame = 0; cursor.textContent = ''; seek.value = '0'; seek.max = '0'; seekValue.textContent = '0'; ready = false; isPlaying = false; inspect.disabled = false; play.disabled = true; pause.disabled = true; seek.disabled = true; loop.disabled = true; void closeAudio(); };
      const prepareVariant = async () => { const requestSequence = ++variantRequestSequence; variantController?.abort(); const controller = new AbortController(); variantController = controller; const resumeFrame = currentCursorFrame; const resumePlayback = isPlaying; status.textContent = 'Preparing…'; inspect.disabled = true; play.disabled = true; pause.disabled = true; seek.disabled = true; loop.disabled = true; inputError.textContent = ''; let inputs; try { inputs = readInputs(); await closeAudio(); if (requestSequence !== variantRequestSequence) return; const requestId = 'studio-variant-' + requestSequence + '-' + Date.now(); const value = await request('/api/v1/variants', {method: 'POST', headers: {'x-resona-request-id': requestId}, signal: controller.signal, body: JSON.stringify({compositionId: select.value, inputs, requestId})}); if (requestSequence !== variantRequestSequence) return; activeVariant = value.variantId; ended = false; details.textContent = JSON.stringify(value.payload, null, 2); renderInspection(value.payload); await prepareAudio(value.variantId, value.payload, resumeFrame, resumePlayback, requestSequence, controller.signal); if (requestSequence !== variantRequestSequence) return; status.textContent = resumePlayback ? 'Playing variant ' + value.variantId : 'Variant ' + value.variantId + ' ready'; } catch (error) { if (error?.name === 'AbortError' || requestSequence !== variantRequestSequence) return; inputError.textContent = error.message; status.textContent = error.message; await closeAudio(); } finally { if (requestSequence === variantRequestSequence) { variantController = undefined; inspect.disabled = false; } } };
      select.addEventListener('change', () => { invalidateVariantRequest(); const composition = compositions.find(candidate => candidate.id === select.value); if (composition !== undefined) renderInputs(composition); });
      inspect.addEventListener('click', () => { void prepareVariant(); });
      inputControls.addEventListener('change', event => { if (!fallbackInputs) { event.target?.dataset && (event.target.dataset.inputPresent = 'true'); void prepareVariant(); } });
      inputJson.addEventListener('change', () => { if (fallbackInputs) void prepareVariant(); });
      play.addEventListener('click', async () => { if (!ready || audioNode === undefined || audioContext === undefined) return; try { if (ended) { audioNode.port.postMessage({type: 'seek', frame: 0}); currentCursorFrame = 0; seek.value = '0'; seekValue.textContent = '0'; ended = false; } await audioContext.resume(); audioNode.port.postMessage({type: 'play'}); isPlaying = true; status.textContent = 'Playing'; } catch (error) { status.textContent = error.message; } });
      pause.addEventListener('click', async () => { if (!ready || audioNode === undefined || audioContext === undefined) return; try { audioNode.port.postMessage({type: 'pause'}); isPlaying = false; await audioContext.suspend(); status.textContent = 'Paused'; } catch (error) { ready = false; isPlaying = false; play.disabled = true; pause.disabled = true; seek.disabled = true; loop.disabled = true; const message = error instanceof Error ? error.message : 'Preview transport failed.'; inputError.textContent = message; status.textContent = 'Preview error: ' + message; void closeAudio(); } });
      seek.addEventListener('change', async () => { if (!ready || audioNode === undefined || audioContext === undefined) return; try { const frame = Math.max(0, Math.min(Number(seek.value), Number(seek.max))); const resumePlayback = isPlaying; ended = false; isPlaying = false; currentCursorFrame = frame; seek.value = String(frame); seekValue.textContent = String(frame); audioNode.port.postMessage({type: 'seek', frame}); if (resumePlayback) { await audioContext.resume(); if (!ready || audioNode === undefined) return; audioNode.port.postMessage({type: 'play'}); isPlaying = true; status.textContent = 'Playing'; } else { status.textContent = 'Paused'; } } catch (error) { ready = false; isPlaying = false; play.disabled = true; pause.disabled = true; seek.disabled = true; loop.disabled = true; const message = error instanceof Error ? error.message : 'Preview transport failed.'; inputError.textContent = message; status.textContent = 'Preview error: ' + message; void closeAudio(); } });
      loop.addEventListener('change', () => { if (!ready || audioNode === undefined) return; audioNode.port.postMessage({type: 'loop', enabled: loop.checked}); status.textContent = loop.checked ? 'Loop enabled' : 'Loop disabled'; });
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
      state.staticDirectory = resolve(
        state.options.projectRoot,
        catalog.project.configuration.staticDir.value,
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
  if (parsed.pathname === "/api/v1/static-resources" && request.method === "GET") {
    try {
      if (state.staticDirectory === undefined) {
        const catalog = await loadProjectCompositions(
          state.options.projectRoot,
          sourceOptions(state.options),
        );
        state.staticDirectory = resolve(
          state.options.projectRoot,
          catalog.project.configuration.staticDir.value,
        );
      }
      json(
        response,
        200,
        envelope(state, requestIdFrom(request), "static-resources", {
          payload: { resources: await staticAudioPaths(state.staticDirectory) },
        }),
      );
    } catch (error) {
      json(
        response,
        500,
        envelope(state, requestIdFrom(request), "error", {
          error: {
            code: "studio.static-resources-failed",
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

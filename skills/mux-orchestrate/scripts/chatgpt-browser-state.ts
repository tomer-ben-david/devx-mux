import { parseHTML } from "linkedom";

export interface UnboundRequestBoundary {
  kind: "unbound-request";
  label: string;
  expectedPromptText: string;
  matchMode: "exact" | "contains";
}

export interface TurnBoundary {
  kind: "turn";
  conversationUrl: string;
  userMessageId: string;
  label: string;
}

export type ReviewBoundary = UnboundRequestBoundary | TurnBoundary;

export interface ReadyRecord {
  boundary: TurnBoundary;
  digest: string;
}

export interface BrowserReviewState {
  requestObserved: boolean;
  responseObserved: boolean;
  responseComplete: boolean;
  generating: boolean;
  answer: string;
}

interface TurnTokenPayload {
  version: 1;
  conversationUrl: string;
  userMessageId: string;
  label?: string;
}

interface RequestTokenPayload {
  version: 1;
  label: string;
  expectedPromptText: string;
}

function normalizePromptText(value: string): string {
  return value.trim();
}

export function encodeRequestToken(label: string, expectedPromptText: string): string {
  const prompt = normalizePromptText(expectedPromptText);
  if (!label.startsWith("MUX_REQUEST_ID=") || !prompt) {
    throw new Error("A request token requires a MUX_REQUEST_ID label and non-empty prompt");
  }
  const payload: RequestTokenPayload = { version: 1, label, expectedPromptText: prompt };
  return `REQUEST_TOKEN=${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

function normalizeConversationUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`.replace(/\/$/, "");
}

export function encodeTurnToken(conversationUrl: string, userMessageId: string, label = "adopted review"): string {
  const payload: TurnTokenPayload = {
    version: 1,
    conversationUrl: normalizeConversationUrl(conversationUrl),
    userMessageId,
    label,
  };
  return `TURN_TOKEN=${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

export function parseReviewBoundary(value: string): ReviewBoundary {
  if (value.startsWith("REQUEST_ID=")) {
    return { kind: "unbound-request", label: value, expectedPromptText: value, matchMode: "contains" };
  }
  if (value.startsWith("REQUEST_TOKEN=")) {
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(value.slice("REQUEST_TOKEN=".length), "base64url").toString("utf8"));
    } catch {
      throw new Error("Malformed ChatGPT request token");
    }
    if (
      typeof payload !== "object" || payload === null ||
      !("version" in payload) || payload.version !== 1 ||
      !("label" in payload) || typeof payload.label !== "string" || !payload.label.startsWith("MUX_REQUEST_ID=") ||
      !("expectedPromptText" in payload) || typeof payload.expectedPromptText !== "string" || !normalizePromptText(payload.expectedPromptText)
    ) throw new Error("Malformed ChatGPT request token");
    return {
      kind: "unbound-request",
      label: payload.label,
      expectedPromptText: normalizePromptText(payload.expectedPromptText),
      matchMode: "exact",
    };
  }
  const tokenPrefix = value.startsWith("TURN_TOKEN=") ? "TURN_TOKEN=" : value.startsWith("ADOPT_TOKEN=") ? "ADOPT_TOKEN=" : "";
  if (!tokenPrefix) {
    throw new Error(`Expected REQUEST_ID=<id>, REQUEST_TOKEN=<token>, or TURN_TOKEN=<token>, got ${value}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(value.slice(tokenPrefix.length), "base64url").toString("utf8"));
  } catch {
    throw new Error("Malformed ChatGPT adoption token");
  }
  if (
    typeof payload !== "object" || payload === null ||
    !("version" in payload) || payload.version !== 1 ||
    !("conversationUrl" in payload) || typeof payload.conversationUrl !== "string" ||
    !("userMessageId" in payload) || typeof payload.userMessageId !== "string" || !payload.userMessageId
  ) {
    throw new Error("Malformed ChatGPT adoption token");
  }
  return {
    kind: "turn",
    conversationUrl: normalizeConversationUrl(payload.conversationUrl),
    userMessageId: payload.userMessageId,
    label: "label" in payload && typeof payload.label === "string" ? payload.label : "adopted review",
  };
}

export function createAdoptionToken(html: string, conversationUrl: string): string {
  const { document } = parseHTML(html);
  const userTurns = [...document.querySelectorAll('section[data-turn="user"]')];
  const latestUser = userTurns.at(-1)?.querySelector('[data-message-author-role="user"][data-message-id]');
  const messageId = latestUser?.getAttribute("data-message-id");
  if (!messageId) {
    throw new Error("Cannot adopt ChatGPT review: no user message identity found");
  }
  return encodeTurnToken(conversationUrl, messageId);
}

export function serializeTurnBoundary(boundary: TurnBoundary): string {
  return encodeTurnToken(boundary.conversationUrl, boundary.userMessageId, boundary.label);
}

export function bindReviewBoundary(
  html: string,
  conversationUrl: string,
  boundary: ReviewBoundary,
): TurnBoundary {
  if (boundary.kind === "turn") return boundary;
  const { document } = parseHTML(html);
  const users = [...document.querySelectorAll('section[data-turn="user"] [data-message-author-role="user"][data-message-id]')];
  const user = users.findLast(message => {
    const text = normalizePromptText(message.textContent ?? "");
    return boundary.matchMode === "exact"
      ? text === boundary.expectedPromptText
      : text.includes(boundary.expectedPromptText);
  });
  const userMessageId = user?.getAttribute("data-message-id");
  if (!userMessageId) throw new Error(`Cannot bind ChatGPT request: submitted turn not found (${boundary.label})`);
  return {
    kind: "turn",
    conversationUrl: normalizeConversationUrl(conversationUrl),
    userMessageId,
    label: boundary.label,
  };
}

export class RequestBoundaryTracker {
  private candidate: TurnBoundary | undefined;
  private observations = 0;

  observe(html: string, conversationUrl: string, request: UnboundRequestBoundary): TurnBoundary | undefined {
    let observed: TurnBoundary;
    try {
      observed = bindReviewBoundary(html, conversationUrl, request);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Cannot bind ChatGPT request:")) return undefined;
      throw error;
    }
    const sameCandidate = this.candidate?.conversationUrl === observed.conversationUrl &&
      this.candidate.userMessageId === observed.userMessageId;
    this.candidate = observed;
    this.observations = sameCandidate ? this.observations + 1 : 1;
    return this.observations >= 2 ? observed : undefined;
  }
}

export function serializeReadyRecord(boundary: TurnBoundary, digest: string): string {
  const payload = { version: 1, boundary, digest };
  return `READY_TOKEN=${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

export function parseReadyRecord(value: string): ReadyRecord | undefined {
  if (!value.startsWith("READY_TOKEN=")) return undefined;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(value.slice("READY_TOKEN=".length), "base64url").toString("utf8"));
  } catch {
    throw new Error("Malformed ChatGPT ready token");
  }
  if (
    typeof payload !== "object" || payload === null || !("version" in payload) || payload.version !== 1 ||
    !("digest" in payload) || typeof payload.digest !== "string" || !/^[a-f0-9]{64}$/.test(payload.digest) ||
    !("boundary" in payload) || typeof payload.boundary !== "object" || payload.boundary === null ||
    !("kind" in payload.boundary) || payload.boundary.kind !== "turn" ||
    !("conversationUrl" in payload.boundary) || typeof payload.boundary.conversationUrl !== "string" ||
    !("userMessageId" in payload.boundary) || typeof payload.boundary.userMessageId !== "string" ||
    !("label" in payload.boundary) || typeof payload.boundary.label !== "string"
  ) throw new Error("Malformed ChatGPT ready token");
  return { boundary: payload.boundary as TurnBoundary, digest: payload.digest };
}

export function parseBrowserReviewState(
  html: string,
  conversationUrl: string,
  boundary: TurnBoundary,
): BrowserReviewState {
  if (normalizeConversationUrl(conversationUrl) !== boundary.conversationUrl) {
    throw new Error("Refusing ChatGPT review poll: conversation URL changed");
  }

  const { document } = parseHTML(html);
  const turns = [...document.querySelectorAll("section[data-turn]")];
  const userIndex = turns.findLastIndex(turn => {
    if (turn.getAttribute("data-turn") !== "user") return false;
    const message = turn.querySelector('[data-message-author-role="user"]');
    if (!message) return false;
    return message.getAttribute("data-message-id") === boundary.userMessageId;
  });
  if (userIndex < 0) {
    return { requestObserved: false, responseObserved: false, responseComplete: false, generating: false, answer: "" };
  }

  const responseTurn = turns.slice(userIndex + 1).find(turn => turn.getAttribute("data-turn") === "assistant");
  const response = responseTurn?.querySelector('[data-message-author-role="assistant"]');
  const answer = response?.textContent?.trim() ?? "";
  const responseComplete = Boolean(responseTurn?.querySelector('[aria-label="Copy response"]'));
  const generating = Boolean(document.querySelector('[data-testid="stop-button"],[aria-label="Stop answering"]'));
  return {
    requestObserved: true,
    responseObserved: Boolean(response),
    responseComplete,
    generating,
    answer,
  };
}

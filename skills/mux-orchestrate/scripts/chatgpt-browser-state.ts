import { parseHTML } from "linkedom";

export interface RequestBoundary {
  kind: "request";
  requestId: string;
}

export interface AdoptionBoundary {
  kind: "adopt";
  conversationUrl: string;
  userMessageId: string;
}

export type ReviewBoundary = RequestBoundary | AdoptionBoundary;

export interface BrowserReviewState {
  requestObserved: boolean;
  responseObserved: boolean;
  responseComplete: boolean;
  generating: boolean;
  answer: string;
}

interface AdoptionTokenPayload {
  version: 1;
  conversationUrl: string;
  userMessageId: string;
}

function normalizeConversationUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`.replace(/\/$/, "");
}

export function encodeAdoptionToken(conversationUrl: string, userMessageId: string): string {
  const payload: AdoptionTokenPayload = {
    version: 1,
    conversationUrl: normalizeConversationUrl(conversationUrl),
    userMessageId,
  };
  return `ADOPT_TOKEN=${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

export function parseReviewBoundary(value: string): ReviewBoundary {
  if (value.startsWith("REQUEST_ID=")) {
    return { kind: "request", requestId: value };
  }
  if (!value.startsWith("ADOPT_TOKEN=")) {
    throw new Error(`Expected REQUEST_ID=<id> or ADOPT_TOKEN=<token>, got ${value}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(value.slice("ADOPT_TOKEN=".length), "base64url").toString("utf8"));
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
    kind: "adopt",
    conversationUrl: normalizeConversationUrl(payload.conversationUrl),
    userMessageId: payload.userMessageId,
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
  return encodeAdoptionToken(conversationUrl, messageId);
}

export function parseBrowserReviewState(
  html: string,
  conversationUrl: string,
  boundary: ReviewBoundary,
): BrowserReviewState {
  if (
    boundary.kind === "adopt" &&
    normalizeConversationUrl(conversationUrl) !== boundary.conversationUrl
  ) {
    throw new Error("Refusing adopted review poll: ChatGPT conversation URL changed");
  }

  const { document } = parseHTML(html);
  const turns = [...document.querySelectorAll("section[data-turn]")];
  const userIndex = turns.findLastIndex(turn => {
    if (turn.getAttribute("data-turn") !== "user") return false;
    const message = turn.querySelector('[data-message-author-role="user"]');
    if (!message) return false;
    return boundary.kind === "request"
      ? (message.textContent ?? "").includes(boundary.requestId)
      : message.getAttribute("data-message-id") === boundary.userMessageId;
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

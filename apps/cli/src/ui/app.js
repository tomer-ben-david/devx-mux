import { extractFindings, matchesAllTerms, queryTerms } from "./report-findings.js";
import { toRepoRelativePaths } from "./report-format.js";

const runList = document.getElementById("run-list");
const reportPane = document.getElementById("report");
const refreshButton = document.getElementById("refresh");
const findingSearch = document.getElementById("finding-search");

let selectedRunId;
/** The run detail on screen, re-rendered locally as the search query changes. */
let displayedRun;

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

refreshButton.addEventListener("click", () => {
  loadRuns();
});

findingSearch.addEventListener("input", () => {
  if (displayedRun !== undefined) renderRun(displayedRun);
});

loadRuns();

async function loadRuns() {
  try {
    const response = await fetch("/api/runs");
    if (!response.ok) throw new Error(`GET /api/runs responded ${response.status}`);
    const body = await response.json();
    renderRunList(body.runs);
    if (body.runs.length === 0) {
      showReportMessage("No review runs yet. Run `mux review` or `mux multireview`, then refresh.");
      return;
    }
    const keepSelection = body.runs.some((run) => run.id === selectedRunId);
    await selectRun(keepSelection ? selectedRunId : body.runs[0].id);
  } catch (error) {
    showReportMessage(`Could not load review runs: ${error.message}`);
  }
}

async function selectRun(runId) {
  selectedRunId = runId;
  markSelectedRun(runId);
  try {
    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
    if (!response.ok) throw new Error(`GET /api/runs responded ${response.status}`);
    displayedRun = await response.json();
    renderRun(displayedRun);
  } catch (error) {
    displayedRun = undefined;
    showReportMessage(`Could not load the review run: ${error.message}`);
  }
}

function renderRunList(runs) {
  const items = runs.map((run) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "run-item";
    item.dataset.runId = run.id;
    item.addEventListener("click", () => {
      selectRun(run.id);
    });

    const head = document.createElement("span");
    head.className = "run-head";
    const repo = document.createElement("span");
    repo.className = "run-repo";
    repo.textContent = run.repository;
    const scope = document.createElement("span");
    scope.className = "run-scope";
    scope.textContent = run.scope;
    head.append(repo, scope);

    const meta = document.createElement("span");
    meta.className = "run-meta";
    meta.textContent = run.reviewers.join(" · ");

    const time = document.createElement("span");
    time.className = "run-time";
    time.textContent = timeFormat.format(new Date(run.startedAt));

    item.append(head, meta, time);
    return item;
  });
  runList.replaceChildren(...items);
}

function markSelectedRun(runId) {
  for (const item of runList.children) {
    item.classList.toggle("selected", item.dataset.runId === runId);
  }
}

function renderRun(run) {
  const header = document.createElement("header");
  header.className = "report-header";
  const title = document.createElement("h2");
  title.textContent = `${run.repository} · ${run.scope}`;
  const subline = document.createElement("p");
  subline.className = "report-subline";
  subline.textContent = `${run.reviewers.join(" · ")} — ${timeFormat.format(new Date(run.startedAt))}`;
  header.append(title, subline);

  const terms = queryTerms(findingSearch.value);
  if (terms.length === 0) {
    const sections = run.reports.map((report) =>
      reportSection(report.provider, renderMarkdownBlocks(report.markdown, run.repository)));
    reportPane.replaceChildren(header, ...sections);
    return;
  }

  const filtered = filterFindings(run, terms);
  header.append(makeTextElement("p", `${filtered.matched} of ${filtered.total} findings match`, "filter-summary"));
  reportPane.replaceChildren(header, ...filtered.sections);
}

/**
 * Keeps the findings whose reviewer name and displayed text contain every
 * search term. A report without a Findings section cannot be filtered, and
 * says so instead of disappearing.
 */
function filterFindings(run, terms) {
  const sections = [];
  let total = 0;
  let matched = 0;
  for (const report of run.reports) {
    const findings = extractFindings(report.markdown);
    if (findings === undefined) {
      sections.push(reportSection(report.provider, [
        makeTextElement("p", "This report has no Findings section, so it cannot be filtered.", "unfilterable"),
      ]));
      continue;
    }
    const matches = findings.filter((finding) =>
      matchesAllTerms(`${report.provider}\n${toRepoRelativePaths(finding, run.repository)}`, terms));
    total += findings.length;
    matched += matches.length;
    if (matches.length === 0) continue;
    sections.push(reportSection(report.provider, matches.flatMap((finding) => renderMarkdownBlocks(finding, run.repository))));
  }
  return { sections, total, matched };
}

function reportSection(provider, children) {
  const section = document.createElement("section");
  section.className = `report-section provider-${provider.toLowerCase()}`;
  section.append(makeTextElement("p", provider, "provider-label"), ...children);
  return section;
}

function showReportMessage(message, className = "placeholder") {
  const notice = document.createElement("p");
  notice.className = className;
  notice.textContent = message;
  reportPane.replaceChildren(notice);
}

/**
 * Renders report Markdown into block elements. All content enters the DOM as
 * text nodes or textContent, so provider output can never inject markup. File
 * paths that point into the run's repository display repository-relative.
 */
function renderMarkdownBlocks(markdown, repository) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.startsWith("```")) {
      const fence = /^(?:`\{3,})(\S*)/.exec(line);
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      if (fence?.[1]) code.className = `language-${fence[1]}`;
      code.textContent = codeLines.join("\n");
      pre.append(code);
      blocks.push(pre);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 6);
      const element = document.createElement(`h${level}`);
      element.append(...renderInline(heading[2], repository));
      blocks.push(element);
      index += 1;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(document.createElement("hr"));
      index += 1;
      continue;
    }

    const tableHeader = splitTableRow(line);
    if (tableHeader !== undefined && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const cells = [];
      index += 2;
      while (index < lines.length) {
        const row = splitTableRow(lines[index]);
        if (row === undefined) break;
        cells.push(row);
        index += 1;
      }
      blocks.push(renderTable(tableHeader, cells, repository));
      continue;
    }

    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
      const rendered = renderList(lines, index, repository);
      blocks.push(rendered.element);
      index = rendered.nextIndex;
      continue;
    }

    if (line.startsWith(">")) {
      const quoted = [];
      index += 1;
      while (index < lines.length && lines[index].startsWith(">")) {
        quoted.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      const quote = document.createElement("blockquote");
      quote.append(...renderMarkdownBlocks(quoted.join("\n"), repository));
      blocks.push(quote);
      continue;
    }

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && isParagraphLine(lines[index])) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    const paragraph = document.createElement("p");
    paragraph.append(...renderInline(paragraphLines.join(" "), repository));
    blocks.push(paragraph);
  }

  return blocks;
}

function isParagraphLine(line) {
  return (
    line.trim() !== ""
    && !line.startsWith("```")
    && !/^(#{1,6})\s+/.test(line)
    && !/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)
    && !line.startsWith(">")
  );
}

function renderList(lines, startIndex, repository) {
  const container = document.createElement("div");
  const stack = [];

  let index = startIndex;
  while (index < lines.length) {
    const match = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[index]);
    if (match === null) break;
    const indent = match[1].length;
    const ordered = /\d/.test(match[2]);
    const content = match[3];

    while (stack.length > 0 && stack[stack.length - 1].indent > indent) stack.pop();
    if (stack.length === 0 || stack[stack.length - 1].indent < indent) {
      const list = document.createElement(ordered ? "ol" : "ul");
      // Markdown numbers an ordered list from its first item, so a filtered
      // finding keeps the number it has in the full report.
      if (ordered) list.start = Number.parseInt(match[2], 10);
      const parent = stack.length === 0
        ? container
        : stack[stack.length - 1].items.at(-1) ?? stack[stack.length - 1].element;
      parent.append(list);
      stack.push({ indent, element: list, items: [] });
    }

    const item = document.createElement("li");
    item.append(...renderInline(content, repository));
    const open = stack[stack.length - 1];
    open.element.append(item);
    open.items.push(item);
    index += 1;
  }

  return { element: container, nextIndex: index };
}

function renderTable(header, rows, repository) {
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const cell of header) {
    const th = document.createElement("th");
    th.append(...renderInline(cell, repository));
    headRow.append(th);
  }
  head.append(headRow);

  const body = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.append(...renderInline(cell, repository));
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(head, body);
  return table;
}

function splitTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return undefined;
  const withoutEdges = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells = withoutEdges.split("|").map((cell) => cell.trim());
  return cells.every((cell) => cell.length > 0) ? cells : undefined;
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells !== undefined && cells.every((cell) => /^:?-+:?$/.test(cell));
}

const INLINE_PATTERN = /(`+[^`]+`+)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\(((?:https?:\/\/|\/)[^)\s]+)\))/g;

function renderInline(text, repository) {
  const nodes = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const token = match[0];
    if (match.index > cursor) nodes.push(repoRelativeText(text.slice(cursor, match.index), repository));
    if (token.startsWith("`")) {
      nodes.push(makeTextElement("code", toRepoRelativePaths(token.slice(1, -1), repository)));
    } else if (token.startsWith("**")) {
      nodes.push(makeTextElement("strong", token.slice(2, -2)));
    } else if (token.startsWith("*")) {
      nodes.push(makeTextElement("em", token.slice(1, -1)));
    } else {
      nodes.push(...renderLink(token, match[5], repository));
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) nodes.push(repoRelativeText(text.slice(cursor), repository));
  return nodes;
}

/**
 * Web links stay anchors. Reports link local evidence as absolute checkout
 * paths, which cannot navigate anywhere useful from the page, so those show
 * the label followed by the repository-relative file reference instead.
 */
function renderLink(token, target, repository) {
  const label = token.slice(1, token.indexOf("]"));
  if (!target.startsWith("/")) {
    const link = document.createElement("a");
    link.href = target;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    return [link];
  }
  return [
    document.createTextNode(label),
    document.createTextNode(" "),
    makeTextElement("code", toRepoRelativePaths(target, repository)),
  ];
}

function repoRelativeText(content, repository) {
  return document.createTextNode(toRepoRelativePaths(content, repository));
}

function makeTextElement(tagName, content, className) {
  const element = document.createElement(tagName);
  element.textContent = content;
  if (className !== undefined) element.className = className;
  return element;
}

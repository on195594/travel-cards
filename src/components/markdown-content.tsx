import React from "react";

type InlineToken =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; text: string; url: string };

function tokenizeInlines(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const regex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    if (match[2] !== undefined && match[3] !== undefined) {
      tokens.push({ type: "link", text: match[2], url: match[3] });
    } else if (match[4] !== undefined) {
      tokens.push({ type: "bold", value: match[4] });
    } else if (match[5] !== undefined) {
      tokens.push({ type: "code", value: match[5] });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }

  return tokens;
}

export function renderInlines(text: string): React.ReactNode {
  const tokens = tokenizeInlines(text);
  if (tokens.length === 0) return null;
  if (tokens.length === 1 && tokens[0].type === "text") return tokens[0].value;

  return tokens.map((token, index) => {
    switch (token.type) {
      case "text":
        return <span key={index}>{token.value}</span>;
      case "bold":
        return <strong key={index}>{renderInlines(token.value)}</strong>;
      case "code":
        return <code key={index} className="inline-code">{token.value}</code>;
      case "link":
        return (
          <a
            key={index}
            className="inline-link"
            href={token.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {renderInlines(token.text)}
            <span aria-hidden="true" className="ext-icon">↗</span>
          </a>
        );
    }
  });
}

function parseTable(lines: string[]): {
  headers: string[];
  alignments: Array<"left" | "center" | "right">;
  rows: string[][];
} | null {
  if (lines.length < 2) return null;
  const headerLine = lines[0].trim();
  const sepLine = lines[1].trim();
  if (!headerLine.startsWith("|") || !sepLine.startsWith("|")) return null;
  if (!/^[|:\s-]+$/.test(sepLine)) return null;

  const splitRow = (line: string) => {
    const raw = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return raw.split("|").map((cell) => cell.trim());
  };

  const headers = splitRow(headerLine);
  const sepCells = splitRow(sepLine);
  if (headers.length === 0 || headers.length !== sepCells.length) return null;

  const alignments = sepCells.map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });

  const rows = lines.slice(2).map((line) => {
    const cells = splitRow(line);
    while (cells.length < headers.length) {
      cells.push("");
    }
    return cells.slice(0, headers.length);
  });
  return { headers, alignments, rows };
}

function isTableStart(lines: string[], index: number): boolean {
  if (index + 1 >= lines.length) return false;
  const header = lines[index].trim();
  const sep = lines[index + 1].trim();
  if (!header.startsWith("|") || !sep.startsWith("|")) return false;
  return /^[|:\s-]+$/.test(sep);
}

function isSpecialBlockStart(lines: string[], index: number): boolean {
  if (index >= lines.length) return false;
  const line = lines[index];
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^####\s+/.test(trimmed)) return true;
  if (/^\s*[-*]\s+/.test(line)) return true;
  if (/^\s*\d+\.\s+/.test(line)) return true;
  if (isTableStart(lines, index)) return true;
  return false;
}

function renderBlocks(lines: string[]): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Markdown Table
    if (isTableStart(lines, i)) {
      const tableLines: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith("|")) {
        tableLines.push(lines[j]);
        j++;
      }
      const tableData = parseTable(tableLines);
      if (tableData) {
        elements.push(
          <div className="table-wrapper" key={`table-${elements.length}`}>
            <table className="markdown-table">
              <thead>
                <tr>
                  {tableData.headers.map((h, colIdx) => (
                    <th key={colIdx} style={{ textAlign: tableData.alignments[colIdx] }}>
                      {renderInlines(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.rows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {row.map((cell, colIdx) => (
                      <td key={colIdx} style={{ textAlign: tableData.alignments[colIdx] }}>
                        {renderInlines(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        i = j;
        continue;
      }
      // If tableData is null (e.g. malformed header/sep mismatch), do not advance j;
      // fall through to paragraph/fallback so lines are rendered and i advances.
    }

    // Sub-headings (H4)
    const h4Match = trimmed.match(/^####\s+(.+)$/);
    if (h4Match) {
      elements.push(
        <h4 className="markdown-h4" key={`h4-${elements.length}`}>
          {renderInlines(h4Match[1])}
        </h4>
      );
      i++;
      continue;
    }

    // Lists (unordered)
    if (/^\s*[-*]\s+/.test(line)) {
      const listItems: Array<{ indent: number; text: string }> = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const itemMatch = lines[i].match(/^(\s*)[-*]\s+(.+)$/);
        if (itemMatch) {
          listItems.push({ indent: itemMatch[1].length, text: itemMatch[2] });
        }
        i++;
      }
      elements.push(
        <ul className="markdown-ul" key={`ul-${elements.length}`}>
          {listItems.map((item, itemIdx) => (
            <li
              key={itemIdx}
              className={`markdown-li ${item.indent >= 2 ? "nested-li" : ""}`}
            >
              {renderInlines(item.text)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Lists (ordered)
    if (/^\s*\d+\.\s+/.test(line)) {
      const listItems: Array<{ indent: number; text: string }> = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemMatch = lines[i].match(/^(\s*)\d+\.\s+(.+)$/);
        if (itemMatch) {
          listItems.push({ indent: itemMatch[1].length, text: itemMatch[2] });
        }
        i++;
      }
      elements.push(
        <ol className="markdown-ol" key={`ol-${elements.length}`}>
          {listItems.map((item, itemIdx) => (
            <li
              key={itemIdx}
              className={`markdown-li ${item.indent >= 2 ? "nested-li" : ""}`}
            >
              {renderInlines(item.text)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph & Fallback (guaranteed to advance i by at least 1)
    const paraLines: string[] = [];
    while (i < lines.length && !isSpecialBlockStart(lines, i)) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length === 0 && i < lines.length) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      elements.push(
        <p className="markdown-p" key={`p-${elements.length}`}>
          {paraLines.map((pLine, pIdx) => (
            <React.Fragment key={pIdx}>
              {renderInlines(pLine)}
              {pIdx < paraLines.length - 1 && <br />}
            </React.Fragment>
          ))}
        </p>
      );
    }
  }

  return elements;
}

export function MarkdownContent({ content, className = "" }: { content: string; className?: string }) {
  if (!content || !content.trim()) return null;

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const hasH3 = lines.some((l) => /^###\s+/.test(l.trim()));

  if (!hasH3) {
    return <div className={`markdown-body ${className}`}>{renderBlocks(lines)}</div>;
  }

  // Split into sub-sections by `### `
  const sections: Array<{ title?: string; lines: string[] }> = [];
  let currentTitle: string | undefined;
  let currentLines: string[] = [];

  for (const line of lines) {
    const h3Match = line.trim().match(/^###\s+(.+)$/);
    if (h3Match) {
      if (currentTitle !== undefined || currentLines.length > 0) {
        sections.push({ title: currentTitle, lines: currentLines });
      }
      currentTitle = h3Match[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentTitle !== undefined || currentLines.length > 0) {
    sections.push({ title: currentTitle, lines: currentLines });
  }

  return (
    <div className={`markdown-body ${className}`}>
      {sections.map((sec, idx) => {
        if (!sec.title) {
          // Introductory text before first H3
          return <div key={`intro-${idx}`}>{renderBlocks(sec.lines)}</div>;
        }
        return (
          <details className="sub-section-accordion" open key={`sec-${idx}`}>
            <summary className="sub-section-summary">
              <span className="summary-title">{renderInlines(sec.title)}</span>
              <span className="accordion-chevron" aria-hidden="true">▾</span>
            </summary>
            <div className="sub-section-content">{renderBlocks(sec.lines)}</div>
          </details>
        );
      })}
    </div>
  );
}

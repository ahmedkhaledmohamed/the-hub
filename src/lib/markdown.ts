import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

const marked = new Marked(
  markedHighlight({
    emptyLangClass: "hljs",
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  }),
);

export function renderMarkdown(content: string): string {
  return marked.parse(content) as string;
}

export function wrapInHtmlShell(body: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base target="_blank">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #121212; color: #e0e0e0; line-height: 1.7;
      max-width: 820px; margin: 0 auto; padding: 40px 32px;
    }
    a { color: #3b82f6; }
    a:hover { text-decoration: underline; }
    h1, h2, h3, h4 { color: #fff; margin-top: 1.5em; margin-bottom: 0.5em; }
    h1 { font-size: 1.75em; border-bottom: 1px solid #333; padding-bottom: 0.3em; }
    h2 { font-size: 1.4em; }
    pre { background: #1e1e1e; border: 1px solid #333; border-radius: 8px; padding: 16px; overflow-x: auto; }
    code { font-family: 'SF Mono', Consolas, monospace; font-size: 0.9em; }
    :not(pre) > code { background: #1e1e1e; padding: 2px 6px; border-radius: 4px; }
    blockquote { border-left: 3px solid #3b82f6; margin: 1em 0; padding: 0.5em 1em; color: #999; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #333; padding: 8px 12px; text-align: left; }
    th { background: #1e1e1e; font-weight: 600; }
    img { max-width: 100%; border-radius: 8px; }
    hr { border: none; border-top: 1px solid #333; margin: 2em 0; }
    ul, ol { padding-left: 1.5em; }
    li { margin: 0.3em 0; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

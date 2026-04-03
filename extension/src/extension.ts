import * as vscode from "vscode";

let currentPanel: vscode.WebviewPanel | undefined;

function getHubUrl(): string {
  return (
    vscode.workspace.getConfiguration("the-hub").get<string>("url") ||
    "http://localhost:9002"
  );
}

async function resolveUrl(): Promise<string> {
  const raw = getHubUrl();
  const resolved = await vscode.env.asExternalUri(vscode.Uri.parse(raw));
  return resolved.toString(true);
}

async function openHubTab(context: vscode.ExtensionContext) {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  const url = await resolveUrl();

  currentPanel = vscode.window.createWebviewPanel(
    "the-hub.editor",
    "Hub",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  currentPanel.iconPath = vscode.Uri.joinPath(
    context.extensionUri,
    "resources",
    "hub.svg",
  );

  currentPanel.webview.html = getIframeHtml(url);
  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  });
}

function getIframeHtml(url: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; frame-src * http: https:; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #121212; }
    iframe { border: none; width: 100%; height: 100%; }
    .fallback {
      display: none; position: absolute; inset: 0;
      flex-direction: column; align-items: center; justify-content: center;
      font-family: system-ui, sans-serif; color: #999; gap: 12px; text-align: center;
    }
    .fallback.visible { display: flex; }
    code { background: #1e1e1e; padding: 2px 8px; border-radius: 4px; font-size: 13px; }
    .fallback button {
      background: #3b82f6; color: #fff; border: none; padding: 8px 20px;
      border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px;
    }
  </style>
</head>
<body>
  <iframe id="hub" src="${url}" allow="same-origin"></iframe>
  <div class="fallback" id="err">
    <p>Could not load the hub at <code>${url}</code></p>
    <p style="font-size:13px">Make sure the server is running:</p>
    <code>cd ~/the-hub && npm start</code>
    <button onclick="document.getElementById('hub').src='${url}';this.parentElement.classList.remove('visible')">Retry</button>
  </div>
  <script>
    const iframe = document.getElementById('hub');
    let loaded = false;
    iframe.addEventListener('load', () => { loaded = true; });
    setTimeout(() => {
      if (!loaded) document.getElementById('err').classList.add('visible');
    }, 8000);
  </script>
</body>
</html>`;
}

async function checkServerStatus(): Promise<boolean> {
  const url = getHubUrl();
  try {
    const resp = await fetch(`${url}/api/manifest`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}

class HubPanelProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveWebviewView(view: vscode.WebviewView) {
    view.webview.options = { enableScripts: true };

    const ok = await checkServerStatus();
    const dotClass = ok ? "dot ok" : "dot err";
    const statusText = ok ? "Server running" : "Server not reachable";

    view.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 16px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
    h3 { margin: 0 0 6px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    p { font-size: 12px; color: var(--vscode-descriptionForeground); margin: 0 0 14px; line-height: 1.5; }
    button {
      width: 100%; padding: 8px 0; border: none; border-radius: 4px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .status { display: flex; align-items: center; gap: 6px; margin-bottom: 14px; font-size: 12px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot.ok { background: #3b82f6; }
    .dot.err { background: #e74c3c; }
    .shortcut { display: block; margin-top: 8px; font-size: 11px; color: var(--vscode-descriptionForeground); text-align: center; }
  </style>
</head>
<body>
  <h3>The Hub</h3>
  <div class="status">
    <span class="${dotClass}"></span>
    <span>${statusText}</span>
  </div>
  <p>Workspace artifacts, AI tools, and curated links.</p>
  <button onclick="vscode.postMessage({command:'open'})">Open Hub</button>
  <span class="shortcut">\u2318\u21e7H</span>
  <script>const vscode = acquireVsCodeApi();</script>
</body>
</html>`;

    view.webview.onDidReceiveMessage((msg) => {
      if (msg.command === "open") {
        openHubTab(this.context);
      }
    });
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("the-hub.open", () => openHubTab(context)),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "the-hub.panel",
      new HubPanelProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );
}

export function deactivate() {
  currentPanel?.dispose();
}

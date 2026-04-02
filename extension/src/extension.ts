import * as vscode from "vscode";

let currentPanel: vscode.WebviewPanel | undefined;

function getHubUrl(): string {
  return (
    vscode.workspace.getConfiguration("the-hub").get<string>("url") ||
    "https://ahmed-hub:9001"
  );
}

function openHubPanel(context: vscode.ExtensionContext) {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    "the-hub.panel",
    "Hub",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  currentPanel.iconPath = vscode.Uri.joinPath(
    context.extensionUri,
    "resources",
    "hub.svg",
  );

  currentPanel.webview.html = getFullPageHtml(getHubUrl());

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  });
}

function getFullPageHtml(url: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    iframe { border: none; width: 100%; height: 100%; }
    .error {
      display: none; position: absolute; inset: 0;
      flex-direction: column; align-items: center; justify-content: center;
      font-family: system-ui, sans-serif; color: #999; gap: 12px;
    }
    .error.visible { display: flex; }
    .error button {
      background: #1db954; color: #000; border: none; padding: 8px 20px;
      border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .error button:hover { background: #1ed760; }
  </style>
</head>
<body>
  <iframe id="hub" src="${url}"></iframe>
  <div class="error" id="err">
    <p>Could not reach the hub at <code>${url}</code></p>
    <p style="font-size:13px;color:#666">Make sure the server is running: <code>cd the-hub && npm start</code></p>
    <button onclick="location.reload()">Retry</button>
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

class HubPanelProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView) {
    view.webview.options = { enableScripts: true };
    const url = getHubUrl();
    view.webview.html = getFullPageHtml(url);
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("the-hub.open", () => {
      openHubPanel(context);
    }),
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

const { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { CONTENT_SECURITY_POLICY, resolveAppFile, isAppDocument, safeExternalUrl } = require('./security.cjs');
const { createOAuthBridge, isTrustedOAuthSender } = require('./oauth.cjs');

// A standard secure scheme gives IndexedDB a stable origin across app launches.
// Service workers are unnecessary here: the complete web build is bundled locally.
protocol.registerSchemesAsPrivileged([{
  scheme: 'pandr',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);
app.enableSandbox();
app.setName('PANDR-5');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
let mainWindow;
let externalPromptOpen = false;
const oauthBridge = createOAuthBridge({
  openExternal: url => shell.openExternal(url),
  onResult: result => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const contents = mainWindow.webContents;
    if (contents.isDestroyed() || !isAppDocument(contents.mainFrame.url)) return;
    contents.mainFrame.send('pandr:oauth:result', result);
    mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  },
});

function registerOAuthIPC() {
  for (const [channel, operation] of [
    ['pandr:oauth:prepare', () => oauthBridge.prepareOAuth()],
    ['pandr:oauth:open', value => oauthBridge.openOAuth(value)],
    ['pandr:oauth:cancel', () => oauthBridge.cancelOAuth()],
  ]) {
    ipcMain.handle(channel, (event, value) => {
      if (!isTrustedOAuthSender(event, mainWindow?.webContents)) throw new Error('Untrusted sign-in request.');
      return operation(value);
    });
  }
}

async function openExternalWithConfirmation(value) {
  const url = safeExternalUrl(value);
  if (!url || externalPromptOpen || !mainWindow || mainWindow.isDestroyed()) return;
  externalPromptOpen = true;
  try {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question', title: 'Open browser',
      message: `Open ${url.hostname} in your browser?`,
      detail: url.href,
      buttons: ['Cancel', 'Open browser'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (result.response === 1) await shell.openExternal(url.href);
  } finally {
    externalPromptOpen = false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 880, minWidth: 360, minHeight: 600,
    title: 'PANDR-5', backgroundColor: '#ffffff', show: false,
    icon: path.join(__dirname, '../dist/icons/icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
      navigateOnDragDrop: false, spellcheck: false,
    },
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppDocument(url)) {
      event.preventDefault();
      void openExternalWithConfirmation(url).catch(console.error);
    }
  });
  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!isAppDocument(url)) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalWithConfirmation(url).catch(console.error);
    return { action: 'deny' };
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    if (code !== -3) console.error(`PANDR-5 failed to load: ${description} (${code})`);
  });
  mainWindow.webContents.on('render-process-gone', () => { void oauthBridge.cancelOAuth(); });
  mainWindow.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) void oauthBridge.cancelOAuth();
  });
  mainWindow.on('closed', () => { mainWindow = null; void oauthBridge.cancelOAuth(); });
  void mainWindow.loadURL('pandr://app/');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.whenReady().then(() => {
    const root = path.join(__dirname, '../dist');
    protocol.handle('pandr', async (request) => {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      const file = resolveAppFile(request.url, root);
      if (!file) return new Response('Not found', { status: 404 });
      const contentType = mimeTypes[path.extname(file).toLowerCase()];
      if (!contentType) return new Response('Not found', { status: 404 });
      try {
        const body = await readFile(file);
        return new Response(request.method === 'HEAD' ? null : body, {
          headers: {
            'Content-Type': contentType,
            'Content-Security-Policy': CONTENT_SECURITY_POLICY,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-cache',
          },
        });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    registerOAuthIPC();
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
      { role: 'windowMenu' },
    ]));
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch((error) => {
    console.error(error);
    dialog.showErrorBox('PANDR-5 could not start', 'The installed app could not load. Reinstall the app package; your saved local data will remain in the app data folder.');
    app.quit();
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { void oauthBridge.cancelOAuth(); });
}

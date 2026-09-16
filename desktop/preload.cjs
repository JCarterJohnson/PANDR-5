const { contextBridge, ipcRenderer } = require('electron');

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('pandrDesktop', Object.freeze({
    prepareOAuth: () => ipcRenderer.invoke('pandr:oauth:prepare'),
    openOAuth: url => ipcRenderer.invoke('pandr:oauth:open', url),
    cancelOAuth: () => ipcRenderer.invoke('pandr:oauth:cancel'),
    onOAuthResult(handler) {
      if (typeof handler !== 'function') throw new TypeError('A sign-in result handler is required.');
      const listener = (_event, result) => {
        if (!result || typeof result !== 'object') return;
        const code = typeof result.code === 'string' && result.code.length > 0;
        const error = typeof result.error === 'string' && result.error.length > 0;
        if (code && result.error === undefined) handler({ code: result.code });
        else if (error && result.code === undefined) handler({ error: result.error });
      };
      ipcRenderer.on('pandr:oauth:result', listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        ipcRenderer.removeListener('pandr:oauth:result', listener);
      };
    },
  }));
}

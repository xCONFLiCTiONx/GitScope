const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('geminiResizeBridge', {
  start: () => ipcRenderer.send('gemini-sidebar-resize-start'),
  move: (deltaX) => ipcRenderer.send('gemini-sidebar-resize-delta', deltaX),
  end: () => ipcRenderer.send('gemini-sidebar-resize-end'),
});

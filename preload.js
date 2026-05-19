const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lumaAPI", {
  createProject: (project) => ipcRenderer.invoke("project:create", project)
});

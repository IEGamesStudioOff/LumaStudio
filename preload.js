const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lumaAPI", {
  createProject:     (project) => ipcRenderer.invoke("project:create", project),
  getCurrentProject: () => ipcRenderer.invoke("project:get-current"),
  importImage:       () => ipcRenderer.invoke("asset:import-image"),
  saveFrames:        (frames) => ipcRenderer.invoke("asset:save-frames", frames),
  saveFramePng:      (payload) => ipcRenderer.invoke("asset:save-frame-png", payload),
  writeLpk:          (payload) => ipcRenderer.invoke("pipeline:write-lpk", payload),
  saveAnimations:    (animations) => ipcRenderer.invoke("animation:save", animations),
  loadAnimations:    () => ipcRenderer.invoke("animation:load")
});

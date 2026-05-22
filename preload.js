const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lumaAPI", {
  createProject: (project) => ipcRenderer.invoke("project:create", project),
  openProject: () => ipcRenderer.invoke("project:open"),
  getCurrentProject: () => ipcRenderer.invoke("project:get-current"),
  importImage: () => ipcRenderer.invoke("asset:import-image"),
  importPortrait: () => ipcRenderer.invoke("portrait:import"),
  saveFrames: (frames) => ipcRenderer.invoke("asset:save-frames", frames),
  saveAnimations: (anims) => ipcRenderer.invoke("asset:save-animations", anims),
  saveTilesets: (tilesets) => ipcRenderer.invoke("tilesets:save", tilesets),
  saveLogic: (data) => ipcRenderer.invoke("logic:save-v05", data),
  saveMusic: (music) => ipcRenderer.invoke("music:save", music),
  saveNarrative: (data) => ipcRenderer.invoke("narrative:save", data),
  saveSceneData: (data) => ipcRenderer.invoke("scene:save-v08", data),
  scanDrives: () => ipcRenderer.invoke("build:scan-drives"),
  buildGame: (options) => ipcRenderer.invoke("build:game-v09", options),

  // Fermeture sécurisée : le renderer vérifie s'il y a des changements
  // non sauvegardés, puis demande au main process d'afficher Oui/Non.
  onAppCloseRequest: (callback) => {
    ipcRenderer.removeAllListeners("app:request-close");
    ipcRenderer.on("app:request-close", () => callback());
  },
  confirmSaveBeforeClose: () => ipcRenderer.invoke("app:confirm-save-before-close"),
  closeAfterSaveCheck: () => ipcRenderer.invoke("app:close-after-save-check")
});

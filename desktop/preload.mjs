import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("c3kDesktop", {
  ping: () => ipcRenderer.invoke("desktop:ping"),
  runtime: () => ipcRenderer.invoke("desktop:get-runtime"),
});

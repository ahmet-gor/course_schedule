import { contextBridge, ipcRenderer } from 'electron'
import type { RendererApi } from '@shared/api'

const api: RendererApi = {
  departments: {
    list: () => ipcRenderer.invoke('departments:list'),
    create: (data) => ipcRenderer.invoke('departments:create', data),
    update: (id, patch) => ipcRenderer.invoke('departments:update', id, patch),
    remove: (id) => ipcRenderer.invoke('departments:remove', id)
  },
  lessons: {
    list: () => ipcRenderer.invoke('lessons:list'),
    create: (data) => ipcRenderer.invoke('lessons:create', data),
    update: (id, patch) => ipcRenderer.invoke('lessons:update', id, patch),
    remove: (id) => ipcRenderer.invoke('lessons:remove', id)
  },
  teachers: {
    list: () => ipcRenderer.invoke('teachers:list'),
    create: (data) => ipcRenderer.invoke('teachers:create', data),
    update: (id, data) => ipcRenderer.invoke('teachers:update', id, data),
    remove: (id) => ipcRenderer.invoke('teachers:remove', id)
  },
  schedules: {
    list: () => ipcRenderer.invoke('schedules:list'),
    create: (name) => ipcRenderer.invoke('schedules:create', name),
    rename: (id, name) => ipcRenderer.invoke('schedules:rename', id, name),
    remove: (id) => ipcRenderer.invoke('schedules:remove', id)
  },
  entries: {
    create: (scheduleId, data) => ipcRenderer.invoke('entries:create', scheduleId, data),
    update: (id, patch) => ipcRenderer.invoke('entries:update', id, patch),
    remove: (id) => ipcRenderer.invoke('entries:remove', id)
  },
  schedule: {
    getData: (scheduleId) => ipcRenderer.invoke('schedule:getData', scheduleId),
    applyEntries: (scheduleId, assignments) => ipcRenderer.invoke('schedule:applyEntries', scheduleId, assignments),
    assignTeachers: (scheduleId, assignments) => ipcRenderer.invoke('schedule:assignTeachers', scheduleId, assignments)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch)
  },
  io: {
    exportJson: () => ipcRenderer.invoke('io:exportJson'),
    importJson: () => ipcRenderer.invoke('io:importJson'),
    exportExcel: (scheduleId) => ipcRenderer.invoke('io:exportExcel', scheduleId),
    exportCsv: (entity) => ipcRenderer.invoke('io:exportCsv', entity),
    importCsv: (entity, text) => ipcRenderer.invoke('io:importCsv', entity, text),
    seedSample: () => ipcRenderer.invoke('io:seedSample')
  },
  licensing: {
    getState: () => ipcRenderer.invoke('licensing:getState'),
    activate: (licenseKey) => ipcRenderer.invoke('licensing:activate', licenseKey),
    deactivate: () => ipcRenderer.invoke('licensing:deactivate'),
    refresh: () => ipcRenderer.invoke('licensing:refresh'),
    openStore: () => ipcRenderer.invoke('licensing:openStore')
  }
}

contextBridge.exposeInMainWorld('api', api)

import { contextBridge, ipcRenderer } from 'electron'
import type { RendererApi } from '@shared/api'

const api: RendererApi = {
  terms: {
    list: () => ipcRenderer.invoke('terms:list'),
    create: (name) => ipcRenderer.invoke('terms:create', name),
    update: (id, patch) => ipcRenderer.invoke('terms:update', id, patch),
    remove: (id) => ipcRenderer.invoke('terms:remove', id)
  },
  classes: {
    list: (termId) => ipcRenderer.invoke('classes:list', termId),
    create: (termId, data) => ipcRenderer.invoke('classes:create', termId, data),
    update: (id, data) => ipcRenderer.invoke('classes:update', id, data),
    remove: (id) => ipcRenderer.invoke('classes:remove', id)
  },
  subjects: {
    list: (termId) => ipcRenderer.invoke('subjects:list', termId),
    create: (termId, data) => ipcRenderer.invoke('subjects:create', termId, data),
    update: (id, data) => ipcRenderer.invoke('subjects:update', id, data),
    remove: (id) => ipcRenderer.invoke('subjects:remove', id)
  },
  teachers: {
    list: () => ipcRenderer.invoke('teachers:list'),
    create: (data) => ipcRenderer.invoke('teachers:create', data),
    update: (id, data) => ipcRenderer.invoke('teachers:update', id, data),
    remove: (id) => ipcRenderer.invoke('teachers:remove', id)
  },
  lessons: {
    list: (termId) => ipcRenderer.invoke('lessons:list', termId),
    create: (classId, data) => ipcRenderer.invoke('lessons:create', classId, data),
    update: (id, data) => ipcRenderer.invoke('lessons:update', id, data),
    setSchedule: (id, days, start, end) => ipcRenderer.invoke('lessons:setSchedule', id, days, start, end),
    remove: (id) => ipcRenderer.invoke('lessons:remove', id)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch)
  },
  overrides: {
    create: (data) => ipcRenderer.invoke('overrides:create', data),
    update: (id, patch) => ipcRenderer.invoke('overrides:update', id, patch),
    remove: (id) => ipcRenderer.invoke('overrides:remove', id),
    resetWeek: (termId, week, lessonId) => ipcRenderer.invoke('overrides:resetWeek', termId, week, lessonId)
  },
  schedule: {
    getData: (termId) => ipcRenderer.invoke('schedule:getData', termId),
    applyClasses: (termId, assignments) => ipcRenderer.invoke('schedule:applyClasses', termId, assignments),
    assignTeachers: (termId, assignments) => ipcRenderer.invoke('schedule:assignTeachers', termId, assignments),
    unschedule: (lessonIds) => ipcRenderer.invoke('schedule:unschedule', lessonIds)
  },
  io: {
    exportJson: (termId) => ipcRenderer.invoke('io:exportJson', termId),
    importJson: () => ipcRenderer.invoke('io:importJson'),
    exportExcel: (termId, scope, week) => ipcRenderer.invoke('io:exportExcel', termId, scope, week),
    exportCsv: (entity, termId) => ipcRenderer.invoke('io:exportCsv', entity, termId),
    importCsv: (entity, text, termId) => ipcRenderer.invoke('io:importCsv', entity, text, termId),
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

import { contextBridge, ipcRenderer } from 'electron'
import type { RendererApi } from '@shared/api'

const api: RendererApi = {
  terms: {
    list: () => ipcRenderer.invoke('terms:list'),
    create: (name) => ipcRenderer.invoke('terms:create', name),
    update: (id, patch) => ipcRenderer.invoke('terms:update', id, patch),
    remove: (id) => ipcRenderer.invoke('terms:remove', id)
  },
  courses: {
    list: (termId) => ipcRenderer.invoke('courses:list', termId),
    create: (termId, data) => ipcRenderer.invoke('courses:create', termId, data),
    update: (id, data) => ipcRenderer.invoke('courses:update', id, data),
    remove: (id) => ipcRenderer.invoke('courses:remove', id)
  },
  instructors: {
    list: () => ipcRenderer.invoke('instructors:list'),
    create: (data) => ipcRenderer.invoke('instructors:create', data),
    update: (id, data) => ipcRenderer.invoke('instructors:update', id, data),
    remove: (id) => ipcRenderer.invoke('instructors:remove', id)
  },
  rooms: {
    list: () => ipcRenderer.invoke('rooms:list'),
    create: (data) => ipcRenderer.invoke('rooms:create', data),
    update: (id, data) => ipcRenderer.invoke('rooms:update', id, data),
    remove: (id) => ipcRenderer.invoke('rooms:remove', id)
  },
  sections: {
    list: (termId) => ipcRenderer.invoke('sections:list', termId),
    create: (courseId, data) => ipcRenderer.invoke('sections:create', courseId, data),
    update: (id, data) => ipcRenderer.invoke('sections:update', id, data),
    setMeetings: (id, meetings) => ipcRenderer.invoke('sections:setMeetings', id, meetings),
    remove: (id) => ipcRenderer.invoke('sections:remove', id)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch)
  },
  overrides: {
    create: (data) => ipcRenderer.invoke('overrides:create', data),
    update: (id, patch) => ipcRenderer.invoke('overrides:update', id, patch),
    remove: (id) => ipcRenderer.invoke('overrides:remove', id),
    resetWeek: (termId, week, sectionId) => ipcRenderer.invoke('overrides:resetWeek', termId, week, sectionId)
  },
  schedule: {
    getData: (termId) => ipcRenderer.invoke('schedule:getData', termId),
    apply: (termId, assignments) => ipcRenderer.invoke('schedule:apply', termId, assignments),
    resolveWeek: (termId, week, assignments) => ipcRenderer.invoke('schedule:resolveWeek', termId, week, assignments),
    unschedule: (sectionIds) => ipcRenderer.invoke('schedule:unschedule', sectionIds)
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

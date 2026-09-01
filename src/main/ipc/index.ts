import { registerCatalogIpc } from './catalog'
import { registerScheduleIpc } from './schedule'
import { registerIoIpc } from './io'

export function registerIpc(): void {
  registerCatalogIpc()
  registerScheduleIpc()
  registerIoIpc()
}

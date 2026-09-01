import { createHash } from 'crypto'
import { cpus, hostname, networkInterfaces } from 'os'

export function machineFingerprint(): string {
  const macs = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && !n.internal && n.mac !== '00:00:00:00:00:00')
    .map((n) => n!.mac)
    .sort()
    .join(',')
  const raw = `${hostname()}|${macs}|${cpus()[0]?.model ?? ''}|${process.platform}`
  return createHash('sha256').update(raw).digest('hex')
}

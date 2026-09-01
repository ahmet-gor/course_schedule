const { join } = require('path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const exePath = join(context.appOutDir, 'course-scheduler.exe')
  await flipFuses(exePath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    resetAdHocDarwinSignature: false
  })
  console.log(`[fuses] hardened ${exePath}`)
}

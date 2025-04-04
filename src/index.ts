import * as core from '@actions/core'
import * as toolCache from '@actions/tool-cache'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import path from 'node:path'
import { mkdir, symlink, chmod } from 'fs/promises'
import { existsSync } from 'fs'

const doExec = promisify(exec)

const platformMappings = {
  darwin: 'darwin',
  linux: 'unknown-linux-gnu',
  win32: 'pc-windows-msvc'
}

const archMappings = {
  arm64: 'aarch64',
  x64: 'x86_64'
}

function getArch() {
  const arch = os.arch()
  for (const [nodeArch, rustArch] of Object.entries(archMappings)) {
    if (nodeArch === arch) {
      return rustArch
    }
  }
  throw new Error(
    `Unsupported arch: ${arch}. We currently only support: ${Object.keys(
      archMappings
    ).join(', ')}`
  )
}

function getPlatform() {
  const platform = os.platform()
  for (const [nodePlatform, rustPlatform] of Object.entries(platformMappings)) {
    if (nodePlatform === platform) {
      return rustPlatform
    }
  }
  throw new Error(
    `Unsupported platform: ${platform}. We currently only support: ${Object.keys(
      platformMappings
    ).join(', ')}`
  )
}

function getFileName(): string {
  const platform = getPlatform()
  const arch = getArch()

  return `postgrestools_${arch}-${platform}`
}

function getDownloadUrl(version: string): string {
  const filename = getFileName()

  if (version.toLowerCase() === 'latest') {
    return `https://github.com/supabase-community/postgres_lsp/releases/latest/download/${filename}`
  } else {
    return `https://github.com/supabase-community/postgres_lsp/releases/download/${version}/${filename}`
  }
}

async function determineInstalledVersion(): Promise<string> {
  const { stdout } = await doExec(`postgrestools --version`)

  const version = stdout.trim()
  if (!version) {
    throw new Error('Could not determine installed PostgresTools version')
  }

  return version
}

async function main() {
  try {
    const version = core.getInput('version', { required: true })

    const url = getDownloadUrl(version)

    const tool = await toolCache.downloadTool(url)

    await chmod(tool, '755')

    const binDir = path.join(process.env.HOME!, 'bin')
    if (!existsSync(binDir)) {
      core.info(`Binary dir not found. Creating one at ${binDir}`)
      await mkdir(binDir, { recursive: true })
    }

    const symlinkPath = path.join(binDir, 'postgrestools')
    await symlink(tool, symlinkPath)

    core.info(`Adding to path: ${binDir}`)
    core.addPath(binDir)

    /**
     * TODO: GH Runner still won't find the `postgrestools` binary
     * The `tool` binary path works, however – seems to be something with symlink?
     */
    const installedVersion = await determineInstalledVersion()
    core.setOutput('installed-version', installedVersion)
  } catch (err) {
    if (err instanceof Error) {
      core.setFailed(err.message)
    }
  }
}
main().then(() => process.exit(0))

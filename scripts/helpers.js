const fs = require("fs")
const path = require("path")

const SEPOLIA_CHAIN_ID = 11155111
const LOCAL_CHAIN_IDS = new Set([31337, 1337])
const CONFIG_PATH = path.resolve(__dirname, "../src/config.json")

const TOKEN_CONFIGS = [
  { name: "Mirian Token", symbol: "MRN", totalSupply: "10000000", configKey: "mirian" },
  { name: "Castar Token", symbol: "CSTR", totalSupply: "10000000", configKey: "castar" },
  { name: "Tharni Token", symbol: "TRN", totalSupply: "10000000", configKey: "tharni" },
  { name: "Silver Pony", symbol: "PONY", totalSupply: "10000000", configKey: "pony" },
  { name: "Silver Penny", symbol: "PENNY", totalSupply: "10000000", configKey: "penny" },
  { name: "Brass Coin", symbol: "BRASS", totalSupply: "10000000", configKey: "brass" },
  { name: "Copper Coin", symbol: "COP", totalSupply: "10000000", configKey: "copper" }
]

function loadEnvFile() {
  const envPath = path.resolve(__dirname, "../.env")
  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue

    const key = match[1]
    if (process.env[key] !== undefined) continue

    let value = match[2].trim()
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

function getSepoliaRpcUrl() {
  return process.env.SEPOLIA_RPC_URL || process.env.REACT_APP_SEPOLIA_RPC_URL
}

function getSepoliaPrivateKey() {
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY || process.env.PRIVATE_KEY
  if (!privateKey) return undefined
  return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
}

function normalizeChainId(chainId) {
  return Number(chainId)
}

function isLocalChain(chainId) {
  return LOCAL_CHAIN_IDS.has(normalizeChainId(chainId))
}

function confirmationsFor(chainId) {
  const raw = process.env.TX_CONFIRMATIONS
  if (raw !== undefined) {
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error("TX_CONFIRMATIONS must be a positive integer")
    }
    return parsed
  }

  return isLocalChain(chainId) ? 1 : 2
}

async function waitForTransaction(tx, chainId) {
  return tx.wait(confirmationsFor(chainId))
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {}

  const rawData = fs.readFileSync(CONFIG_PATH, "utf8")
  if (rawData.trim().length === 0) return {}

  return JSON.parse(rawData)
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8")
}

function getNetworkConfig(config, chainId) {
  const networkKey = normalizeChainId(chainId).toString()
  if (config[networkKey]) {
    return { networkKey, data: config[networkKey] }
  }

  if (isLocalChain(chainId)) {
    if (config["31337"]) return { networkKey: "31337", data: config["31337"] }
    if (config["1337"]) return { networkKey: "1337", data: config["1337"] }
  }

  throw new Error(
    `Network key "${networkKey}" was not found in src/config.json. Run scripts/deploy.js on this network first.`
  )
}

function getPositiveIntegerEnv(name, defaultValue) {
  const raw = process.env[name]
  if (raw === undefined || raw === "") return defaultValue

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }

  return parsed
}

function getBasisPointsEnv(name, defaultValue) {
  const value = getPositiveIntegerEnv(name, defaultValue)
  if (value > 10000) {
    throw new Error(`${name} cannot be greater than 10000`)
  }

  return value
}

function isAlreadyInitializedError(error) {
  const message = error && error.message ? error.message : ""
  return message.includes("Pool already registered")
}

module.exports = {
  CONFIG_PATH,
  LOCAL_CHAIN_IDS,
  SEPOLIA_CHAIN_ID,
  TOKEN_CONFIGS,
  confirmationsFor,
  getBasisPointsEnv,
  getNetworkConfig,
  getPositiveIntegerEnv,
  getSepoliaPrivateKey,
  getSepoliaRpcUrl,
  isAlreadyInitializedError,
  isLocalChain,
  loadConfig,
  loadEnvFile,
  normalizeChainId,
  saveConfig,
  waitForTransaction
}

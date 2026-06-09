require("@nomicfoundation/hardhat-toolbox");

const {
  SEPOLIA_CHAIN_ID,
  getSepoliaPrivateKey,
  getSepoliaRpcUrl,
  loadEnvFile
} = require("./scripts/helpers")

loadEnvFile()

const sepoliaRpcUrl = getSepoliaRpcUrl()
const sepoliaPrivateKey = getSepoliaPrivateKey()
const networkFlagIndex = process.argv.indexOf("--network")
const networkEqualsArg = process.argv.find((arg) => arg.startsWith("--network="))
const selectedNetwork = networkEqualsArg
  ? networkEqualsArg.split("=")[1]
  : networkFlagIndex >= 0
    ? process.argv[networkFlagIndex + 1]
    : undefined

if (selectedNetwork === "sepolia") {
  if (!sepoliaRpcUrl) {
    throw new Error("Missing SEPOLIA_RPC_URL in your environment or .env file")
  }

  if (!sepoliaPrivateKey) {
    throw new Error("Missing SEPOLIA_PRIVATE_KEY or PRIVATE_KEY in your environment or .env file")
  }
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      evmVersion: "paris",
    },

  },
  networks: {
    sepolia: {
      url: sepoliaRpcUrl || "http://127.0.0.1:8545",
      chainId: SEPOLIA_CHAIN_ID,
      accounts: sepoliaPrivateKey ? [sepoliaPrivateKey] : []
    }
  }
}; 

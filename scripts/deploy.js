const hre = require("hardhat")

const {
  CONFIG_PATH,
  SEPOLIA_CHAIN_ID,
  TOKEN_CONFIGS,
  confirmationsFor,
  loadConfig,
  normalizeChainId,
  saveConfig,
  waitForTransaction
} = require("./helpers")

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  if (!deployer) {
    throw new Error("No deployer signer was found. Check your network account configuration.")
  }

  const network = await hre.ethers.provider.getNetwork()
  const chainId = normalizeChainId(network.chainId)
  const networkKey = chainId.toString()
  const confirmations = confirmationsFor(chainId)

  if (hre.network.name === "sepolia" && chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(`Expected Sepolia chain ID ${SEPOLIA_CHAIN_ID}, but connected to ${chainId}`)
  }

  const balance = await deployer.getBalance()

  console.log(`Connected to ${hre.network.name} chain ID: ${chainId}`)
  console.log(`Deployer: ${deployer.address}`)
  console.log(`Deployer balance: ${hre.ethers.utils.formatEther(balance)} ETH`)
  console.log(`Transaction confirmations: ${confirmations}\n`)

  const Token = await hre.ethers.getContractFactory("Token")
  const networkData = {}
  const deployedTokenAddresses = []

  console.log("Starting token deployment...\n")

  for (const item of TOKEN_CONFIGS) {
    const token = await Token.deploy(
      item.name,
      item.symbol,
      item.totalSupply
    )
    const receipt = await waitForTransaction(token.deployTransaction, chainId)

    console.log(`${item.name} (${item.symbol}) deployed to: ${token.address}`)
    console.log(`   Deployment block: ${receipt.blockNumber}`)

    networkData[item.configKey] = {
      address: token.address,
      deploymentBlock: receipt.blockNumber
    }
    deployedTokenAddresses.push(token.address)
  }

  console.log("\nAll tokens deployed. Deploying NMN...\n")

  const NMN = await hre.ethers.getContractFactory("NMN")
  const nmn = await NMN.deploy(deployedTokenAddresses)
  const nmnReceipt = await waitForTransaction(nmn.deployTransaction, chainId)

  console.log("============================================================")
  console.log(`NMN deployed to: ${nmn.address}`)
  console.log(`Deployment block: ${nmnReceipt.blockNumber}`)
  console.log("============================================================\n")

  networkData.nmn = {
    address: nmn.address,
    deploymentBlock: nmnReceipt.blockNumber,
    deployBlock: nmnReceipt.blockNumber
  }

  const currentConfig = loadConfig()
  currentConfig[networkKey] = networkData
  saveConfig(currentConfig)

  console.log(`Configuration saved to: ${CONFIG_PATH}`)
  console.log(`Network config key: ${networkKey}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

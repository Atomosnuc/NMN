const hre = require("hardhat")

const {
  TOKEN_CONFIGS,
  getBasisPointsEnv,
  getNetworkConfig,
  getPositiveIntegerEnv,
  isAlreadyInitializedError,
  isLocalChain,
  loadConfig,
  normalizeChainId,
  waitForTransaction
} = require("./helpers")

const TOKEN_NAMES = TOKEN_CONFIGS.map((token) => token.name)
const TARGET_POOL_AMOUNTS = [1000, 1000, 4000, 1000, 4000, 64000, 256000]

function tokens(n) {
  return hre.ethers.utils.parseUnits(n.toString(), "ether")
}

function scaledTokens(n, basisPoints) {
  return tokens(n).mul(basisPoints).div(10000)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureMaxApproval(token, owner, spender, chainId) {
  const currentAllowance = await token.allowance(owner.address, spender)
  const maxAllowance = hre.ethers.constants.MaxUint256

  if (currentAllowance.gt(maxAllowance.div(2))) {
    return
  }

  const tx = await token.connect(owner).approve(spender, maxAllowance)
  await waitForTransaction(tx, chainId)
  console.log(`  Approved ${await token.symbol()} for NMN`)
}

async function loadContracts(networkConfig) {
  const tokenList = []

  for (const tokenConfig of TOKEN_CONFIGS) {
    const entry = networkConfig[tokenConfig.configKey]
    if (!entry || !entry.address) {
      throw new Error(`Missing ${tokenConfig.configKey} address in src/config.json`)
    }

    const token = await hre.ethers.getContractAt("Token", entry.address)
    tokenList.push(token)
    console.log(`  ${tokenConfig.name}: ${token.address}`)
  }

  if (!networkConfig.nmn || !networkConfig.nmn.address) {
    throw new Error("Missing NMN address in src/config.json")
  }

  const nmn = await hre.ethers.getContractAt("NMN", networkConfig.nmn.address)
  console.log(`  NMN: ${nmn.address}`)

  return { tokenList, nmn }
}

async function distributeLocalTokens(tokenList, deployer, investors, chainId) {
  if (investors.length === 0) return

  console.log("\nDistributing mock tokens to local investor accounts...")
  const distributeAmount = tokens(100)

  for (const token of tokenList) {
    for (const investor of investors) {
      const tx = await token.connect(deployer).transfer(investor.address, distributeAmount)
      await waitForTransaction(tx, chainId)
    }
  }
}

async function initializePools(nmn, deployer, tokenList, chainId) {
  console.log("\nInitializing NMN pools...")

  for (let i = 0; i < tokenList.length; i++) {
    for (let j = i + 1; j < tokenList.length; j++) {
      try {
        const tx = await nmn.connect(deployer).initializePool(i, j)
        await waitForTransaction(tx, chainId)
        console.log(`  Initialized: ${TOKEN_NAMES[i]} <-> ${TOKEN_NAMES[j]}`)
      } catch (error) {
        if (!isAlreadyInitializedError(error)) {
          throw error
        }

        console.log(`  Already initialized: ${TOKEN_NAMES[i]} <-> ${TOKEN_NAMES[j]}`)
      }
    }
  }
}

async function seedLiquidity(nmn, deployer, tokenList, chainId, liquidityBasisPoints) {
  console.log("\nAdding liquidity to empty pools...")

  for (let i = 0; i < tokenList.length; i++) {
    for (let j = i + 1; j < tokenList.length; j++) {
      const pool = await nmn.getPoolState(i, j)

      if (pool.totalShares.gt(0)) {
        console.log(`  Skipped existing liquidity: ${TOKEN_NAMES[i]} <-> ${TOKEN_NAMES[j]}`)
        continue
      }

      const amount0 = scaledTokens(TARGET_POOL_AMOUNTS[i], liquidityBasisPoints)
      const amount1 = scaledTokens(TARGET_POOL_AMOUNTS[j], liquidityBasisPoints)

      const tx = await nmn.connect(deployer).addLiquidity(i, amount0, j, amount1)
      await waitForTransaction(tx, chainId)
      console.log(`  Seeded: ${TOKEN_NAMES[i]} <-> ${TOKEN_NAMES[j]}`)
    }
  }
}

async function simulateSwaps(nmn, deployer, tokenList, chainId, liquidityBasisPoints, swapsPerPool, txDelayMs) {
  if (swapsPerPool === 0) {
    console.log("\nSwap simulation skipped. Set SEED_SWAPS_PER_POOL to enable it.")
    return
  }

  console.log(`\nRunning ${swapsPerPool} swap simulation transaction(s) per pool...`)

  for (let i = 0; i < tokenList.length; i++) {
    for (let j = i + 1; j < tokenList.length; j++) {
      console.log(`  Pool: ${TOKEN_NAMES[i]} <-> ${TOKEN_NAMES[j]}`)

      for (let s = 0; s < swapsPerPool; s++) {
        const direction = Math.random() < 0.5
        const coinIndexIn = direction ? i : j
        const coinIndexOut = direction ? j : i
        const baseAmount = TARGET_POOL_AMOUNTS[coinIndexIn] * (liquidityBasisPoints / 10000)
        const randomPercent = Math.random() * (0.022 - 0.002) + 0.002
        const swapAmountValue = baseAmount * randomPercent
        const parsedAmountIn = hre.ethers.utils.parseUnits(swapAmountValue.toFixed(6), "ether")

        if (parsedAmountIn.eq(0)) {
          console.log(`    Trade ${s + 1} skipped: amount rounded to zero`)
          continue
        }

        try {
          const swapTx = await nmn.connect(deployer).swap(coinIndexIn, coinIndexOut, parsedAmountIn)
          await waitForTransaction(swapTx, chainId)
          console.log(
            `    Trade ${s + 1}: swapped ${swapAmountValue.toFixed(4)} ${TOKEN_NAMES[coinIndexIn]}`
          )

          if (isLocalChain(chainId)) {
            await hre.ethers.provider.send("evm_mine", [])
          } else if (txDelayMs > 0) {
            await sleep(txDelayMs)
          }
        } catch (error) {
          console.log(`    Trade ${s + 1} skipped: ${error.message}`)
        }
      }
    }
  }
}

async function main() {
  const signers = await hre.ethers.getSigners()
  const deployer = signers[0]

  if (!deployer) {
    throw new Error("No deployer signer was found. Check your network account configuration.")
  }

  const network = await hre.ethers.provider.getNetwork()
  const chainId = normalizeChainId(network.chainId)
  const isLocalhost = isLocalChain(chainId)
  const liquidityBasisPoints = getBasisPointsEnv("SEED_LIQUIDITY_BPS", 10000)

  if (liquidityBasisPoints === 0) {
    throw new Error("SEED_LIQUIDITY_BPS must be greater than zero")
  }

  const swapsPerPool = getPositiveIntegerEnv("SEED_SWAPS_PER_POOL", isLocalhost ? 6 : 0)
  const txDelayMs = getPositiveIntegerEnv("SEED_TX_DELAY_MS", isLocalhost ? 0 : 1500)
  const { networkKey, data: networkConfig } = getNetworkConfig(loadConfig(), chainId)
  const investors = isLocalhost ? signers.slice(1, 5).filter(Boolean) : []

  console.log(`Connected to ${hre.network.name} chain ID: ${chainId}`)
  console.log(`Config network key: ${networkKey}`)
  console.log(`Deployer: ${deployer.address}`)
  console.log(`Liquidity scale: ${liquidityBasisPoints / 100}%`)
  console.log(`Swaps per pool: ${swapsPerPool}`)

  if (!isLocalhost) {
    console.log("Live network mode: using deployer only.")
  }

  console.log("\nLoading deployed contracts from src/config.json...")
  const { tokenList, nmn } = await loadContracts(networkConfig)

  await distributeLocalTokens(tokenList, deployer, investors, chainId)

  console.log("\nApproving tokens to NMN contract...")
  for (const token of tokenList) {
    await ensureMaxApproval(token, deployer, nmn.address, chainId)
  }

  await initializePools(nmn, deployer, tokenList, chainId)
  await seedLiquidity(nmn, deployer, tokenList, chainId, liquidityBasisPoints)
  await simulateSwaps(nmn, deployer, tokenList, chainId, liquidityBasisPoints, swapsPerPool, txDelayMs)

  console.log("\n============================================================")
  console.log(`Seed script completed for network key: ${networkKey}`)
  console.log("============================================================\n")
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { main }

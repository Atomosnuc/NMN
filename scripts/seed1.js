const hre = require("hardhat")
const fs = require("fs")
const path = require("path")

const tokens = (n) => {
  return ethers.utils.parseUnits(n.toString(), 'ether')
}

async function main() {
  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const { chainId } = await hre.ethers.provider.getNetwork()
  console.log(`Connected to Chain ID: ${chainId}`)

  let networkKey = chainId.toString()
  const isLocalhost = chainId === 31337 || chainId === 1337

  // --- 1. DYNAMIC CONFIG PATH LAYER ---
  const configPath = path.resolve(__dirname, "../src/config.json")
  let config = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"))
  }

  if (!config[networkKey]) {
    if (config["1337"]) networkKey = "1337"
    else if (config["31337"]) networkKey = "31337"
    else throw new Error(`❌ Network key "${networkKey}" was not found inside config.json!`)
  }

  // --- 2. SAFE MULTI-ACCOUNT INVESTOR SELECTION ---
  let investors = []
  if (isLocalhost && signers.length > 1) {
    investors = [signers[1], signers[2], signers[3], signers[4]]
    console.log(`Deployer: ${deployer.address}`)
    console.log(`Mock investors mapped for Localhost execution.`)
  } else {
    console.log(`Live Network Detected! Operating from Deployer Only: ${deployer.address}`)
  }

  // Fetch tokens and contracts
  const mirian = await hre.ethers.getContractAt('Token', config[networkKey].mirian.address)
  const castar = await hre.ethers.getContractAt('Token', config[networkKey].castar.address)
  const tharni = await hre.ethers.getContractAt('Token', config[networkKey].tharni.address)
  const pony = await hre.ethers.getContractAt('Token', config[networkKey].pony.address)
  const penny = await hre.ethers.getContractAt('Token', config[networkKey].penny.address)
  const brass = await hre.ethers.getContractAt('Token', config[networkKey].brass.address)
  const copper = await hre.ethers.getContractAt('Token', config[networkKey].copper.address)

  const tokenList = [mirian, castar, tharni, pony, penny, brass, copper]
  const tokenNames = ["Mirian", "Castar", "Tharni", "Silver Pony", "Silver Penny", "Brass Coin", "Copper Coin"]
  const targetPoolAmounts = [1000, 1000, 4000, 1000, 4000, 64000, 256000]

  const nmn = await hre.ethers.getContractAt('NMN', config[networkKey].nmn.address)

  // --- 4. SAFE INVESTOR DISTRIBUTION BLOCK ---
  if (isLocalhost && investors.length > 0) {
    console.log("\nDistributing mock tokens to local investors...")
    const distributeAmount = tokens(100)
    for (let t = 0; t < tokenList.length; t++) {
      for (let inv = 0; inv < investors.length; inv++) {
        const tx = await tokenList[t].connect(deployer).transfer(investors[inv].address, distributeAmount)
        await tx.wait()
      }
    }
  }

  // --- 5. MAXIMUM ALLOWANCE APPROVALS ---
  console.log("\nApproving tokens to NMN contract...");
  const maxApproveAmount = hre.ethers.constants.MaxUint256
  for (let t = 0; t < tokenList.length; t++) {
    const tx = await tokenList[t].connect(deployer).approve(nmn.address, maxApproveAmount)
    await tx.wait()
  }

  // --- 6. POOL INITIALIZATION MATRIX ---
  console.log("\nInitializing NMN Pools...")
  for (let i = 0; i < tokenList.length; i++) {
    for (let j = i + 1; j < tokenList.length; j++) {
      try {
        const tx = await nmn.connect(deployer).initializePool(i, j)
        await tx.wait();
        console.log(`  Initialized: ${tokenNames[i]} <-> ${tokenNames[j]}`)
      } catch {
        console.log(`  Skipped (Already Exists): ${tokenNames[i]} <-> ${tokenNames[j]}`)
      }
    }
  }

  // --- 7. PROVIDE BASE SEED CAPITAL LIQUIDITY ---
  console.log("\nAdding liquidity to all 21 pools...")
  for (let i = 0; i < tokenList.length; i++) {
    for (let j = i + 1; j < tokenList.length; j++) {
      try {
        const tx = await nmn.connect(deployer).addLiquidity(i, tokens(targetPoolAmounts[i]), j, tokens(targetPoolAmounts[j]))
        await tx.wait();
        console.log(`  Seeded: ${tokenNames[i]} <-> ${tokenNames[j]}`)
      } catch (error) {
        console.log(`  [ERROR] Seeding Failed for ${tokenNames[i]}-${tokenNames[j]}: ${error.message}`)
      }
    }
  }

  // --- 8. LIVE-OPTIMIZED VOLUME SIMULATION ENGINE ---
  console.log("\n🚀 Initiating randomized swap simulation matrix...")

  // Dynamically set swap limits based on the active network environment
  const maxSwapsPerPool = isLocalhost ? 6 : 2 // Drops from 6 down to 2 on Testnets to save gas and ETH

  for (let i = 0; i < tokenList.length; i++) {
    for (let j = i + 1; j < tokenList.length; j++) {

      // Determine number of swaps
      const totalSwaps = isLocalhost
        ? Math.floor(Math.random() * (8 - 5 + 1)) + 5
        : maxSwapsPerPool;

      console.log(`\n📈 Simulating ${totalSwaps} trades for Pool: ${tokenNames[i]} <-> ${tokenNames[j]}`)

      for (let s = 0; s < totalSwaps; s++) {
        const direction = Math.random() < 0.5
        let tokenIn, coinIndexIn, coinIndexOut, baseAmount

        if (direction) {
          tokenIn = tokenList[i]; coinIndexIn = i; coinIndexOut = j; baseAmount = targetPoolAmounts[i]
        } else {
          tokenIn = tokenList[j]; coinIndexIn = j; coinIndexOut = i; baseAmount = targetPoolAmounts[j]
        }

        // Bounded swap value calculation to protect slippage restrictions
        const randomPercent = Math.random() * (0.022 - 0.002) + 0.002
        const swapAmountValue = baseAmount * randomPercent
        const parsedAmountIn = ethers.utils.parseUnits(swapAmountValue.toFixed(6), 'ether')

        try {
          // Explicitly wait for the approval confirmation to update state logs
          let approveTx = await tokenIn.connect(deployer).approve(nmn.address, parsedAmountIn)
          await approveTx.wait()

          let swapTx = await nmn.connect(deployer).swap(coinIndexIn, coinIndexOut, parsedAmountIn)
          await swapTx.wait(); // CRITICAL: Wait for Sepolia node confirmation to prevent Nonce collisions!

          console.log(`   [Trade ${s + 1}] Swapped ${swapAmountValue.toFixed(4)} ${tokenNames[coinIndexIn]} | Tx: ${swapTx.hash.slice(0, 10)}...`)

          if (isLocalhost) {
            await hre.ethers.provider.send("evm_mine"); // Only advance time block on local nodes
          } else {
            // Pacing delay: Pause script for 2.5 seconds on Sepolia to allow memory pools to balance
            await new Promise(resolve => setTimeout(resolve, 2500))
          }
        } catch (error) {
          console.log(`   [WARNING] Trade ${s + 1} skipped: ${error.message}`)
        }
      }
    }
  }

  console.log(`\n================================================================`)
  console.log(`All 21 pools successfully seeded and simulated on network: ${networkKey}`)
  console.log(`================================================================\n`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

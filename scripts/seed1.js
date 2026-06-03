// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const config = require('../src/config.json')

const tokens = (n) => {
  return ethers.utils.parseUnits(n.toString(), 'ether')
}

const shares = tokens

async function main() {
  // 1. Fetch 5 accounts
  const signers = await ethers.getSigners()
  const deployer = signers[0];
  const investor1 = signers[1]
  const investor2 = signers[2]
  const investor3 = signers[3]
  const investor4 = signers[4]

  const investors = [investor1, investor2, investor3, investor4]

  console.log(`============================================`)
  console.log(`Deployer Account: ${deployer.address}`)
  console.log(`Investor 1: ${investor1.address}`)
  console.log(`Investor 2: ${investor2.address}`)
  console.log(`Investor 3: ${investor3.address}`)
  console.log(`Investor 4: ${investor4.address}`)
  console.log(`============================================\n`)

  // 2. Fetch Network
  const { chainId } = await hre.ethers.provider.getNetwork()
  console.log(`Connected to Chain ID: ${chainId}`)

  // 3. Fetch all tokens and NMN contract from config.json
  console.log("\nFetching Token instances from config.json...")
  const mirian = await hre.ethers.getContractAt('Token', config[chainId].mirian.address)
  const castar = await hre.ethers.getContractAt('Token', config[chainId].castar.address)
  const tharni = await hre.ethers.getContractAt('Token', config[chainId].tharni.address)
  const pony   = await hre.ethers.getContractAt('Token', config[chainId].pony.address)
  const penny  = await hre.ethers.getContractAt('Token', config[chainId].penny.address)
  const brass  = await hre.ethers.getContractAt('Token', config[chainId].brass.address)
  const copper = await hre.ethers.getContractAt('Token', config[chainId].copper.address)

  const tokenList = [mirian, castar, tharni, pony, penny, brass, copper]
  const tokenNames = ["Mirian", "Castar", "Tharni", "Silver Pony", "Silver Penny", "Brass Coin", "Copper Coin"]

  // Array containing the exact raw numerical values
  // Matches Coin enum: 0=mirian, 1=castar, 2=tharni, 3=pony, 4=penny, 5=brass, 6=copper
  const targetPoolAmounts = [1000, 1000, 4000, 1000, 4000, 64000, 256000];

  for (let i = 0; i < tokenList.length; i++) {
    console.log(`  ${tokenNames[i].toUpperCase()} Token fetched: ${tokenList[i].address}`)
  }

  const nmn = await hre.ethers.getContractAt('NMN', config[chainId].nmn.address)
  console.log(`\nNMN fetched: ${nmn.address}\n`);

  // 4. Distribute 100 tokens from each token to all investors
  console.log("Distributing 100 tokens of each type to investors...");
  const distributeAmount = tokens(100);

  for (let t = 0; t < tokenList.length; t++) {
    const token = tokenList[t]
    for (let inv = 0; inv < investors.length; inv++) {
      const investor = investors[inv];
      const tx = await token.connect(deployer).transfer(investor.address, distributeAmount)
      await tx.wait()
    }
  }

  // 5. Approve max tokens from deployer for all tokens to NMN 
  console.log("\nApproving tokens from Deployer to NMN contract...");
  const maxApproveAmount = hre.ethers.constants.MaxUint256; 

  for (let t = 0; t < tokenList.length; t++) {
    const token = tokenList[t];
    const tx = await token.connect(deployer).approve(nmn.address, maxApproveAmount);
    await tx.wait();
  }
  console.log("  All tokens successfully approved.");

  // 6. Initialize all unique pools
  console.log("\nInitializing NMN Pools from Deployer (Owner)...")
  for (let i = 0; i < tokenList.length; i++) {
    for (let j = i + 1; j < tokenList.length; j++) {
      try {
        const tx = await nmn.connect(deployer).initializePool(i, j)
        await tx.wait();
        console.log(`  Pool Initialized: ${tokenNames[i]} <-> ${tokenNames[j]}`)
      } catch (error) {
        console.log(`  Pool Initialization skipped/already exists for ${tokenNames[i]} <-> ${tokenNames[j]}`)
      }
    }
  }

  // 7. Add balanced 10x liquidity to ALL 21 pools from deployer
  console.log("\nAdding balanced liquidity to all 21 pools from Deployer...");

  for (let i = 0; i < tokenList.length; i++) {
    for (let j = i + 1; j < tokenList.length; j++) {
      // Calculate token amounts based on targetPoolAmounts
      const amountI = tokens(targetPoolAmounts[i]);
      const amountJ = tokens(targetPoolAmounts[j]);

      try {
        
        const tx = await nmn.connect(deployer).addLiquidity(i, amountI, j, amountJ);
        await tx.wait();
        console.log(`  Liquidity Added to Pool ${tokenNames[i]} <-> ${tokenNames[j]}:`);
        console.log(`    -> Deposited: ${targetPoolAmounts[i]} ${tokenNames[i]}`);
        console.log(`    -> Deposited: ${targetPoolAmounts[j]} ${tokenNames[j]}`);
      } catch (error) {
        console.log(`  [ERROR] Failed to add liquidity to Pool ${tokenNames[i]} <-> ${tokenNames[j]}: ${error.message}`);
      }
    }
  }

  console.log(`\n================================================================`);
  console.log(`All 21 liquidity pools successfully initialized and seeded `);
  console.log(`================================================================\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
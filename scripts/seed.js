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

  // 3. Fetch all tokens and NMN contract
  console.log("\nFetching Token instances from config.json...")
  const mirian = await hre.ethers
  .getContractAt('Token', config[chainId].mirian.address)
  const castar = await hre.ethers
  .getContractAt('Token', config[chainId].castar.address)
  const tharni = await hre.ethers
  .getContractAt('Token', config[chainId].tharni.address)
  const pony   = await hre.ethers
  .getContractAt('Token', config[chainId].pony.address)
  const penny  = await hre.ethers
  .getContractAt('Token', config[chainId].penny.address)
  const brass  = await hre.ethers
  .getContractAt('Token', config[chainId].brass.address)
  const copper = await hre.ethers
  .getContractAt('Token', config[chainId].copper.address)

  const tokenList = [mirian, castar, tharni, pony, penny, brass, copper]
  const tokenNames = ["Mirian", "Castar", "Tharni", "Silver Pony", "Silver Penny", "Brass Coin", "Copper Coin"]

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
      const tx = await token.connect(deployer).
      transfer(investor.address, distributeAmount)
      await tx.wait()
      // console.log(`  Sent 100 ${tokenNames[t]} to Investor ${inv + 1} (${investor.address})`)
    }
  }

  // 5. Approve enough tokens from deployer for all tokens to NMN 
  console.log("\nApproving tokens from Deployer to NMN contract...");
  const approveAmount = tokens(5000); 

  for (let t = 0; t < tokenList.length; t++) {
    const token = tokenList[t];
    const tx = await token.connect(deployer).approve(nmn.address, approveAmount);
    await tx.wait();
    // console.log(`  Deployer approved ${tokenNames[t]} to NMN`);
  }

  // 6. Initialize all unique pools
  console.log("\nInitializing NMN Pools from Deployer (Owner)...")
  for (let i = 0; i < tokenList.length; i++) {
    for (let j = i + 1; j < tokenList.length; j++) {
      try {
        const tx = await nmn.connect(deployer).initializePool(i, j)
        await tx.wait();
        // console.log(`  Pool Initialized: Coin(${i}) <-> Coin(${j})`)
      } catch (error) {
        console.log(`  Pool Initialization skipped/failed for Coin(${i}) <-> Coin(${j})`)
      }
    }
  }

   // 7. Add liquidity to most pools from deployer around tokens(100) each
  console.log("\nAdding liquidity to pools from Deployer...");
  const liquidityAmount = tokens(100);

  for (let i = 0; i < tokenList.length; i++) {
    for (let j = i + 1; j < tokenList.length; j++) {
      // Skips 2 out of 3 pools
      if ((i + j) % 3 === 0) {
        console.log(`  [Skipped] Adding liquidity to Coin(${i}) <-> Coin(${j})`);
        continue;
      }

      try {
        const tx = await nmn.connect(deployer).addLiquidity(i, liquidityAmount, j, liquidityAmount);
        await tx.wait();
        console.log(`  Liquidity Added: 100 units each into Pool Coin(${i}) <-> Coin(${j})`);
      } catch (error) {
        console.log(`  Failed to add liquidity to Pool Coin(${i}) <-> Coin(${j}): ${error.message}`);
      }
    }
  }

  // 8. Do 8 to 10 swaps for each investor in active pools
  console.log("\nExecuting random swaps for investors...");
  const swapAmount = tokens(5);

  for (let inv = 0; inv < investors.length; inv++) {
    const investor = investors[inv];
    const swapsCount = 8 + (inv % 3); 
    console.log(`Investor ${inv + 1} executing ${swapsCount} swaps:`);

    for (let s = 0; s < swapsCount; s++) {
      const tokenInIndex = (inv + s) % tokenList.length;
      let tokenOutIndex = (tokenInIndex + 1) % tokenList.length;
      // make sure the pool is one of the ones we activated previous
      if ((tokenInIndex + tokenOutIndex) % 3 === 0) {
        tokenOutIndex = (tokenOutIndex + 1) % tokenList.length;
      }

      const tokenIn = tokenList[tokenInIndex];
      const nameIn = tokenNames[tokenInIndex];
      const nameOut = tokenNames[tokenOutIndex];

      try {
        // Investor must approve the nmn contract to pull their tokens before trading
        const approveTx = await tokenIn.connect(investor).approve(nmn.address, swapAmount)
        await approveTx.wait();

        const swapTx = await nmn.connect(investor).swap(tokenInIndex, tokenOutIndex, swapAmount)
        await swapTx.wait();
        console.log(`  Swap ${s + 1} Success: Swapped 5 ${nameIn} for ${nameOut}`)
      } catch (error) {
        console.log(`  Swap ${s + 1} Failed swap: (${nameIn} -> ${nameOut}`);
      }
    }
  }

  console.log("\n================================");
  console.log("Seed script Finished");
  console.log("================================\n");



}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
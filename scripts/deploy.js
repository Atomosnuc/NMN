// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const Token = await hre.ethers.getContractFactory("Token");

  // Fetch the active network configuration from Hardhat
  const { chainId } = await hre.ethers.provider.getNetwork();
  console.log(`Connected to Network Chain ID: ${chainId}\n`);
  
  // Define metadata for all tokens matching Coin enum order:
  // enum Coin { mirian, castar, tharni, pony, penny, brass, copper }
  const tokenConfigs = [
    { name: "Mirian Token", symbol: "MRN", totalSupply: "10000000" },
    { name: "Castar Token", symbol: "CSTR", totalSupply: "10000000" },
    { name: "Tharni Token", symbol: "TRN", totalSupply: "10000000" },
    { name: "Pony Token", symbol: "PONY", totalSupply: "10000000" },
    { name: "Penny Token", symbol: "PENNY", totalSupply: "10000000" },
    { name: "Brass Token", symbol: "BRASS", totalSupply: "10000000" },
    { name: "Copper Token", symbol: "COP", totalSupply: "10000000" }
  ];

  // Object to save configuration slice
  const networkData = {};
  // array of deployed token addresses
  const deployedTokenAddresses = [];

  console.log("Starting deployment of tokens...\n");
  // Deploy each token sequentially to preserve enum order indexing
  for (const config of tokenConfigs) {
    const token = await Token.deploy(
      config.name,
      config.symbol,
      config.totalSupply
    );
    await token.deployed();

    const receipt = await token.deployTransaction.wait();

    console.log(`${config.name} (${config.symbol}) deployed to: ${token.address}`);
    console.log(`   -> Deployment Block Number: ${receipt.blockNumber}`);

    networkData[config.configKey] = { address: token.address };
    deployedTokenAddresses.push(token.address);
  }
  
  console.log("\nAll tokens deployed successfully. Initializing NMN ...\n");

  // Deploy NMN contract 
  const NMN = await hre.ethers.getContractFactory("NMN");
  const nmn = await NMN.deploy(deployedTokenAddresses);
  await nmn.deployed();
  const result = await nmn.deployTransaction.wait();

  console.log(`=======================================================================================`);
  console.log(`NMN contract successfully deployed to: ${nmn.address}`);
  console.log(`   Deployment Block Number: ${result.blockNumber}`)
  console.log(`=======================================================================================\n`);

  // Save NMN address and block number of deployment to object
  networkData["nmn"] = {
    address: nmn.address,
    deploymentBlock: result.blockNumber
  };

  // --- AUTOMATED CONFIG-WRITING FILESYSTEM ENGINE ---
  console.log("Saving addresses and block checkpoints to config.json...");
  
  // Resolve path to config file 
  const configPath = path.resolve(__dirname, "../src/config.json");
  
  let currentConfig = {};
  
  // If the file already exists, read it first to avoid deleting other networks
  if (fs.existsSync(configPath)) {
    const rawData = fs.readFileSync(configPath, "utf8");
    if (rawData.trim().length > 0) {
      currentConfig = JSON.parse(rawData);
    }
  }

   // Inject or overwrite only the specific chainId block we just deployed to
  currentConfig[chainId.toString()] = networkData;

  // Write the cleanly formatted updated object back to the file
  fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), "utf8");
  console.log(`🎉 Configuration successfully updated for Chain ID ${chainId} at: ${configPath}\n`);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
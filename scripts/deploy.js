const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const Token = await hre.ethers.getContractFactory("Token");
  
  const { chainId } = await hre.ethers.provider.getNetwork();
  console.log(`Connected to Network Chain ID: ${chainId}\n`);

  const tokenConfigs = [
    { name: "Mirian Token", symbol: "MRN", totalSupply: "10000000", configKey: "mirian" },
    { name: "Castar Token", symbol: "CSTR", totalSupply: "10000000", configKey: "castar" },
    { name: "Tharni Token", symbol: "TRN", totalSupply: "10000000", configKey: "tharni" },
    { name: "Pony Token", symbol: "PONY", totalSupply: "10000000", configKey: "pony" },
    { name: "Penny Token", symbol: "PENNY", totalSupply: "10000000", configKey: "penny" },
    { name: "Brass Token", symbol: "BRASS", totalSupply: "10000000", configKey: "brass" },
    { name: "Copper Token", symbol: "COP", totalSupply: "10000000", configKey: "copper" }
  ];

  const networkData = {};
  const deployedTokenAddresses = [];

  console.log("Starting deployment of tokens...\n");
  
  // Using 'item' here completely solves the variable shadowing bug!
  for (const item of tokenConfigs) {
    const token = await Token.deploy(
      item.name,
      item.symbol,
      item.totalSupply
    );
    await token.deployed();

    const receipt = await token.deployTransaction.wait();

    console.log(`${item.name} (${item.symbol}) deployed to: ${token.address}`);
    console.log(`   -> Deployment Block Number: ${receipt.blockNumber}`);
    
    networkData[item.configKey] = { address: token.address };
    deployedTokenAddresses.push(token.address);
  }

  console.log("\nAll tokens deployed successfully. Initializing NMN ...\n");

  const NMN = await hre.ethers.getContractFactory("NMN");
  const nmn = await NMN.deploy(deployedTokenAddresses);
  await nmn.deployed();
  const result = await nmn.deployTransaction.wait();

  console.log(`=======================================================================================`);
  console.log(`NMN contract successfully deployed to: ${nmn.address}`);
  console.log(`   Deployment Block Number: ${result.blockNumber}`);
  console.log(`=======================================================================================\n`);

  networkData["nmn"] = {
    address: nmn.address,
    deploymentBlock: result.blockNumber
  };

  console.log("Writing fresh, non-shadowed entries to config.json...");
  const configPath = path.resolve(__dirname, "../src/config.json");
  
  let currentConfig = {};
  if (fs.existsSync(configPath)) {
    const rawData = fs.readFileSync(configPath, "utf8");
    if (rawData.trim().length > 0) {
      currentConfig = JSON.parse(rawData);
    }
  }

  currentConfig[chainId.toString()] = networkData;

  fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), "utf8");
  console.log(`🎉 Configuration cleanly saved at: ${configPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
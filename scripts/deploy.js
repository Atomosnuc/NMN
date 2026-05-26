// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");

async function main() {
  const Token = await hre.ethers.getContractFactory("Token");
  
  // Define metadata for all tokens matching Coin enum order:
  // enum Coin { mirian, castar, tharni, pony, penny, brass, copper }
  const tokenConfigs = [
    { name: "Mirian Token", symbol: "MRN", totalSupply: "1000000" },
    { name: "Castar Token", symbol: "CSTR", totalSupply: "1000000" },
    { name: "Tharni Token", symbol: "TRN", totalSupply: "1000000" },
    { name: "Pony Token", symbol: "PONY", totalSupply: "1000000" },
    { name: "Penny Token", symbol: "PENNY", totalSupply: "1000000" },
    { name: "Brass Token", symbol: "BRASS", totalSupply: "1000000" },
    { name: "Copper Token", symbol: "COP", totalSupply: "1000000" }
  ];

  const deployedTokenAddresses = [];

  console.log("Starting deployment of tokens...\n");
  // Deploy each token sequentially to preserve enum order indexing
  for (const config of tokenConfigs) {
    const token = await Token.deploy(
      config.name,
      config.symbol,
      hre.ethers.utils.parseEther(config.totalSupply)
    );
    await token.deployed();
    
    console.log(`${config.name} (${config.symbol}) deployed to: ${token.address}`);
    deployedTokenAddresses.push(token.address);
  }

  console.log("\nAll tokens deployed successfully. Initializing NMN AMM...\n");

  // Deploy NMN contract with the array of deployed token addresses
  const NMN = await hre.ethers.getContractFactory("NMN");
  const nmn = await NMN.deploy(deployedTokenAddresses);
  await nmn.deployed();

  console.log(`=======================================================================================`);
  console.log(`NMN contract successfully deployed to: ${nmn.address}`);
  console.log(`=======================================================================================\n`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
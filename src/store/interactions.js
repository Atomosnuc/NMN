import { ethers } from 'ethers'

import {
  setProvider,
  setNetwork,
  setAccount
} from './reducers/provider'

import {
  setContracts,
  setSymbols,
  tokenBalanceLoaded
} from './reducers/tokens'

import {
  setContract,
  poolStateLoaded,
  poolSharesLoaded,
  swapsLoaded,
  liquidityHistoryLoaded,
  depositRequest,
  depositSuccess,
  depositFail,
  withdrawRequest,
  withdrawSuccess,
  withdrawFail,
  swapRequest,
  swapSuccess,
  swapFail
} from './reducers/nmn'

import TOKEN_ABI from '../abis/Token.json'
import NMN_ABI from '../abis/NMN.json'
import config from '../config.json'

export const loadProvider = (existingProvider, dispatch) => {
  if (existingProvider) {
    return existingProvider
  }

  // Check if Ethers has already assigned its internal listener cache to window.ethereum
  if (window.ethereum && window.ethereum._ethersProvider) {
    const cachedProvider = window.ethereum._ethersProvider
    dispatch(setProvider(cachedProvider))
    return cachedProvider
  }

  const provider = new ethers.providers.Web3Provider(window.ethereum)
  // Cache the instance directly onto the window object so dev-refreshes can see it
  if (window.ethereum) {
    window.ethereum._ethersProvider = provider
  }
  dispatch(setProvider(provider))
  return provider
}

export const loadNetwork = async (provider, dispatch) => {
  const { chainId } = await provider.getNetwork()
  dispatch(setNetwork(chainId))

  return chainId
}

export const loadAccount = async (dispatch) => {
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
  const account = ethers.utils.getAddress(accounts[0])
  dispatch(setAccount(account))

  return account
}

// // ------------------------------------------------------------------------------
// LOAD CONTRACTS
// LOAD ALL 7 TOKENS VIA CONFIG
export const loadTokens = async (provider, chainId, dispatch) => {
  const coinKeys = ["mirian", "castar", "tharni", "pony", "penny", "brass", "copper"]
  const contracts = []
  const symbols = []

  // Safely parse chain ID to string format
  const networkId = chainId ? chainId.toString() : ""

  if (!config[networkId]) {
    console.error(`Network configuration missing for chain ID: ${networkId}`)
    return []
  }

  for (const key of coinKeys) {
    const address = config[networkId][key].address
    const contract = new ethers.Contract(address, TOKEN_ABI, provider)
    contracts.push(contract)
    symbols.push(await contract.symbol())
  }

  dispatch(setContracts(contracts))
  dispatch(setSymbols(symbols))
  return contracts
}

export const loadNMN = async (provider, chainId, dispatch) => {
  const networkId = chainId ? chainId.toString() : ""

  if (!config[networkId] || !config[networkId].nmn) {
    console.error(`NMN contract missing for network: ${networkId}`)
    return null
  }

  const nmn = new ethers.Contract(config[networkId].nmn.address, NMN_ABI, provider)
  dispatch(setContract(nmn))
  return nmn
};

// // ------------------------------------------------------------------------------
// // LOAD BALANCES & SHARES
// LOAD MULTI-POOL BALANCES, RESERVES, AND SHARES
export const loadAllPoolsAndBalances = async (nmn, tokens, account, dispatch) => {


  // 1. Fetch wallet balances for all 7 tokens
  for (const token of tokens) {
    const rawBalance = await token.balanceOf(account)
    dispatch(tokenBalanceLoaded({
      tokenAddress: token.address,
      balance: ethers.utils.formatUnits(rawBalance, 'ether')
    }))
  }

  // 2. Query configurations for every unique pool combination matrix
  const totalCoins = tokens.length;
  for (let i = 0; i < totalCoins; i++) {
    for (let j = i + 1; j < totalCoins; j++) {
      try {
        const pool = await nmn.getPoolState(i, j)

        dispatch(poolStateLoaded({
          coin0: i,
          coin1: j,
          reserve0: ethers.utils.formatUnits(pool.reserve0, 'ether'),
          reserve1: ethers.utils.formatUnits(pool.reserve1, 'ether'),
          totalShares: ethers.utils.formatUnits(pool.totalShares, 'ether'),
          exists: pool.exists
        }))

        if (account && pool.exists) {
          const shares = await nmn.getUserShares(i, j, account);
          dispatch(poolSharesLoaded({
            coin0: i,
            coin1: j,
            shares: ethers.utils.formatUnits(shares, 'ether')
          }))
        }
      } catch (error) {
        console.error(`Failed to map tracking metrics on pool iteration ${i}-${j}:`, error)
      }
    }
  }
};



// // ------------------------------------------------------------------------------
// // ADD LIQUDITY 
export const addLiquidity = async (provider, nmn, token0Contract, token1Contract, coinIndex0, amount0, coinIndex1, amount1, dispatch) => {
  try {
    dispatch(depositRequest())
    const signer = await provider.getSigner()
    // Formats numbers to BigNumbers
    const parsedAmount0 = ethers.utils.parseUnits(amount0.toString(), 'ether')
    const parsedAmount1 = ethers.utils.parseUnits(amount1.toString(), 'ether')
    // Approves amounts
    let tx
    tx = await token0Contract.connect(signer).approve(nmn.address, parsedAmount0)
    await tx.wait()
    tx = await token1Contract.connect(signer).approve(nmn.address, parsedAmount1)
    await tx.wait()

    // Calls addLiquidity
    tx = await nmn.connect(signer).addLiquidity(coinIndex0, parsedAmount0, coinIndex1, parsedAmount1)
    await tx.wait()

    dispatch(depositSuccess(tx.hash))
  } catch (error) {
    console.error(error)
    dispatch(depositFail())
  }
}


// // ------------------------------------------------------------------------------
// // REMOVE LIQUDITY
export const removeLiquidity = async (provider, nmn, coinIndex0, coinIndex1, sharesAmount, dispatch) => {
  try {
    dispatch(withdrawRequest())
    const signer = await provider.getSigner()
    // Formats to BigNumbers
    const parsedShares = ethers.utils.parseUnits(sharesAmount.toString(), 'ether');

    // Calls removeLiquidity
    const tx = await nmn.connect(signer).removeLiquidity(coinIndex0, coinIndex1, parsedShares)
    await tx.wait()

    dispatch(withdrawSuccess(tx.hash))
  } catch (error) {
    console.error(error)
    dispatch(withdrawFail())
  }
}


// // ------------------------------------------------------------------------------
// // SWAP
export const executeSwap = async (provider, nmn, tokenInContract, coinIndexIn, coinIndexOut, amountIn, dispatch) => {
  try {
    dispatch(swapRequest())
    const signer = await provider.getSigner()
    const parsedAmountIn = ethers.utils.parseUnits(amountIn.toString(), 'ether')

    let tx = await tokenInContract.connect(signer).approve(nmn.address, parsedAmountIn)
    await tx.wait();

    // Call your standardized unified contract logic: swap(coinIn, coinOut, amountIn)
    tx = await nmn.connect(signer).swap(coinIndexIn, coinIndexOut, parsedAmountIn)
    await tx.wait()

    dispatch(swapSuccess(tx.hash))
  } catch (error) {
    console.error(error)
    dispatch(swapFail())
  }
}



// // ------------------------------------------------------------------------------
// // LOAD ALL SWAPS

export const loadAllSwaps = async (provider, nmn, dispatch) => {
  const block = await provider.getBlockNumber()
  const { chainId } = await provider.getNetwork()
  const networkId = chainId ? chainId.toString() : ""

  const fromBlock = config[networkId]?.nmn?.deployBlock ?? 0

  const swapStream = await nmn.queryFilter('Swap', fromBlock, block)
  const swaps = swapStream.map(event => ({
    hash: event.transactionHash,
    args: event.args
  }));

  dispatch(swapsLoaded(swaps))

}

// // ------------------------------------------------------------------------------
// // LOAD ALL LIQUIDITY EVENTS MATRIX CACHE

export const loadAllLiquidityEvents = async (provider, nmn, dispatch) => {
  try {
    // 1. Fetch block parameters matching your deployment configurations
    const block = await provider.getBlockNumber()
    const { chainId } = await provider.getNetwork()

    // Check your dynamic deployment checkpoints configuration
    const fromBlock = config[chainId]?.nmn?.deploymentBlock ?? 0

    // 2. Setup simultaneous querying streams across all 21 pools
    const addStream = await nmn.queryFilter('LiquidityAdded', fromBlock, block)
    const removeStream = await nmn.queryFilter('LiquidityRemoved', fromBlock, block)

    // 3. Decorate results arrays uniformly to safely extract event arguments
    const additions = addStream.map(event => ({
      hash: event.transactionHash,
      args: event.args
    }))

    const removals = removeStream.map(event => ({
      hash: event.transactionHash,
      args: event.args
    }))

    // 4. Fire action directly to push the datasets cleanly into Redux memory
    dispatch(liquidityHistoryLoaded({ additions, removals }))

  } catch (error) {
    console.error("Failed to compile background decentralized liquidity logs:", error)
  }
}

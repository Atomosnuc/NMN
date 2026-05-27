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

export const loadProvider = (dispatch) => {
  const provider = new ethers.providers.Web3Provider(window.ethereum)
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

  for (const key of coinKeys) {
    const address = config[chainId][key].address
    const contract = new ethers.Contract(address, TOKEN_ABI, provider)
    contracts.push(contract);
    symbols.push(await contract.symbol())
  }

  dispatch(setContracts(contracts))
  dispatch(setSymbols(symbols))
  return contracts
};

export const loadNMN = async (provider, chainId, dispatch) => {
  const nmn = new ethers.Contract(config[chainId].nmn.address, NMN_ABI, provider)
  dispatch(setContract(nmn))
  return nmn
};

// // ------------------------------------------------------------------------------
// // LOAD BALANCES & SHARES
// LOAD MULTI-POOL BALANCES, RESERVES, AND SHARES
export const loadAllPoolsAndBalances = async (amm, tokens, account, dispatch) => {
  // 1. Fetch wallet balances for all 7 tokens
  for (const token of tokens) {
    const rawBalance = await token.balanceOf(account);
    dispatch(tokenBalanceLoaded({
      tokenAddress: token.address,
      balance: ethers.utils.formatUnits(rawBalance, 'ether')
    }));
  }

  // 2. Query configurations for every unique pool combination matrix
  const totalCoins = tokens.length;
  for (let i = 0; i < totalCoins; i++) {
    for (let j = i + 1; j < totalCoins; j++) {
      try {
        const pool = await amm.getPoolState(i, j);
        
        dispatch(poolStateLoaded({
          coin0: i,
          coin1: j,
          reserve0: ethers.utils.formatUnits(pool.reserve0, 'ether'),
          reserve1: ethers.utils.formatUnits(pool.reserve1, 'ether'),
          totalShares: ethers.utils.formatUnits(pool.totalShares, 'ether'),
          exists: pool.exists
        }));

        if (account && pool.exists) {
          const shares = await amm.getUserShares(i, j, account);
          dispatch(poolSharesLoaded({
            coin0: i,
            coin1: j,
            shares: ethers.utils.formatUnits(shares, 'ether')
          }));
        }
      } catch (error) {
        console.error(`Failed to map tracking metrics on pool iteration ${i}-${j}:`, error);
      }
    }
  }
};



// // ------------------------------------------------------------------------------
// // ADD LIQUDITY
// export const addLiquidity = async (provider, nmn, tokens, amounts, dispatch) => {
//   try {
//     dispatch(depositRequest())

//     const signer = await provider.getSigner()

//     let transaction

//     transaction = await tokens[0].connect(signer).approve(nmn.address, amounts[0])
//     await transaction.wait()

//     transaction = await tokens[1].connect(signer).approve(nmn.address, amounts[1])
//     await transaction.wait()

//     transaction = await nmn.connect(signer).addLiquidity(amounts[0], amounts[1])
//     await transaction.wait()

//     dispatch(depositSuccess(transaction.hash))
//   } catch (error) {
//     dispatch(depositFail())
//   }
// }

// // ------------------------------------------------------------------------------
// // REMOVE LIQUDITY
// export const removeLiquidity = async (provider, nmn, shares, dispatch) => {
//   try {
//     dispatch(withdrawRequest())

//     const signer = await provider.getSigner()

//     let transaction = await nmn.connect(signer).removeLiquidity(shares)
//     await transaction.wait()

//     dispatch(withdrawSuccess(transaction.hash))
//   } catch (error) {
//     dispatch(withdrawFail())
//   }
// }

// // ------------------------------------------------------------------------------
// // SWAP

// export const swap = async (provider, nmn, token, symbol, amount, dispatch) => {
//   try {

//     dispatch(swapRequest())

//     let transaction

//     const signer = await provider.getSigner()

//     transaction = await token.connect(signer).approve(nmn.address, amount)
//     await transaction.wait()

//     if (symbol === "DAPP") {
//       transaction = await nmn.connect(signer).swapToken1(amount)
//     } else {
//       transaction = await nmn.connect(signer).swapToken2(amount)
//     }

//     await transaction.wait()

//     dispatch(swapSuccess(transaction.hash))

//   } catch (error) {
//     dispatch(swapFail())
//   }
// }


// // ------------------------------------------------------------------------------
// // LOAD ALL SWAPS

// export const loadAllSwaps = async (provider, nmn, dispatch) => {
//   const block = await provider.getBlockNumber()
//   const { chainId } = await provider.getNetwork()
//   const fromBlock = config[chainId]?.nmn?.deployBlock ?? 0

//   const swapStream = await nmn.queryFilter('Swap', fromBlock, block)
//   console.log(swapStream)
//   const swaps = swapStream.map(event => {
//     return { hash: event.transactionHash, args: event.args }
//   })

//   dispatch(swapsLoaded(swaps))
// }

import { createSlice } from "@reduxjs/toolkit"

// Generates string ID for indexing nested pools
export const getPoolId = (coinA, coinB) => {
  const cA = Number(coinA)
  const cB = Number(coinB)
  return cA < cB ? `${cA}-${cB}` : `${cB}-${cA}`
};

export const nmn = createSlice({
  name: 'nmn',
  initialState: {
    contract: null,
    selectedTokenA: 0,
    selectedTokenB: 1,
    // poolData holds distinct parameters indexed by sorted pool composite keys
    // Structure: { "0-1": { reserve0: '0', reserve1: '0', totalShares: '0', userShares: '0', exists: false } }
    poolData: {},
    swaps: [],
    liquidityHistory: { additions: [], removals: [] },
    depositing: { isDepositing: false, isSuccess: false, transactionHash: null },
    withdrawing: { isWithdrawing: false, isSuccess: false, transactionHash: null },
    swapping: { isSwapping: false, isSuccess: false, transactionHash: null }
  },
  reducers: {
    setContract: (state, action) => {
      state.contract = action.payload;
    },
    setSelectedTokenA: (state, action) => {
      state.selectedTokenA = action.payload
    },
    setSelectedTokenB: (state, action) => {
      state.selectedTokenB = action.payload
    },
    poolStateLoaded: (state, action) => {
      const { coin0, coin1, reserve0, reserve1, totalShares, exists } = action.payload
      const poolId = getPoolId(coin0, coin1)

      if (!state.poolData[poolId]) {
        state.poolData[poolId] = { reserve0: '0', reserve1: '0', totalShares: '0', userShares: '0', exists: false }
      }
      state.poolData[poolId].reserve0 = reserve0
      state.poolData[poolId].reserve1 = reserve1
      state.poolData[poolId].totalShares = totalShares
      state.poolData[poolId].exists = exists
    },
    poolSharesLoaded: (state, action) => {
      const { coin0, coin1, shares } = action.payload
      const poolId = getPoolId(coin0, coin1)

      if (!state.poolData[poolId]) {
        state.poolData[poolId] = { reserve0: '0', reserve1: '0', totalShares: '0', userShares: '0', exists: false }
      }
      state.poolData[poolId].userShares = shares
    },
    swapsLoaded: (state, action) => {
      state.swaps = action.payload
    },
    liquidityHistoryLoaded: (state, action) => {
      state.liquidityHistory.additions = action.payload.additions
      state.liquidityHistory.removals = action.payload.removals
    },
    depositRequest: (state) => {
      state.depositing = { isDepositing: true, isSuccess: false, transactionHash: null }
    },
    depositSuccess: (state, action) => {
      state.depositing = { isDepositing: false, isSuccess: true, transactionHash: action.payload }
    },
    depositFail: (state) => {
      state.depositing = { isDepositing: false, isSuccess: false, transactionHash: null }
    },
    withdrawRequest: (state) => {
      state.withdrawing = { isWithdrawing: true, isSuccess: false, transactionHash: null }
    },
    withdrawSuccess: (state, action) => {
      state.withdrawing = { isWithdrawing: false, isSuccess: true, transactionHash: action.payload }
    },
    withdrawFail: (state) => {
      state.withdrawing = { isWithdrawing: false, isSuccess: false, transactionHash: null }
    },
    swapRequest: (state) => {
      state.swapping = { isSwapping: true, isSuccess: false, transactionHash: null }
    },
    swapSuccess: (state, action) => {
      state.swapping = { isSwapping: false, isSuccess: true, transactionHash: action.payload }
    },
    swapFail: (state) => {
      state.swapping = { isSwapping: false, isSuccess: false, transactionHash: null }
    }
  }
})

export const {
  setContract,
  setSelectedTokenA, 
  setSelectedTokenB,
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
} = nmn.actions

export default nmn.reducer

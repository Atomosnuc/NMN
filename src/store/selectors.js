import { createSelector } from "reselect"
import { ethers } from "ethers"

const tokens = state => state.tokens.contracts
const swaps = state => state.nmn.swaps

const getLiquidityHistory = state => state.nmn.liquidityHistory
const getActiveAccount = state => state.provider.account
const getPoolData = state => state.nmn.poolData

// Selectors to pass the active user dropdown selections dynamically into the chart pipeline
export const selectActivePair = (state, inputIndex, outputIndex) => ({ inputIndex, outputIndex })

export const chartSelector = createSelector(
  [swaps, tokens, selectActivePair],
  (swaps, tokens, activePair) => {
    const { inputIndex, outputIndex } = activePair

    // Guard Clause: Return defaults if tokens are not loaded or if no complete pair is chosen
    if (!tokens || tokens.length === 0 || inputIndex === null || outputIndex === null || inputIndex === outputIndex) {
      return { swaps: [], series: [{ name: "Rate", data: [] }] }
    }

    const tokenInAddress = tokens[inputIndex]?.address?.toLowerCase()
    const tokenOutAddress = tokens[outputIndex]?.address?.toLowerCase()

    if (!tokenInAddress || !tokenOutAddress) {
      return { swaps: [], series: [{ name: "Rate", data: [] }] }
    }

    // 1. Filter swaps strictly to match the specific pair selected by the user
    let filteredSwaps = swaps.filter((s) => {
      const currentIn = s.args.tokenIn.toLowerCase()
      const currentOut = s.args.tokenOut.toLowerCase()

      // Match regardless of trading direction (TokenA -> TokenB OR TokenB -> TokenA)
      return (
        (currentIn === tokenInAddress && currentOut === tokenOutAddress) ||
        (currentIn === tokenOutAddress && currentOut === tokenInAddress)
      )
    })

    // 2. Sort swaps by date ascending to build the historical time-series chart
    filteredSwaps = filteredSwaps.sort((a, b) => Number(a.args.timestamp) - Number(b.args.timestamp))

    // 3. Decorate swaps and calculate price tracking ratios
    const decoratedSwaps = filteredSwaps.map((s) => {
      const amountIn = Number(ethers.utils.formatUnits(s.args.amountIn, 'ether'))
      const amountOut = Number(ethers.utils.formatUnits(s.args.amountOut, 'ether'))

      let rate;
      // Define the base token pricing perspective depending on execution direction
      if (s.args.tokenIn.toLowerCase() === tokenInAddress) {
        rate = amountIn !== 0 ? amountOut / amountIn : 0
      } else {
        rate = amountOut !== 0 ? amountIn / amountOut : 0
      }

      // Round to 5 decimal precision
      rate = Math.round(rate * 100000) / 100000

      return {
        ...s,
        rate
      }
    })

    // 4. Extract prices array for ApexCharts line vector
    const prices = decoratedSwaps.map(s => s.rate)

    // 5. Reverse sort the list chronologically descending so the table displays newest trades first
    const tableSwaps = [...decoratedSwaps].sort((a, b) => Number(b.args.timestamp) - Number(a.args.timestamp))

    return {
      swaps: tableSwaps,
      series: [{
        name: "Exchange Rate",
        data: prices
      }]
    }
  }
)

// --- GLOBAL DE-SCALING UTILITY ---
const parseNum = (rawVal) => {
  if (rawVal === undefined || rawVal === null || rawVal === '') return 0

  const valStr = rawVal.toString().trim()

  // If it already contains a decimal point, it is already formatted!
  if (valStr.includes('.')) {
    return Number(valStr)
  }

  // Otherwise, safely treat it as an unscaled 18-decimal blockchain BigNumber string
  try {
    return Number(ethers.utils.formatEther(valStr))
  } catch (error) {
    // Fallback if it is a simple plain string integer (e.g. "100")
    const parsed = Number(valStr)
    return isNaN(parsed) ? 0 : parsed
  }
};

// --- GLOBAL REACTIVE LIQUIDITY PERFORMANCE SELECTOR ENGINE ---
export const liquidityPerformanceSelector = createSelector(
  [getLiquidityHistory, tokens, getActiveAccount, getPoolData, selectActivePair],
  (history, tokensList, account, poolData, activePair) => {
    const { inputIndex, outputIndex } = activePair;

    // Guard Clause: Exit instantly if parameters are missing or incomplete
    if (
      !tokensList ||
      tokensList.length === 0 ||
      inputIndex === null ||
      outputIndex === null ||
      inputIndex === outputIndex ||
      !account ||
      !history
    ) {
      return { trackedUserSqrtK: 0, livePoolSqrtK: 0, roiPercentage: '0.0000%' }
    }

    // 1. Sort indices numerically to match your contract's strict Enum configuration order
    const lowIndex = Math.min(inputIndex, outputIndex)
    const highIndex = Math.max(inputIndex, outputIndex)

    const sortedAddr0 = tokensList[lowIndex].address.toLowerCase()
    const sortedAddr1 = tokensList[highIndex].address.toLowerCase()

    // 2. Filter additions for the selected account and pool pair
    const formattedAdd = (history.additions || [])
      .filter(log => {
        const matchesUser = log.args.user?.toLowerCase() === account.toLowerCase()
        const matchesToken0 = log.args.token0?.toLowerCase() === sortedAddr0
        const matchesToken1 = log.args.token1?.toLowerCase() === sortedAddr1
        return matchesUser && matchesToken0 && matchesToken1
      })
      .map(log => ({
        type: 'LiquidityAdded',
        shareAmountMinted: log.args.shareAmountMinted.toString(),
        currentSqrtK: log.args.currentSqrtK.toString(),
        totalPoolShares: log.args.currentTotalShares ? log.args.currentTotalShares.toString() : '0',
        timestamp: Number(log.args.timestamp)
      }));

    // 3. Filter removals for the selected account and pool pair
    const formattedRemove = (history.removals || [])
      .filter(log => {
        const matchesUser = log.args.user?.toLowerCase() === account.toLowerCase()
        const matchesToken0 = log.args.token0?.toLowerCase() === sortedAddr0
        const matchesToken1 = log.args.token1?.toLowerCase() === sortedAddr1
        return matchesUser && matchesToken0 && matchesToken1
      })
      .map(log => ({
        type: 'LiquidityRemoved',
        userSharesRemaining: log.args.userSharesRemaining.toString(),
        timestamp: Number(log.args.timestamp)
      }))

    // 4. Combine and chronologically sort events
    const fullHistory = [...formattedAdd, ...formattedRemove].sort((a, b) => a.timestamp - b.timestamp)

    // 5. Run the core off-chain weighted arithmetic share value V rolling average loop
    let userShares = 0
    let userV = 0
    let lastEventPoolV  = 0

    for (const event of fullHistory) {
      if (event.type === 'LiquidityAdded') {
        const mintedSharesNum = parseNum(event.shareAmountMinted)
        const poolSqrtKNum = parseNum(event.currentSqrtK)
        const totalPoolSharesNum = parseNum(event.totalPoolShares)

        // Prevent division-by-zero errors if totalPoolShares isn't fully updated yet
        const currentPoolShares = totalPoolSharesNum > 0 ? totalPoolSharesNum : mintedSharesNum
        
        // Calculate pool V at the historical point: sqrt(K) / Total Pool Shares
        const historicalPoolV = poolSqrtKNum / currentPoolShares
        lastEventPoolV = historicalPoolV

        if (userShares === 0 || userV === 0) {
          userV = historicalPoolV
          userShares = mintedSharesNum
        } else {
          const totalNewSharesNum = userShares + mintedSharesNum
          // Weighted Arithmetic Mean
          userV = ((userShares * userV) + (mintedSharesNum * historicalPoolV)) / totalNewSharesNum
          userShares = totalNewSharesNum
        }
      }
      else if (event.type === 'LiquidityRemoved') {
        const sharesRemainingNum = parseNum(event.userSharesRemaining)
        if (sharesRemainingNum <= 0) {
          userShares = 0
          userV = 0
          lastEventPoolV = 0
        } else {
          userShares = sharesRemainingNum
        }
      }
    }

    // 6. Calculate the live checkpoint using your pre-parsed Redux state
    const poolId = `${lowIndex}-${highIndex}`
    const currentPool = poolData[poolId]

    let livePoolVNum  = 0
    if (currentPool && currentPool.reserve0 && currentPool.reserve1) {
      const res0Num = parseNum(currentPool.reserve0)
      const res1Num = parseNum(currentPool.reserve1)
      const poolTotalSharesNum = parseNum(currentPool.totalShares)
      const livePoolSqrtKNum = Math.sqrt(res0Num * res1Num)

      if (poolTotalSharesNum > 0) {
        livePoolVNum = livePoolSqrtKNum / poolTotalSharesNum
      }
    }

     // Handle initial rendering scale fallback logic safely
    if (livePoolVNum === 0 && lastEventPoolV > 0) {
    livePoolVNum = lastEventPoolV
    }

    let growthFactor = 0;
    if (userV > 0) {
      growthFactor = livePoolVNum / userV
    }

    return {
      trackedUserV: userV,
      livePoolV: livePoolVNum,
      roiPercentage: growthFactor > 0 ? ((growthFactor - 1) * 100).toFixed(4) + "%" : "0.0000%"
    }
  }
)

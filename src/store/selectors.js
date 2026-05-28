import { createSelector } from "reselect"
import { ethers } from "ethers"

const tokens = state => state.tokens.contracts
const swaps = state => state.nmn.swaps // Updated path from state.amm to state.nmn

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
      );
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
        rate = amountIn !== 0 ? amountOut / amountIn : 0;
      } else {
        rate = amountOut !== 0 ? amountIn / amountOut : 0;
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
import { createSlice } from "@reduxjs/toolkit";

export const tokens = createSlice({
  name: 'tokens',
  initialState: {
    contracts: [], // Will store all 7 token instances
    symbols: [],   // Array of strings corresponding to Coin enum indexing [0..6]
    balances: {}   // Structured: { [tokenAddress]: "balanceString" }
  },
  reducers: {
    setContracts: (state, action) => {
      state.contracts = action.payload
    },
    setSymbols: (state, action) => {
      state.symbols = action.payload
    },
    tokenBalanceLoaded: (state, action) => {
      const { tokenAddress, balance } = action.payload
      state.balances[tokenAddress] = balance
    }
  }
});

export const { setContracts, setSymbols, tokenBalanceLoaded } = tokens.actions
export default tokens.reducer

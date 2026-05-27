import { useEffect, useState } from 'react'
import { useDispatch , useSelector} from 'react-redux'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Container } from 'react-bootstrap'
import { ethers } from 'ethers'

// Components
import Navigation from './Navigation'
// import Loading from './Loading'
import Tabs from './Tabs'
import Swap from './Swap'
import Deposit from './Deposit'
import Withdraw from './Withdraw'
import Charts from './Charts'

// ABIs: Import your contract ABIs here
// import TOKEN_ABI from '../abis/Token.json'

// Config: Import your network config here
// import config from '../config.json';


import {
  loadProvider,
  loadNetwork,
  loadAccount,
  loadTokens,
  loadNMN,
  loadAllPoolsAndBalances
} from '../store/interactions'

function App() {
  const dispatch = useDispatch()

  const account = useSelector(state => state.provider.account) || '0x0'

  const loadBlockchainData = async () => {
    // Initiate provider & network
    const provider = await loadProvider(dispatch)
    const chainId = await loadNetwork(provider, dispatch)
  
    
    // Initiate contracts
    const tokens = await loadTokens(provider, chainId, dispatch)
    const nmn = await loadNMN(provider, chainId, dispatch)

    const currentAccount = await loadAccount(dispatch)

    await loadAllPoolsAndBalances(
      nmn, 
      tokens, 
      currentAccount, // Works even if null (e.g. user hasn't connected wallet yet)
      dispatch
    )

    // Reload page when network changes
    window.ethereum.on('chainChanged', () => {
      window.location.reload()
    })

    // Fetch current account from Metamask when changed
    window.ethereum.on('accountsChanged', async () => {
      console.log('accountsChanged')
      const newAccount = await loadAccount(dispatch)
      
      //Re-fetch pool user balances if they switch wallets
      if(nmn && tokens) {
        await loadAllPoolsAndBalances(nmn, tokens, newAccount, dispatch)
      }
    })
  }

  useEffect(() => {
    loadBlockchainData()
  },[dispatch] );

  return (
    <Container>
      <HashRouter>

        <Navigation />

        <hr/>

        

        <Routes>
         
        </Routes>
      </HashRouter>
    </Container>
  )
}

export default App;

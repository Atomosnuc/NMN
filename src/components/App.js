import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
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
  // loadTokens,
  // loadNMN
} from '../store/interactions'

function App() {
  const dispatch = useDispatch()

  let account ='0x0'

  const loadBlockchainData = async () => {
    // Initiate provider
    const provider = await loadProvider(dispatch)
    const chainId = await loadNetwork(provider, dispatch)
  
    // Reload page when network changes
    window.ethereum.on('chainChanged', () => {
      window.location.reload()
    })

    // Fetch current account from Metamask when changed
    window.ethereum.on('accountsChanged', async () => {
      console.log('accountsChanged')
      await loadAccount(dispatch)
    })
    

  
  }

  useEffect(() => {
    loadBlockchainData()
  } );

  return(
    <Container>

        <Navigation account={account}/>

        <hr />

       

     
    </Container>
  )
}

export default App;

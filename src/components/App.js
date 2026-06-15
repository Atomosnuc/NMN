import { useEffect, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Container } from 'react-bootstrap'

// Components
import Navigation from './Navigation'
import Tabs from './Tabs'
import Swap from './Swap'
import Deposit from './Deposit'
import Withdraw from './Withdraw'
import Charts from './Charts'

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

  const providerConnection = useSelector(state => state.provider.connection)
  // Handlers

  const loadBlockchainData = useCallback(async () => {
    try {
      // Initiate provider & network
      const provider = await loadProvider(providerConnection, dispatch)
      const chainId = await loadNetwork(provider, dispatch)

      // Initiate contracts
      const tokens = await loadTokens(provider, chainId, dispatch)
      const nmn = await loadNMN(provider, chainId, dispatch)

      // Load account
      const currentAccount = await loadAccount(dispatch)

      // Loads pools and Balances
      await loadAllPoolsAndBalances(nmn, tokens, currentAccount, dispatch)
    } catch (error) {
      console.error("Failed to load blockchain data:", error)
      // Optional: Dispatch an error state to Redux to show a friendly UI alert
    }
  }, [providerConnection, dispatch])

  const chainChangedHandler = useCallback(() => {
    window.location.reload()
  }, [])

  const accountsChangedHandler = useCallback(async () => {
    console.log('accountsChanged triggered')
    await loadBlockchainData()
  }, [loadBlockchainData])

  useEffect(() => {
    loadBlockchainData()

    if (window.ethereum) {
      // Force remove any old or dangling handlers left behind by previous dev-refreshes
      window.ethereum.removeListener('chainChanged', chainChangedHandler)
      window.ethereum.removeListener('accountsChanged', accountsChangedHandler)

      // 2. Attach clean, fresh listeners safely
      window.ethereum.on('chainChanged', chainChangedHandler)
      window.ethereum.on('accountsChanged', accountsChangedHandler)
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('chainChanged', chainChangedHandler)
        window.ethereum.removeListener('accountsChanged', accountsChangedHandler)
      }
    }
  }, [loadBlockchainData, chainChangedHandler, accountsChangedHandler])

  return (
    <Container>
      <HashRouter>

        <Navigation />

        <hr />

        <Tabs />

        <Routes>
          <Route exact path='/' element={<Swap />} />
          <Route path='/deposit' element={<Deposit />} />
          <Route path='/withdraw' element={<Withdraw />} />
          <Route path='/charts' element={<Charts />} />
        </Routes>
      </HashRouter>
    </Container>
  )
}

export default App;

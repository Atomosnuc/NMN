import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import DropdownButton from 'react-bootstrap/DropdownButton';
import DropdownItem from 'react-bootstrap/esm/DropdownItem';
import Button from 'react-bootstrap/Button';
import Row from 'react-bootstrap/Row';
import Spinner from 'react-bootstrap/Spinner';
import { ethers } from 'ethers';

import Alert from './Alert';
import { getPoolId } from '../store/reducers/nmn'
import { setSelectedTokenA, setSelectedTokenB } from '../store/reducers/nmn'
import { addLiquidity, loadAllPoolsAndBalances } from '../store/interactions'

const Deposit = () => {
  const dispatch = useDispatch()

  const tokenIndex0 = useSelector(state => state.nmn.selectedTokenA)
  const tokenIndex1 = useSelector(state => state.nmn.selectedTokenB)

  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')
  
  // New state to hold the estimated shares to be minted
  const [estimatedShares, setEstimatedShares] = useState('0.00')

  const [showAlert, setShowAlert] = useState(false)

  const provider = useSelector(state => state.provider.connection)
  const account = useSelector(state => state.provider.account)

  const tokens = useSelector(state => state.tokens.contracts)
  const symbols = useSelector(state => state.tokens.symbols)
  const balances = useSelector(state => state.tokens.balances)

  const nmn = useSelector(state => state.nmn.contract)
  const poolData = useSelector(state => state.nmn.poolData)
  const isDepositing = useSelector(state => state.nmn.depositing.isDepositing)
  const isSuccess = useSelector(state => state.nmn.depositing.isSuccess)
  const transactionHash = useSelector(state => state.nmn.depositing.transactionHash)

  const amountHandler = async (e) => {
    const targetId = e.target.id
    const value = e.target.value
    
    
    if (tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1) {
      window.alert("Please pick two distinct tokens before entering amounts.")
      return
    }

    if (!value || isNaN(value) || Number(value) === 0) {
      setAmount0('')
      setAmount1('')
      return
    }

    try {
      const parsedAmount = ethers.utils.parseUnits(value, 'ether')

      if (targetId === 'token0Input') {
        setAmount0(value)
        const result = await nmn.calculateLiquidityAmount(tokenIndex0, tokenIndex1, parsedAmount)
        setAmount1(ethers.utils.formatUnits(result, 'ether'))
      } else {
        setAmount1(value)
        const result = await nmn.calculateLiquidityAmount(tokenIndex1, tokenIndex0, parsedAmount)
        setAmount0(ethers.utils.formatUnits(result, 'ether'))
      }
    } catch (error) {
      if (targetId === 'token0Input') {
        setAmount0(value)
      } else {
        setAmount1(value)
      }
    }
  }

  // Hook to calculate expected LP shares whenever amounts or pairs adjust
  useEffect(() => {
    if (tokenIndex0 === null || tokenIndex1 === null || !amount0 || Number(amount0) === 0) {
      setEstimatedShares('0.00')
      return
    }

    const poolId = getPoolId(tokenIndex0, tokenIndex1)
    const pool = poolData[poolId]

    // Condition A: If the pool does not exist or has no shares yet, user receives the default 100 baseline shares
    if (!pool || !pool.exists || Number(pool.totalShares) === 0 || Number(pool.reserve0) === 0) {
      setEstimatedShares('100.0000')
    } else {
      // Condition B: Pool has liquidity. Replicate contract logic: (totalShares * coin0Amount) / reserve0
      // We safely normalize order based on index sorting since reserve0 matches the lower token index
      const inputAmount0 = Number(tokenIndex0) < Number(tokenIndex1) ? Number(amount0) : Number(amount1)
      const calculatedShares = (Number(pool.totalShares) * inputAmount0) / Number(pool.reserve0)
      
      setEstimatedShares(calculatedShares.toFixed(4))
    }
  }, [amount0, amount1, tokenIndex0, tokenIndex1, poolData])

  const depositHandler = async (e) => {
    e.preventDefault()
    setShowAlert(false)

    if (tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1) {
      window.alert('Invalid Token Selection')
      return
    }

    await addLiquidity(
      provider,
      nmn,
      tokens[tokenIndex0],
      tokens[tokenIndex1],
      tokenIndex0,
      amount0,
      tokenIndex1,
      amount1,
      dispatch
    )

    await loadAllPoolsAndBalances(nmn, tokens, account, dispatch)
    
    setAmount0('')
    setAmount1('')
    setEstimatedShares('0.00')
    setShowAlert(true)
  }

  const getBalance0 = () => {
    if (tokenIndex0 === null || !tokens[tokenIndex0]) return '0'
    return balances[tokens[tokenIndex0].address] || '0'
  }

  const getBalance1 = () => {
    if (tokenIndex1 === null || !tokens[tokenIndex1]) return '0'
    return balances[tokens[tokenIndex1].address] || '0'
  }

  const userBalance0 = Number(getBalance0())
  const userBalance1 = Number(getBalance1())
  
  const typedAmount0 = Number(amount0)
  const typedAmount1 = Number(amount1)

  const isInsufficient0 = typedAmount0 > userBalance0
  const isInsufficient1 = typedAmount1 > userBalance1
  const isAnyInsufficient = isInsufficient0 || isInsufficient1

  const getButtonText = () => {
    if (isInsufficient0) return `Insufficient ${symbols[tokenIndex0]} Balance`
    if (isInsufficient1) return `Insufficient ${symbols[tokenIndex1]} Balance`
    return "Deposit Liquidity"
  }

  return (
    <div>
      <Card style={{ maxWidth: '450px' }} className='mx-auto px-4 shadow-sm'>
        {account ? (
          <Form onSubmit={depositHandler} style={{ maxWidth: '450px', margin: '30px auto' }}>

            {/* TOKEN 0 FIELD */}
            <Row className='my-3'>
              <div className='d-flex justify-content-between'>
                <Form.Label><strong>Token A Amount:</strong></Form.Label>
                <Form.Text className={isInsufficient0 ? "text-danger fw-bold" : "text-muted"}>
                  Balance: {userBalance0.toFixed(4)}
                </Form.Text>
              </div>
              <InputGroup>
                <Form.Control
                  type="number"
                  placeholder="0.0"
                  min="0.0"
                  step="any"
                  id="token0Input"
                  onChange={amountHandler}
                  value={amount0}
                  disabled={tokenIndex0 === null}
                  className={isInsufficient0 ? "is-invalid" : ""}
                />
                <DropdownButton
                  variant='outline-secondary'
                  title={tokenIndex0 !== null ? symbols[tokenIndex0] : "Select Token"}
                >
                  {symbols.map((symbol, index) => (
                    <DropdownItem key={index} onClick={() => { dispatch(setSelectedTokenA(index)); setAmount0(''); setAmount1(''); }}>
                      {symbol}
                    </DropdownItem>
                  ))}
                </DropdownButton>
              </InputGroup>
            </Row>

            {/* TOKEN 1 FIELD */}
            <Row className='my-4'>
              <div className='d-flex justify-content-between'>
                <Form.Label><strong>Token B Amount:</strong></Form.Label>
                <Form.Text className={isInsufficient1 ? "text-danger fw-bold" : "text-muted"}>
                  Balance: {userBalance1.toFixed(4)}
                </Form.Text>
              </div>
              <InputGroup>
                <Form.Control
                  type="number"
                  placeholder="0.0"                  
                  step="any"
                  id="token1Input"
                  onChange={amountHandler}
                  value={amount1}
                  disabled={tokenIndex1 === null}
                  className={isInsufficient1 ? "is-invalid" : ""}
                />
                <DropdownButton
                  variant='outline-secondary'
                  title={tokenIndex1 !== null ? symbols[tokenIndex1] : "Select Token"}
                >
                  {symbols.map((symbol, index) => (
                    <DropdownItem key={index} onClick={() => { dispatch(setSelectedTokenB(index)); setAmount0(''); setAmount1(''); }}>
                      {symbol}
                    </DropdownItem>
                  ))}
                </DropdownButton>
              </InputGroup>
            </Row>

            {/* SUBMIT BUTTON & PREVIEW DATA OVERLAYS */}
            <Row className='my-3 px-2'>
              {isDepositing ? (
                <Spinner animation='border' style={{display: 'block', margin: '0 auto'}} />
              ) : (
                <Button 
                  type='submit' 
                  variant={isAnyInsufficient ? "secondary" : "primary"}
                  disabled={
                    tokenIndex0 === null || 
                    tokenIndex1 === null || 
                    tokenIndex0 === tokenIndex1 || 
                    !amount0 || 
                    isAnyInsufficient
                  }
                >
                  {getButtonText()}
                </Button>
              )}

              {/* Dynamic LP Share Output Summary Box */}
              <div className="mt-3 bg-light p-3 rounded text-muted small border border-light">
                <div className="d-flex justify-content-between align-items-center">
                  <span>Estimated LP Shares to Receive:</span>
                  <span className="fw-bold text-success font-monospace fs-6">
                    {estimatedShares} Shares
                  </span>
                </div>
              </div>
            </Row>
          </Form>
        ) : (
          <div className='d-flex align-items-center justify-content-center' style={{ height: '300px' }}>
            <p className='text-muted'>Please connect your wallet.</p>
          </div>
        )}
      </Card>
      
      {isDepositing ? (
        <Alert message={'Deposit Pending...'} transactionHash={null} variant={'info'} setShowAlert={setShowAlert} />
      ) : isSuccess && showAlert ? (
        <Alert message={'Deposit Successful'} transactionHash={transactionHash} variant={'success'} setShowAlert={setShowAlert} />
      ) : !isSuccess && showAlert ? (
        <Alert message={'Deposit Failed'} transactionHash={null} variant={'danger'} setShowAlert={setShowAlert} />
      ) : null}
    </div>
  );
}

export default Deposit;

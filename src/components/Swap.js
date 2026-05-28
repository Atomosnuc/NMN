import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import DropdownButton from 'react-bootstrap/DropdownButton';
import Button from 'react-bootstrap/Button';
import Row from 'react-bootstrap/Row';
import Spinner from 'react-bootstrap/Spinner';
import DropdownItem from 'react-bootstrap/esm/DropdownItem';
import { ethers } from 'ethers';

import Alert from './Alert'
import { getPoolId } from '../store/reducers/nmn'
import { executeSwap, loadAllPoolsAndBalances } from '../store/interactions';

import switchIcon from '../SwitchIcon.png'

const Swap = () => {
  const [inputIndex, setInputIndex] = useState(null)
  const [outputIndex, setOutputIndex] = useState(null)
  
  const [inputAmount, setInputAmount] = useState('')
  const [outputAmount, setOutputAmount] = useState('')
  
  const [estimatedFee, setEstimatedFee] = useState('0')
  const [estimatedSlippage, setEstimatedSlippage] = useState('0')

  const [price, setPrice] = useState(0)
  const [showAlert, setShowAlert] = useState(false)

  const provider = useSelector(state => state.provider.connection)
  const account = useSelector(state => state.provider.account)

  const tokens = useSelector(state => state.tokens.contracts)
  const symbols = useSelector(state => state.tokens.symbols)
  const balances = useSelector(state => state.tokens.balances)

  const nmn = useSelector(state => state.nmn.contract)
  const poolData = useSelector(state => state.nmn.poolData)
  const isSwapping = useSelector(state => state.nmn.swapping.isSwapping)
  const isSuccess = useSelector(state => state.nmn.swapping.isSuccess)
  const transactionHash = useSelector(state => state.nmn.swapping.transactionHash)

  const dispatch = useDispatch()

  const fetchLiveQuote = async (targetInputIndex, targetOutputIndex, targetAmount) => {
  if (!targetAmount || isNaN(targetAmount) || Number(targetAmount) === 0) {
    setOutputAmount('')
    setEstimatedFee('0')
    setEstimatedSlippage('0')
    return
  }
  if (targetInputIndex === null || targetOutputIndex === null || targetInputIndex === targetOutputIndex) {
    return
  }

  try {
    const parsedAmount = ethers.utils.parseUnits(targetAmount, 'ether')
    const result = await nmn.calculateAmountOut(targetInputIndex, targetOutputIndex, parsedAmount)
    
    setOutputAmount(ethers.utils.formatUnits(result.amountOut, 'ether'))
    setEstimatedFee(ethers.utils.formatUnits(result.feeAmount, 'ether'))
    
    const formattedSlippage = (Number(result.slippage.toString()) / 100).toFixed(2)
    setEstimatedSlippage(formattedSlippage)
  } catch (error) {
    console.error("Calculation failed:", error)
    setOutputAmount('0')
    setEstimatedFee('0')
    setEstimatedSlippage('0')
  }
}

  const inputHandler = (e) => {
  setInputAmount(e.target.value)
}

const switchTokens = () => {
  // Swap indices
  const tempIndex = inputIndex;
  setInputIndex(outputIndex);
  setOutputIndex(tempIndex);

  // Swap input amount with what WAS the output amount
  setInputAmount(outputAmount);
}

  const swapHandler = async (e) => {
    e.preventDefault()
    setShowAlert(false)

    if (inputIndex === null || outputIndex === null || inputIndex === outputIndex) {
      window.alert('Invalid Token Pair')
      return
    }

    await executeSwap(
      provider,
      nmn,
      tokens[inputIndex],
      inputIndex,
      outputIndex,
      inputAmount,
      dispatch
    )

    await loadAllPoolsAndBalances(nmn, tokens, account, dispatch)
    
    setInputAmount('')
    setOutputAmount('')
    setEstimatedFee('0')
    setEstimatedSlippage('0')
    setShowAlert(true)
  }

  const updatePrice = () => {
    if (inputIndex === null || outputIndex === null || inputIndex === outputIndex) {
      setPrice(0)
      return
    }

    const poolId = getPoolId(inputIndex, outputIndex)
    const pool = poolData[poolId]

    if (!pool || !pool.exists || Number(pool.reserve0) === 0 || Number(pool.reserve1) === 0) {
      setPrice("No Liquidity Available")
      return
    }

    if (Number(inputIndex) < Number(outputIndex)) {
      setPrice(Number(pool.reserve1) / Number(pool.reserve0))
    } else {
      setPrice(Number(pool.reserve0) / Number(pool.reserve1))
    }
  }

  useEffect(() => {
  // 1. Instantly update the spot exchange rate text
  updatePrice()

  // 2. Fetch live fee/slippage quote from your smart contract
  if (nmn && inputIndex !== null && outputIndex !== null) {
    fetchLiveQuote(inputIndex, outputIndex, inputAmount)
  }
}, [inputIndex, outputIndex, inputAmount, poolData, nmn])

  const getInputBalance = () => {
    if (inputIndex === null || !tokens[inputIndex]) return '0'
    return balances[tokens[inputIndex].address] || '0'
  }

  const getOutputBalance = () => {
    if (outputIndex === null || !tokens[outputIndex]) return '0'
    return balances[tokens[outputIndex].address] || '0'
  }

  // Helper variables to handle safety validations
  const userBalance = Number(getInputBalance())
  const typedAmount = Number(inputAmount)
  const isInsufficientBalance = typedAmount > userBalance
  const isNoLiquidity = price === "No Liquidity Available"

  // Determine button text dynamically based on the form's health state
  const getButtonText = () => {
    if (isNoLiquidity) return "No Liquidity Available"
    if (isInsufficientBalance) return "Insufficient Balance"
    return "Swap"
  }

  return (
    <div>
      <Card style={{ maxWidth: '450px' }} className='mx-auto px-4 shadow-sm'>
        {account ? (
          <Form onSubmit={swapHandler} style={{ maxWidth: '450px', margin: '30px auto' }}>
            
            {/* INPUT BLOCK */}
            <Row className='my-3'>
              <div className='d-flex justify-content-between'>
                <Form.Label><strong>Input:</strong></Form.Label>
                <Form.Text className={isInsufficientBalance ? "text-danger fw-bold" : "text-muted"}>
                  Balance: {getInputBalance()}
                </Form.Text>
              </div>
              <InputGroup>
                <Form.Control 
                  type='number'
                  placeholder='0.0'
                  min='0.0'
                  step='any'
                  value={inputAmount}
                  onChange={inputHandler}
                  disabled={inputIndex === null}
                  className={isInsufficientBalance ? "is-invalid" : ""}
                />
                <DropdownButton
                  variant='outline-secondary'
                  title={inputIndex !== null ? symbols[inputIndex] : "Select Token"}
                >
                  {symbols.map((symbol, index) => (
                    <DropdownItem key={index} onClick={() => { setInputIndex(index); setInputAmount(''); setOutputAmount(''); setEstimatedFee('0'); setEstimatedSlippage('0'); }}>
                      {symbol}
                    </DropdownItem>
                  ))}
                </DropdownButton>
              </InputGroup>
            </Row>

            {/* DYNAMIC TOKEN SWITCH ICON BUTTON */}
            <div className="d-flex justify-content-center my-2 position-relative" style={{ zIndex: 2 }}>
              <Button
                type="button"
                variant="light"
                onClick={switchTokens}
                disabled={inputIndex === null && outputIndex === null}
                className="rounded-circle shadow-sm border border-light p-2 d-flex align-items-center justify-content-center"
                style={{ 
                  width: '50px', 
                  height: '50px', 
                  marginTop: '-15px', 
                  marginBottom: '-15px',
                  transition: 'transform 0.2s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
              >
                <img 
                  src={switchIcon} 
                  alt="Switch Tokens" 
                  style={{ width: '20px', height: '20px', objectFit: 'contain' }} 
                />
              </Button>
            </div>

            {/* OUTPUT BLOCK */}
            <Row className='my-4'>
              <div className='d-flex justify-content-between'>
                <Form.Label><strong>Output:</strong></Form.Label>
                <Form.Text muted>Balance: {getOutputBalance()}</Form.Text>
              </div>
              <InputGroup>
                <Form.Control 
                  type='number'
                  placeholder='0.0'
                  value={outputAmount}
                  disabled
                />
                <DropdownButton
                  variant='outline-secondary'
                  title={outputIndex !== null ? symbols[outputIndex] : "Select Token"}
                >
                  {symbols.map((symbol, index) => (
                    <DropdownItem key={index} onClick={() => { setOutputIndex(index); setInputAmount(''); setOutputAmount(''); setEstimatedFee('0'); setEstimatedSlippage('0'); }}>
                      {symbol}
                    </DropdownItem>
                  ))}
                </DropdownButton>
              </InputGroup>
            </Row>

            {/* SUBMIT BUTTON & LIVE DATA OVERLAYS */}
            <Row className='my-3 px-2'>
              {isSwapping ? (
                <Spinner animation='border' style={{display: 'block', margin: '0 auto'}} />
              ) : (
                <Button 
                  type='submit' 
                  variant={isInsufficientBalance || isNoLiquidity ? "secondary" : "primary"}
                  disabled={
                    inputIndex === outputIndex || 
                    !inputAmount || 
                    isInsufficientBalance || 
                    isNoLiquidity
                  }
                >
                  {getButtonText()}
                </Button>
              )}
              
              {/* Live Metric Data Box */}
              <div className="mt-3 bg-light p-3 rounded text-muted small border border-light">
                <div className="d-flex justify-content-between mb-1">
                  <span>Exchange Rate:</span>
                  <span className={`fw-bold ${isNoLiquidity ? 'text-danger' : 'text-dark'}`}>
                    {typeof price === 'number' ? price.toFixed(6) : price}
                  </span>
                </div>
                
                <div className="d-flex justify-content-between mb-1">
                  <span>Estimated Fee:</span>
                  <span className="fw-bold text-dark">
                    {inputIndex !== null ? `${Number(estimatedFee).toFixed(6)} ${symbols[inputIndex]}` : '0.00'}
                  </span>
                </div>

                <div className="d-flex justify-content-between">
                  <span>Price Slippage:</span>
                  <span className={`fw-bold ${Number(estimatedSlippage) > 2.0 ? 'text-danger' : 'text-success'}`}>
                    {isNoLiquidity ? '0.00%' : `${estimatedSlippage}%`}
                  </span>
                </div>
              </div>

            </Row>
          </Form>
        ) : (
          <div className='d-flex align-items-center justify-content-center' style={{height: '300px'}}>
            <p className='text-muted'>Please connect your wallet.</p>
          </div>
        )}
      </Card>

      {/* ALERT MODALS */}
      {isSwapping ? (
        <Alert message={'Swap Pending...'} transactionHash={null} variant={'info'} setShowAlert={setShowAlert} />
      ) : isSuccess && showAlert ? (
        <Alert message={'Swap Successful'} transactionHash={transactionHash} variant={'success'} setShowAlert={setShowAlert} />
      ) : !isSuccess && showAlert ? (
        <Alert message={'Swap Failed'} transactionHash={null} variant={'danger'} setShowAlert={setShowAlert} />
      ) : null}
    </div>
  );
}

export default Swap;

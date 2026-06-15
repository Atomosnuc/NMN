import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Card from 'react-bootstrap/Card'
import Form from 'react-bootstrap/Form'
import InputGroup from 'react-bootstrap/InputGroup'
import DropdownButton from 'react-bootstrap/DropdownButton'
import DropdownItem from 'react-bootstrap/esm/DropdownItem'
import Button from 'react-bootstrap/Button'
import Row from 'react-bootstrap/Row'
import Spinner from 'react-bootstrap/Spinner'
import { ethers } from 'ethers'

import Alert from './Alert'
import { getPoolId } from '../store/reducers/nmn'
import { setSelectedTokenA, setSelectedTokenB } from '../store/reducers/nmn'
import { removeLiquidity, loadAllPoolsAndBalances, loadAllLiquidityEvents } from '../store/interactions'
import { liquidityPerformanceSelector } from '../store/selectors'

// --- UNIFORM DE-SCALING UTILITY ---
const parseNum = (rawVal) => {
  if (rawVal === undefined || rawVal === null || rawVal === '') return 0;
  const valStr = rawVal.toString().trim();
  if (valStr.includes('.')) return Number(valStr)
  try {
    return Number(ethers.utils.formatEther(valStr))
  } catch {
    const parsed = Number(valStr)
    return isNaN(parsed) ? 0 : parsed
  }
};

const Withdraw = () => {
  const dispatch = useDispatch()

  const tokenIndex0 = useSelector(state => state.nmn.selectedTokenA)
  const tokenIndex1 = useSelector(state => state.nmn.selectedTokenB)

  const [amount, setAmount] = useState('')
  const [estToken0, setEstToken0] = useState('0.0')
  const [estToken1, setEstToken1] = useState('0.0')
  const [showAlert, setShowAlert] = useState(false)

  // --- CORE DECENTRALIZED DATA SELECTORS ---
  const provider = useSelector(state => state.provider.connection)
  const account = useSelector(state => state.provider.account)
  const tokens = useSelector(state => state.tokens.contracts)
  const symbols = useSelector(state => state.tokens.symbols)

  const nmn = useSelector(state => state.nmn.contract)
  const poolData = useSelector(state => state.nmn.poolData)
  const isWithdrawing = useSelector(state => state.nmn.withdrawing.isWithdrawing)
  const isSuccess = useSelector(state => state.nmn.withdrawing.isSuccess)
  const transactionHash = useSelector(state => state.nmn.withdrawing.transactionHash)

  // --- TRIGGER THE BACKGROUND EVENTS RE-CACHE ---
  useEffect(() => {
    if (provider && nmn) {
      loadAllLiquidityEvents(provider, nmn, dispatch)
    }
  }, [provider, nmn, isSuccess, dispatch])

  // --- THE UNIFIED CORE METRICS SELECTOR ---
  const userGrowthData = useSelector(state =>
    liquidityPerformanceSelector(state)
  )

  // Extract the active user shares balance for validation layout
  const getActivePoolShares = () => {
    if (tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1) return '0'
    const poolId = getPoolId(tokenIndex0, tokenIndex1)
    return poolData[poolId]?.userShares || '0'
  }

  // --- ESTIMATED OUTPUT GENERATOR ---
  useEffect(() => {
    const fetchEstimates = async () => {
      if (!amount || isNaN(amount) || Number(amount) === 0 || tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1) {
        setEstToken0('0.0')
        setEstToken1('0.0')
        return
      }

      try {
        const parsedShares = ethers.utils.parseUnits(amount.toString(), 'ether')
        const results = await nmn.calculateWithdrawAmount(tokenIndex0, tokenIndex1, parsedShares)

        setEstToken0(parseNum(results.coin0Amount).toString())
        setEstToken1(parseNum(results.coin1Amount).toString())
      } catch (error) {
        console.error("Failed to estimate withdrawal outputs:", error)
        setEstToken0('0.0')
        setEstToken1('0.0')
      }
    }

    fetchEstimates()
  }, [amount, tokenIndex0, tokenIndex1, nmn])

  // --- LIQUIDITY TRANSACTION EXECUTION ACTION ---
  const withdrawHandler = async (e) => {
    e.preventDefault()
    setShowAlert(false)

    if (tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1) {
      window.alert('Invalid pool selection.')
      return
    }

    const availableShares = parseNum(getActivePoolShares())
    const typedShares = Number(amount)
    if (typedShares > availableShares) {
      window.alert('Insufficient shares balance to execute withdrawal.')
      return
    }

    try {
      await removeLiquidity(
        provider,
        nmn,
        tokenIndex0,
        tokenIndex1,
        amount,
        dispatch
      )

      await loadAllPoolsAndBalances(nmn, tokens, account, dispatch)
      setShowAlert(true)
    } catch (error) {
      console.error("Execution failed within liquidity withdrawal sequence:", error)
    } finally {
      setAmount('')
    }
  }

  const maxSharesHandler = () => {
    const totalAvailable = getActivePoolShares()
    const numericShares = parseNum(totalAvailable)

    // 3. Update the state. If no shares, default the input to '0'
    if (numericShares > 0) {
      setAmount(numericShares.toString())
    } else {
      setAmount('0')
    }
  }

  // --- SAFETY VALIDATION ENGINE ---
  const availableShares = parseNum(getActivePoolShares())
  const typedShares = Number(amount)
  const isInsufficientShares = typedShares > availableShares && amount !== ''

  const getButtonText = () => {
    if (isInsufficientShares) {
      return "Insufficient Shares Balance"
    }
    return "Withdraw Liquidity"
  }

  return (
    <div>
      <Card style={{ maxWidth: '450px' }} className='mx-auto px-4 shadow-sm'>
        {account ? (
          <Form onSubmit={withdrawHandler} style={{ maxWidth: '450px', margin: '30px auto' }}>

            {/* POOL SELECTORS */}
            <Row className='mb-3'>
              <Form.Label><strong>Select Liquidity Pool Pair:</strong></Form.Label>
              <div className='d-flex gap-2 justify-content-between'>
                <DropdownButton
                  variant='outline-secondary'
                  className='w-50'
                  title={tokenIndex0 !== null ? symbols[tokenIndex0] : "Token A"}
                >
                  {symbols.map((symbol, index) => (
                    <DropdownItem key={index} onClick={() => { dispatch(setSelectedTokenA(index)); setAmount(''); }}>
                      {symbol}
                    </DropdownItem>
                  ))}
                </DropdownButton>

                <DropdownButton
                  variant='outline-secondary'
                  className='w-50'
                  title={tokenIndex1 !== null ? symbols[tokenIndex1] : "Token B"}
                >
                  {symbols.map((symbol, index) => (
                    <DropdownItem key={index} onClick={() => { dispatch(setSelectedTokenB(index)); setAmount(''); }}>
                      {symbol}
                    </DropdownItem>
                  ))}
                </DropdownButton>
              </div>
            </Row>

            {/* SHARES AMOUNT INPUT */}
            <Row className='my-3'>
              <div className='d-flex justify-content-between'>
                <Form.Label><strong>Shares to Remove:</strong></Form.Label>
                <Form.Text className={isInsufficientShares ? "text-danger fw-bold" : "text-muted"}>
                  Your Pool Shares: {(availableShares || 0).toFixed(4)}
                </Form.Text>
              </div>
              <InputGroup>
                <Form.Control
                  type="number"
                  placeholder="0.0"
                  min="0.0"
                  step="any"
                  id="shares"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1}
                  className={isInsufficientShares ? "is-invalid" : ""}
                />
                {/* MAX BUTTON*/}
                {tokenIndex0 !== null && tokenIndex1 !== null && tokenIndex0 !== tokenIndex1 && availableShares > 0 && (
                  <Button
                    variant="outline-secondary"
                    type="button"
                    onClick={maxSharesHandler}
                    style={{ fontWeight: 'bold', fontSize: '0.85rem' }}
                  >
                    MAX
                  </Button>
                )}
                <InputGroup.Text style={{ width: "100px" }} className='justify-content-center'>
                  Shares
                </InputGroup.Text>
              </InputGroup>
            </Row>

            {/* SUBMIT BUTTON */}
            <Row className='my-3 px-2'>
              {isWithdrawing ? (
                <Spinner animation='border' style={{ display: 'block', margin: '0 auto' }} />
              ) : (
                <Button
                  type='submit'
                  variant={isInsufficientShares ? "secondary" : "primary"}
                  disabled={
                    tokenIndex0 === null ||
                    tokenIndex1 === null ||
                    tokenIndex0 === tokenIndex1 ||
                    !amount ||
                    isInsufficientShares
                  }
                >
                  {getButtonText()}
                </Button>
              )}
            </Row>

            {/* --- LIVE OFF-CHAIN V PERFORMANCE DASHBOARD PANEL --- */}
            {(tokenIndex0 !== null && tokenIndex1 !== null && tokenIndex0 !== tokenIndex1) && (
              <>
                <hr />
                <Row className='px-2 my-2'>
                  <div className='p-3 border rounded style-none' style={{ backgroundColor: '#f8f9fa' }}>
                    <h6 className='text-primary mb-3 fw-bold'>📈 Liquidity Value per Share (V) Performance</h6>
                    {!userGrowthData ? (
                      <div className='text-center py-2'>
                        <Spinner animation='border' size='sm' className='me-2' />
                        <small className='text-muted'>Calculating entry metrics...</small>
                      </div>
                    ) : !userGrowthData || userGrowthData.trackedUserV === 0 ? (
                      <div className='text-center py-2'>
                        <small className='text-muted'>You have no shares in this pool</small>
                      </div>
                    ) :
                      (
                        <>
                          <div className='d-flex justify-content-between mb-2 small'>
                            <span className='text-muted'>Your Entry Weighted V:</span>
                            <span className='font-monospace fw-bold'>{userGrowthData.trackedUserV ? userGrowthData.trackedUserV.toFixed(4) : '0.0000'}</span>
                          </div>
                          <div className='d-flex justify-content-between mb-2 small'>
                            <span className='text-muted'>Current Live Pool V:</span>
                            <span className='font-monospace fw-bold'>{userGrowthData.livePoolV ? userGrowthData.livePoolV.toFixed(4) : '0.0000'}</span>
                          </div>
                          <div className='d-flex justify-content-between border-top pt-2 mt-2'>
                            <span className='fw-bold text-muted small'>Accrued Fee Gains:</span>
                            <span className='text-success font-monospace fw-bold'>+{userGrowthData.roiPercentage}</span>
                          </div>
                        </>
                      )}
                  </div>
                </Row>
              </>
            )}

            {/* ESTIMATED RETURN FEEDBACK DETAILS */}
            {(tokenIndex0 !== null && tokenIndex1 !== null && tokenIndex0 !== tokenIndex1) && (
              <>
                <hr />
                <Row className='px-2'>
                  <h6 className='text-muted mb-3'>Estimated Tokens To Receive:</h6>
                  <p className='d-flex justify-content-between mb-2'>
                    <span><strong>{symbols[tokenIndex0]} Returned:</strong></span>
                    <span className="text-success font-monospace fw-bold">{(Number(estToken0) || 0).toFixed(4)}</span>
                  </p>
                  <p className='d-flex justify-content-between'>
                    <span><strong>{symbols[tokenIndex1]} Returned:</strong></span>
                    <span className="text-success font-monospace fw-bold">{(Number(estToken1) || 0).toFixed(4)}</span>
                  </p>
                </Row>
              </>
            )}

          </Form>
        ) : (
          <div className='d-flex align-items-center justify-content-center' style={{ height: '300px' }}>
            <p className='text-muted'>Please connect your wallet.</p>
          </div>
        )}
      </Card>

      {/* TRANSACTION STATE MODALS */}
      {isWithdrawing ? (
        <Alert message={'Withdraw Pending...'} transactionHash={null} variant={'info'} setShowAlert={setShowAlert} />
      ) : isSuccess && showAlert ? (
        <Alert message={'Withdraw Successful'} transactionHash={transactionHash} variant={'success'} setShowAlert={setShowAlert} />
      ) : !isSuccess && showAlert ? (
        <Alert message={'Withdraw Failed'} transactionHash={null} variant={'danger'} setShowAlert={setShowAlert} />
      ) : null}
    </div>
  )
}

export default Withdraw

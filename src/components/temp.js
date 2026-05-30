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
import { removeLiquidity, loadAllPoolsAndBalances } from '../store/interactions'

// --- GEOMETRIC SHARE-WEIGHTED ROLLING AVERAGE COMPUTATION LAYER ---
function calculateUserOffChainGrowth(historyEvents, currentPoolSqrtK) {
  let userShares = ethers.BigNumber.from(0);
  let userSqrtK = 0;

  const sortedEvents = [...historyEvents].sort((a, b) => Number(a.timestamp - b.timestamp));

  for (const event of sortedEvents) {
    if (event.type === 'LiquidityAdded') {
      // Safely parse the string to a BigNumber
      const mintedShares = ethers.BigNumber.from(event.shareAmountMinted);
      const poolSqrtK = Number(event.currentSqrtK);

      // Check if userShares is zero using .isZero()
      if (userShares.isZero()) {
        userSqrtK = poolSqrtK;
        userShares = mintedShares;
      } else {
        // Convert to Number safely for the floating-point logarithm math
        const oldSharesNum = Number(ethers.utils.formatEther(userShares));
        const mintedSharesNum = Number(ethers.utils.formatEther(mintedShares));
        const totalNewSharesNum = oldSharesNum + mintedSharesNum;

        const logAvg = ((oldSharesNum * Math.log(userSqrtK)) + (mintedSharesNum * Math.log(poolSqrtK))) / totalNewSharesNum;
        userSqrtK = Math.exp(logAvg);
        
        // Add BigNumbers using .add()
        userShares = userShares.add(mintedShares);
      }
    } 
    else if (event.type === 'LiquidityRemoved') {
      const sharesRemaining = ethers.BigNumber.from(event.userSharesRemaining);
      
      if (sharesRemaining.isZero()) {
        userShares = ethers.BigNumber.from(0);
        userSqrtK = 0;
      } else {
        userShares = sharesRemaining;
      }
    }
  }

  let growthFactor = 0;
  if (userSqrtK > 0) {
    growthFactor = Number(currentPoolSqrtK) / userSqrtK;
  }

  return {
    trackedUserSqrtK: userSqrtK,
    roiPercentage: growthFactor > 0 ? ((growthFactor - 1) * 100).toFixed(2) + "%" : "0%"
  };
}

const Withdraw = () => {
  const dispatch = useDispatch()

  const [tokenIndex0, setTokenIndex0] = useState(null)
  const [tokenIndex1, setTokenIndex1] = useState(null)

  const [amount, setAmount] = useState('')
  const [estToken0, setEstToken0] = useState('0.0')
  const [estToken1, setEstToken1] = useState('0.0')
  const [showAlert, setShowAlert] = useState(false)

  // --- LOCAL TRACKING STATES ---
  const [userGrowthData, setUserGrowthData] = useState({ trackedUserSqrtK: 0, livePoolSqrtK: 0, roiPercentage: '0%' })
  const [loadingMetrics, setLoadingMetrics] = useState(false)

  const provider = useSelector(state => state.provider.connection)
  const account = useSelector(state => state.provider.account)

  const tokens = useSelector(state => state.tokens.contracts)
  const symbols = useSelector(state => state.tokens.symbols)

  const nmn = useSelector(state => state.nmn.contract)
  const poolData = useSelector(state => state.nmn.poolData)
  const isWithdrawing = useSelector(state => state.nmn.withdrawing.isWithdrawing)
  const isSuccess = useSelector(state => state.nmn.withdrawing.isSuccess)
  const transactionHash = useSelector(state => state.nmn.withdrawing.transactionHash)

  // Extract the active user shares balance for the specifically selected token pair combination
  const getActivePoolShares = () => {
    if (tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1) return '0'
    const poolId = getPoolId(tokenIndex0, tokenIndex1)
    return poolData[poolId]?.userShares || '0'
  }

  // --- LIVE EVENT CRAWLER LOOP ---
  useEffect(() => {
    const fetchUserGrowthMetrics = async () => {
      if (tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1 || !nmn || !account) {
        setUserGrowthData({ trackedUserSqrtK: 0, livePoolSqrtK: 0, roiPercentage: '0%' })
        return
      }

      try {
        setLoadingMetrics(true)

        // 1. Fetch the latest live pool state from the contract view function
        const poolInfo = await nmn.getPoolState(tokenIndex0, tokenIndex1)
        const liveSqrtK = poolInfo.sqrtK.toString()

        // 2. Setup standard indexed filters targeted exclusively at the connected user account
        const addFilter = nmn.filters.LiquidityAdded(account)
        const removeFilter = nmn.filters.LiquidityRemoved(account)

        // Query historical blocks from deployment (0) up to latest execution states
        const addLogs = await nmn.queryFilter(addFilter, 0, 'latest')
        const removeLogs = await nmn.queryFilter(removeFilter, 0, 'latest')

        // 3. Format into a structured, linear processing data array
        const formattedAdd = addLogs.map(log => ({
          type: 'LiquidityAdded',
          shareAmountMinted: log.args.shareAmountMinted.toString(),
          currentSqrtK: log.args.currentSqrtK.toString(),
          timestamp: log.args.timestamp
        }))

        const formattedRemove = removeLogs.map(log => ({
          type: 'LiquidityRemoved',
          userSharesRemaining: log.args.userSharesRemaining.toString(),
          timestamp: log.args.timestamp
        }))

        const fullHistory = [...formattedAdd, ...formattedRemove]

        // 4. Calculate performance factors off-chain on-the-fly
        const metrics = calculateUserOffChainGrowth(fullHistory, liveSqrtK)
        
        setUserGrowthData({
          trackedUserSqrtK: metrics.trackedUserSqrtK,
          livePoolSqrtK: Number(liveSqrtK),
          roiPercentage: metrics.roiPercentage
        })
      } catch (error) {
        console.error("Failed to compile user entry metrics history logs:", error)
      } finally {
        setLoadingMetrics(false)
      }
    }

    fetchUserGrowthMetrics()
  }, [tokenIndex0, tokenIndex1, nmn, account, isSuccess]) // Re-runs on successful withdraw transactions to balance records

  // Calculate estimated outputs on input changes using the contract view layer
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
        
        setEstToken0(ethers.utils.formatUnits(results.coin0Amount, 'ether'))
        setEstToken1(ethers.utils.formatUnits(results.coin1Amount, 'ether'))
      } catch (error) {
        console.error("Failed to estimate withdrawal outputs:", error)
        setEstToken0('0.0')
        setEstToken1('0.0')
      }
    }

    fetchEstimates()
  }, [amount, tokenIndex0, tokenIndex1, nmn])

  const withdrawHandler = async (e) => {
    e.preventDefault()
    setShowAlert(false)

    if (tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1) {
      window.alert('Invalid pool selection.')
      return
    }

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
    setAmount('')
  }

  // --- SAFETY VALIDATION ENGINE ---
  const availableShares = Number(getActivePoolShares())
  const typedShares = Number(amount)
  const isInsufficientShares = typedShares > availableShares

  // Determine button text dynamically based on validation checks
  const getButtonText = () => {
    if (isInsufficientShares) return "Insufficient Shares Balance"
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
                    <DropdownItem key={index} onClick={() => { setTokenIndex0(index); setAmount(''); }}>
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
                    <DropdownItem key={index} onClick={() => { setTokenIndex1(index); setAmount(''); }}>
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
                  Your Pool Shares: {availableShares.toFixed(4)}
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
                <InputGroup.Text style={{ width: "100px" }} className='justify-content-center'>
                  Shares
                </InputGroup.Text>
              </InputGroup>
            </Row>

            {/* SUBMIT BUTTON */}
            <Row className='my-3 px-2'>
              {isWithdrawing ? (
                <Spinner animation='border' style={{display: 'block', margin: '0 auto'}} />
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

            {/* --- LIVE OFF-CHAIN SQRT(K) PERFORMANCE DASHBOARD PANEL --- */}
            {(tokenIndex0 !== null && tokenIndex1 !== null && tokenIndex0 !== tokenIndex1) && (
              <>
                <hr />
                <Row className='px-2 my-2'>
                  <div className='p-3 border rounded style-none' style={{ backgroundColor: '#f8f9fa' }}>
                    <h6 className='text-primary mb-3 fw-bold'>📈 Pool Value Performance</h6>
                    {loadingMetrics ? (
                      <div className='text-center py-2'>
                        <Spinner animation='border' size='sm' className='me-2' />
                        <small className='text-muted'>Calculating entry metrics...</small>
                      </div>
                    ) : (
                      <>
                        <div className='d-flex justify-content-between mb-2 small'>
                          <span className='text-muted'>Your Entry Weighted √K:</span>
                          <span className='font-monospace fw-bold'>{userGrowthData.trackedUserSqrtK ? userGrowthData.trackedUserSqrtK.toFixed(4) : '0.0000'}</span>
                        </div>
                        <div className='d-flex justify-content-between mb-2 small'>
                          <span className='text-muted'>Current Live Pool √K:</span>
                          <span className='font-monospace fw-bold'>{userGrowthData.livePoolSqrtK ? userGrowthData.livePoolSqrtK.toFixed(4) : '0.0000'}</span>
                        </div>
                        <div className='d-flex justify-content-between border-top pt-2 mt-2'>
                          <span className='fw-bold text-muted small'>Accrued Fee Gains:</span>
                          <span className='text-success font-monospace fw-bold'>+{userGrowthData.roiPercentage}</span>
                        </div>
                        <div className='mt-2 text-center'>
                          <small style={{ fontSize: '10px' }} className='text-muted d-block'>
                            * Measures structural growth of your shares driven by collected trading swap fees.
                          </small>
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
                    <span className="text-success font-monospace fw-bold">{Number(estToken0).toFixed(4)}</span>
                  </p>
                  <p className='d-flex justify-content-between'>
                    <span><strong>{symbols[tokenIndex1]} Returned:</strong></span> 
                    <span className="text-success font-monospace fw-bold">{Number(estToken1).toFixed(4)}</span>
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
  );
}

export default Withdraw;

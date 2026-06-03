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


// --- GLOBAL DE-SCALING UTILITY (SMART VERSION) ---
const parseNum = (rawVal) => {
  if (rawVal === undefined || rawVal === null || rawVal === '') return 0;

  const valStr = rawVal.toString().trim();

  // If it already contains a decimal point, it is already formatted!
  if (valStr.includes('.')) {
    return Number(valStr);
  }

  // Otherwise, safely treat it as an unscaled 18-decimal blockchain BigNumber string
  try {
    return Number(ethers.utils.formatEther(valStr));
  } catch (error) {
    // Fallback if it is a simple plain string integer (e.g. "100")
    const parsed = Number(valStr);
    return isNaN(parsed) ? 0 : parsed;
  }
};

// --- GEOMETRIC SHARE-WEIGHTED ROLLING AVERAGE COMPUTATION LAYER (ALIGNED SCALE) ---
function calculateUserOffChainGrowth(historyEvents, currentPoolSqrtK) {
  let userShares = 0; 
  let userSqrtK = 0;
  let lastEventPoolSqrtK = 0; // Tracks the absolute latest historical pool snapshot scale

  // Chronological sort using block timestamps
  const sortedEvents = [...historyEvents].sort((a, b) => a.timestamp - b.timestamp);

  for (const event of sortedEvents) {
    if (event.type === 'LiquidityAdded') {
      const mintedSharesNum = parseNum(event.shareAmountMinted);
      const poolSqrtKNum = parseNum(event.currentSqrtK);
      
      lastEventPoolSqrtK = poolSqrtKNum; // Set snapshot

      if (userShares === 0 || userSqrtK === 0) {
        userSqrtK = poolSqrtKNum;
        userShares = mintedSharesNum;
      } else {
        const totalNewSharesNum = userShares + mintedSharesNum;

        // Perform weighted log calculations on cleanly normalized native numbers
        const logAvg = ((userShares * Math.log(userSqrtK)) + (mintedSharesNum * Math.log(poolSqrtKNum))) / totalNewSharesNum;
        userSqrtK = Math.exp(logAvg);
        userShares = totalNewSharesNum;
      }
    } 
    else if (event.type === 'LiquidityRemoved') {
      const sharesRemainingNum = parseNum(event.userSharesRemaining);
      
      if (sharesRemainingNum <= 0) {
        userShares = 0;
        userSqrtK = 0; 
        lastEventPoolSqrtK = 0;
      } else {
        userShares = sharesRemainingNum;
      }
    }
  }

  // ALIGNMENT SAFETY LAYER: If the live pool state scale dropped due to a 
  // frontend parsing bug, fall back to the historical event logs to preserve the scale ratio
  let livePoolSqrtKNum = parseNum(currentPoolSqrtK);
  
  if (livePoolSqrtKNum < (userSqrtK / 2) && lastEventPoolSqrtK > 0) {
    livePoolSqrtKNum = lastEventPoolSqrtK;
  }

  let growthFactor = 0;
  if (userSqrtK > 0) {
    growthFactor = livePoolSqrtKNum / userSqrtK;
  }

  return {
    trackedUserSqrtK: userSqrtK,
    livePoolSqrtK: livePoolSqrtKNum,
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

  const withdrawHandler = async (e) => {
    e.preventDefault()
    setShowAlert(false)

    // 1. Double-check that valid and distinct tokens are selected
    if (tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1) {
      window.alert('Invalid pool selection.')
      return
    }

    // 2. Extra safety check against trying to submit more shares than available
    const availableShares = parseNum(getActivePoolShares())
    const typedShares = Number(amount)
    if (typedShares > availableShares) {
      window.alert('Insufficient shares balance to execute withdrawal.')
      return
    }

    try {
      // 3. Fire the smart contract interaction via Redux action dispatch layer
      await removeLiquidity(
        provider,
        nmn,
        tokenIndex0,
        tokenIndex1,
        amount,
        dispatch
      )

      // 4. Force reload application pools & account balances state on success
      await loadAllPoolsAndBalances(nmn, tokens, account, dispatch)

      // 5. Trigger the custom alert modal layout view
      setShowAlert(true)
    } catch (error) {
      console.error("Execution failed within liquidity withdrawal sequence:", error)
      window.alert("Transaction rejected or failed. View console logs for details.")
    } finally {
      // 6. Flush user input field state values cleanly back to empty defaults
      setAmount('')
    }
  }



  // Extract the active user shares balance for the specifically selected token pair combination
  const getActivePoolShares = () => {
    if (tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1) return '0'
    const poolId = getPoolId(tokenIndex0, tokenIndex1)
    return poolData[poolId]?.userShares || '0'
  }

// --- LIVE EVENT CRAWLER LOOP (ENUM ORDER FIXED) ---
  useEffect(() => {
    const fetchUserGrowthMetrics = async () => {
      if (tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1 || !nmn || !account) {
        setUserGrowthData({ trackedUserSqrtK: 0, livePoolSqrtK: 0, roiPercentage: '0%' })
        return
      }

      try {
        setLoadingMetrics(true)

        // 1. Resolve raw token contract addresses from your state list
        const addr0 = tokens[tokenIndex0].address
        const addr1 = tokens[tokenIndex1].address

        // 2. CRITICAL FIX: Sort by Enum index parameters instead of alphabetical addresses!
        // This ensures frontend lookups match your contract's internal sortCoinsAndAmounts logic.
        const lowEnumIndex = Math.min(tokenIndex0, tokenIndex1);
        const highEnumIndex = Math.max(tokenIndex0, tokenIndex1);

        const sortedAddr0 = tokens[lowEnumIndex].address.toLowerCase();
        const sortedAddr1 = tokens[highEnumIndex].address.toLowerCase();

        // 3. Fetch live pool state and format variables uniformly
        const poolId = `${lowEnumIndex}-${highEnumIndex}`;
        const currentPool = poolData[poolId];
        
        let liveSqrtK = "0";
        if (currentPool && currentPool.reserve0 && currentPool.reserve1) {
          const res0Num = parseNum(currentPool.reserve0);
          const res1Num = parseNum(currentPool.reserve1);
          const calculatedSqrtK = Math.sqrt(res0Num * res1Num);
          liveSqrtK = ethers.utils.parseUnits(calculatedSqrtK.toFixed(18), 'ether').toString();
        }

        // 4. Query filters targeted explicitly at the connected user account
        const addFilter = nmn.filters.LiquidityAdded(account)
        const removeFilter = nmn.filters.LiquidityRemoved(account)

        const addLogs = await nmn.queryFilter(addFilter, 0, 'latest')
        const removeLogs = await nmn.queryFilter(removeFilter, 0, 'latest')

        // 5. Parse and isolate LiquidityAdded events using Enum-sorted parameters
        const formattedAdd = addLogs
          .filter(log => {
            const log0 = log.args.token0.toLowerCase()
            const log1 = log.args.token1.toLowerCase()
            return (log0 === sortedAddr0 && log1 === sortedAddr1)
          })
          .map(log => ({
            type: 'LiquidityAdded',
            shareAmountMinted: log.args.shareAmountMinted.toString(),
            currentSqrtK: log.args.currentSqrtK.toString(),
            timestamp: Number(log.args.timestamp)
          }))

        // 6. Parse and isolate LiquidityRemoved events using Enum-sorted parameters
        const formattedRemove = removeLogs
          .filter(log => {
            const log0 = log.args.token0.toLowerCase()
            const log1 = log.args.token1.toLowerCase()
            return (log0 === sortedAddr0 && log1 === sortedAddr1)
          })
          .map(log => ({
            type: 'LiquidityRemoved',
            userSharesRemaining: log.args.userSharesRemaining.toString(),
            timestamp: Number(log.args.timestamp)
          }))

        const fullHistory = [...formattedAdd, ...formattedRemove]

        // 7. Calculate tracking metrics
        const metrics = calculateUserOffChainGrowth(fullHistory, liveSqrtK)
        
        setUserGrowthData({
          trackedUserSqrtK: metrics.trackedUserSqrtK,
          livePoolSqrtK: metrics.livePoolSqrtK, 
          roiPercentage: metrics.roiPercentage
        })
      } catch (error) {
        console.error("Failed to compile user entry metrics history logs:", error)
      } finally {
        setLoadingMetrics(false)
      }
    }

    fetchUserGrowthMetrics()
  }, [tokenIndex0, tokenIndex1, nmn, account, isSuccess, tokens, poolData])


  // --- ESTIMATED OUTPUT GENERATOR ---
  useEffect(() => {
    const fetchEstimates = async () => {
      // Safety check: Exit cleanly if no valid pool is selected or amount input is empty/zero
      if (!amount || isNaN(amount) || Number(amount) === 0 || tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1) {
        setEstToken0('0.0')
        setEstToken1('0.0')
        return
      }

      try {
        // Convert user input string float to 18-decimal uint256 BigNumber for contract call
        const parsedShares = ethers.utils.parseUnits(amount.toString(), 'ether')
        const results = await nmn.calculateWithdrawAmount(tokenIndex0, tokenIndex1, parsedShares)

        // Clean outputs utilizing your uniform parseNum helper function
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


  // --- SAFETY VALIDATION ENGINE ---
  // Use parseNum on getActivePoolShares string to get native JavaScript numbers for comparison
  const availableShares = parseNum(getActivePoolShares())
  const typedShares = Number(amount)
  const isInsufficientShares = typedShares > availableShares && amount !== ''

  // Determine button text dynamically based on validation checks
  const getButtonText = () => {
    if (isInsufficientShares) {
      return "Insufficient Shares Balance";
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

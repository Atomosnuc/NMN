import { useState } from 'react'
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
import { addLiquidity, loadAllPoolsAndBalances } from '../store/interactions'

const Deposit = () => {
  // Track selected token list indices for the pair
  const [tokenIndex0, setTokenIndex0] = useState(null)
  const [tokenIndex1, setTokenIndex1] = useState(null)

  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')

  const [showAlert, setShowAlert] = useState(false)

  const provider = useSelector(state => state.provider.connection)
  const account = useSelector(state => state.provider.account)

  const tokens = useSelector(state => state.tokens.contracts)
  const symbols = useSelector(state => state.tokens.symbols)
  const balances = useSelector(state => state.tokens.balances)

  const amm = useSelector(state => state.nmn.contract)
  const isDepositing = useSelector(state => state.nmn.depositing.isDepositing)
  const isSuccess = useSelector(state => state.nmn.depositing.isSuccess)
  const transactionHash = useSelector(state => state.nmn.depositing.transactionHash)

  const dispatch = useDispatch()

  const amountHandler = async (e) => {
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

      if (e.target.id === 'token0Input') {
        setAmount0(value)
        // Call contract function: calculateLiquidityAmount(coin0, coin1, coin0Amount)
        const result = await amm.calculateLiquidityAmount(tokenIndex0, tokenIndex1, parsedAmount)
        setAmount1(ethers.utils.formatUnits(result, 'ether'))
      } else {
        setAmount1(value)
        // Call contract function: calculateLiquidityAmount(coin1, coin0, coin1Amount)
        const result = await amm.calculateLiquidityAmount(tokenIndex1, tokenIndex0, parsedAmount)
        setAmount0(ethers.utils.formatUnits(result, 'ether'))
      }
    } catch (error) {
      // If pool has zero liquidity, allow independent initialization deposit amounts
      if (e.target.id === 'token0Input') {
        setAmount0(value)
      } else {
        setAmount1(value)
      }
    }
  }

  const depositHandler = async (e) => {
    e.preventDefault()
    setShowAlert(false)

    if (tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1) {
      window.alert('Invalid Token Selection')
      return
    }

    await addLiquidity(
      provider,
      amm,
      tokens[tokenIndex0],
      tokens[tokenIndex1],
      tokenIndex0,
      amount0,
      tokenIndex1,
      amount1,
      dispatch
    )

    await loadAllPoolsAndBalances(amm, tokens, account, dispatch)
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

  return (
    <div>
      <Card style={{ maxWidth: '450px' }} className='mx-auto px-4 shadow-sm'>
        {account ? (
          <Form onSubmit={depositHandler} style={{ maxWidth: '450px', margin: '30px auto' }}>

            {/* TOKEN 0 FIELD */}
            <Row className='my-3'>
              <div className='d-flex justify-content-between'>
                <Form.Label><strong>Token A Amount:</strong></Form.Label>
                <Form.Text muted>Balance: {getBalance0()}</Form.Text>
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
                />
                <DropdownButton
                  variant='outline-secondary'
                  title={tokenIndex0 !== null ? symbols[tokenIndex0] : "Select Token"}
                >
                  {symbols.map((symbol, index) => (
                    <DropdownItem key={index} onClick={() => { setTokenIndex0(index); setAmount0(''); setAmount1(''); }}>
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
                <Form.Text muted>Balance: {getBalance1()}</Form.Text>
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
                />
                <DropdownButton
                  variant='outline-secondary'
                  title={tokenIndex1 !== null ? symbols[tokenIndex1] : "Select Token"}
                >
                  {symbols.map((symbol, index) => (
                    <DropdownItem key={index} onClick={() => { setTokenIndex1(index); setAmount0(''); setAmount1(''); }}>
                      {symbol}
                    </DropdownItem>
                  ))}
                </DropdownButton>
              </InputGroup>
            </Row>

            <Row className='my-3 px-2'>
              {isDepositing ? (
                <Spinner animation='border' style={{display: 'block', margin: '0 auto'}} />
              ) : (
                <Button type='submit' disabled={tokenIndex0 === null || tokenIndex1 === null || tokenIndex0 === tokenIndex1 || !amount0}>
                  Deposit Liquidity
                </Button>
              )}
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
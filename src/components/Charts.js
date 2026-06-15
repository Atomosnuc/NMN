import { useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Table from 'react-bootstrap/Table'
import Chart from 'react-apexcharts'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import DropdownButton from 'react-bootstrap/DropdownButton'
import DropdownItem from 'react-bootstrap/esm/DropdownItem'
import Card from 'react-bootstrap/Card'

import { options} from './Charts.config'
import { chartSelector } from '../store/selectors'
import { ethers } from 'ethers'

import Loading from './Loading'
import { loadAllSwaps } from '../store/interactions'
import { setSelectedTokenA, setSelectedTokenB } from '../store/reducers/nmn'

const Charts = () => {
  const dispatch = useDispatch()

  // Track the chosen tokens for chart viewing. Defaulting to index 0 (Mirian) and index 1 (Castar)
  const inputIndex = useSelector(state => state.nmn.selectedTokenA)
  const outputIndex = useSelector(state => state.nmn.selectedTokenB)

  const provider = useSelector(state => state.provider.connection)
  const tokens = useSelector(state => state.tokens.contracts)
  const symbols = useSelector(state => state.tokens.symbols)
  const amm = useSelector(state => state.nmn.contract)

  // Pass inputIndex and outputIndex dynamically into our updated chartSelector
  const chart = useSelector(state => chartSelector(state, inputIndex, outputIndex))

  useEffect(() => {
    if (provider && amm) {
      loadAllSwaps(provider, amm, dispatch)
    }
  }, [provider, amm, dispatch])

  // Helper function to find a token symbol by its deployed contract address
  const getTokenSymbol = (tokenAddress) => {
    if (!tokens || tokens.length === 0) return '...'
    const index = tokens.findIndex(t => t.address.toLowerCase() === tokenAddress.toLowerCase())
    return index !== -1 ? symbols[index] : 'UNKNOWN'
  }

  return (
    <div className="my-4">
      {provider && amm && symbols.length > 0 ? (
        <div>
          {/* PAIR SELECTOR CARD */}
          <Card className="p-3 mb-4 shadow-sm border-0 bg-light">
            <Row className="align-items-center justify-content-center text-center">
              <Col xs={12} md={4} className="d-flex justify-content-md-end justify-content-center my-2">
                <DropdownButton
                  variant="outline-primary"
                  title={symbols[inputIndex] ? symbols[inputIndex] : "Select Token A"}
                  className="w-75"
                >
                  {symbols.map((symbol, index) => (
                    <DropdownItem key={index} onClick={() => dispatch(setSelectedTokenA(index))}>
                      {symbol}
                    </DropdownItem>
                  ))}
                </DropdownButton>
              </Col>
              
              <Col xs={12} md={1} className="my-1">
                <span className="text-muted fw-bold">↔</span>
              </Col>

              <Col xs={12} md={4} className="d-flex justify-content-md-start justify-content-center my-2">
                <DropdownButton
                  variant="outline-primary"
                  title={symbols[outputIndex] ? symbols[outputIndex] : "Select Token B"}
                  className="w-75"
                >
                  {symbols.map((symbol, index) => (
                    <DropdownItem key={index} onClick={() => dispatch(setSelectedTokenB(index))}>
                      {symbol}
                    </DropdownItem>
                  ))}
                </DropdownButton>
              </Col>
            </Row>
          </Card>

          {/* APEX CHART VIEW */}
          <div className="bg-white p-3 rounded shadow-sm mb-4">
            <h5 className="text-muted border-bottom pb-2 mb-3">
              {symbols[inputIndex]} / {symbols[outputIndex]} Analytics
            </h5>
            {chart && chart.series && chart.series[0].data.length > 0 ? (
              <Chart
                type="line"
                options={options}
                series={chart.series}
                width="100%"
                height="350px"
              />
            ) : (
              <div className="text-center py-5 text-muted bg-light rounded font-monospace">
                No trades recorded yet for this specific pair matrix.
              </div>
            )}
          </div>

          <hr className="my-4" />

          {/* HISTORICAL TABLE METRICS */}
          <h4 className="mb-3">Recent Pool Trades</h4>
          <Table striped bordered hover responsive className="align-middle text-center shadow-sm">
            <thead className="table-dark">
              <tr>
                <th>Transaction Hash</th>
                <th>Token In</th>
                <th>Amount In</th>
                <th>Token Out</th>
                <th>Amount Out</th>
                <th>User</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {chart && chart.swaps && chart.swaps.length > 0 ? (
                chart.swaps.map((swap, index) => (
                  <tr key={index}>
                    <td className="font-monospace text-primary">
                      {swap.hash.slice(0, 6) + '...' + swap.hash.slice(-4)}
                    </td>
                    <td>
                      <span className="badge bg-secondary px-2 py-1.5">{getTokenSymbol(swap.args.tokenIn)}</span>
                    </td>
                    <td className="fw-bold text-danger">
                      -{Number(ethers.utils.formatUnits(swap.args.amountIn, 'ether')).toFixed(4)}
                    </td>
                    <td>
                      <span className="badge bg-success px-2 py-1.5">{getTokenSymbol(swap.args.tokenOut)}</span>
                    </td>
                    <td className="fw-bold text-success">
                      +{Number(ethers.utils.formatUnits(swap.args.amountOut, 'ether')).toFixed(4)}
                    </td>
                    <td className="font-monospace text-muted">
                      {swap.args.user.slice(0, 6) + '...' + swap.args.user.slice(-4)}
                    </td>
                    <td className="text-muted small">
                      {new Date(Number(swap.args.timestamp.toString() + '000'))
                        .toLocaleDateString(
                          undefined,
                          {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          }
                        )
                      }
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-muted">
                    No matching swaps found on-chain.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      ) : (
        <Loading />
      )}
    </div>
  );
}

export default Charts;
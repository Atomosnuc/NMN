//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "./Token.sol";
import "./Ownable.sol";

// import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract NMN is Ownable {

  enum Coin { mirian, castar, tharni, pony, penny, brass, copper }

  Token[] public tokens;

  uint256 constant PRECISION = 10**18;
  uint256 public constant DEFAULT_FEE = 30;
  uint256 public constant FEE_DENOMINATOR = 10000 ;

  struct Pool {
    uint256 reserve0;
    uint256 reserve1;
    uint256 K;
    uint256 totalShares;
    bool exists;
  }

  mapping(Coin => mapping(Coin => Pool)) public pools;
  mapping(Coin => mapping(Coin => mapping(address => uint256))) public userShares;

  event Swap(
    address indexed user,
    address indexed tokenIn,
    address indexed tokenOut,
    uint256 amountIn,
    uint256 amountOut,
    uint256 feeAmount,
    uint256 currentReserve0,
    uint256 currentReserve1,
    uint256 timestamp
  );

  event PoolInitialized(
    address indexed token0,
    address indexed token1
  );

  event LiquidityAdded(
    address indexed user,
    address indexed token0,
    address indexed token1,
    uint256 token0AmountAdded,
    uint256 token1AmountAdded,
    uint256 shareAmountMinted,
    uint256 currentReserve0,
    uint256 currentReserve1,
    uint256 currentTotalShares,
    uint256 timestamp
  );

  event LiquidityRemoved(
    address indexed user,
    address indexed token0,
    address indexed token1,
    uint256 token0AmountRemoved,
    uint256 token1AmountRemoved,
    uint256 shareAmountRemoved,
    uint256 currentReserve0,
    uint256 currentReserve1,
    uint256 currentTotalShares,
    uint256 timestamp
  );

  error IdenticalTokens();
  error ZeroAmount();
  error PoolDoesNotExist();
  error ZeroLiquidity();
  error notEnoughLiquidity();

  constructor(Token[] memory _tokens) {
    for (uint i = 0; i < _tokens.length ; i++) {
      tokens.push(_tokens[i]);
    }
    // pools[Coin(0)][Coin(1)]= Pool(0 ,0, 0, 0, true);
  }

  // SORTING FUNCTIONS

  function sortCoins( Coin _coin0, Coin _coin1)
    public pure returns (Coin coin0, Coin coin1)
  {
    if (_coin0 == _coin1) revert IdenticalTokens();
    return (_coin0 < _coin1 ? (_coin0, _coin1) : (_coin1, _coin0));
  }

  function sortCoinsAndAmounts(
    Coin _coin0, Coin _coin1, uint256 _coin0Amount, uint256 _coin1Amount
  ) internal pure returns (
    Coin coin0, Coin coin1, uint256 coin0Amount, uint256 coin1Amount
  )
  {
    if (_coin0 == _coin1) revert IdenticalTokens();
    if (_coin0 < _coin1) {
      return (_coin0, _coin1, _coin0Amount, _coin1Amount);
    } else {
      return (_coin1, _coin0, _coin1Amount, _coin0Amount);
    }
  }

  // VIEW FUNCTIONS

  function getUserShares(Coin _coin0 , Coin _coin1, address user) 
    public view returns(uint256)
  {
    (Coin coin0, Coin coin1) = sortCoins(_coin0, _coin1);
    return (userShares[coin0][coin1][user]);
  }

  function getPoolState(Coin _coin0 , Coin _coin1) 
    public view returns(Pool memory) 
  {
    (Coin coin0, Coin coin1) = sortCoins(_coin0, _coin1);
  
    return (pools[coin0][coin1]);
  }

  // CALCULATE FUNCTIONS
  
  function calculateLiquidityAmount(Coin _coin0, Coin _coin1,  uint256 _coin0Amount)
    public view returns(uint256 coin1Amount) {
    if (_coin0Amount == 0) revert ZeroAmount();

    (Coin coin0, Coin coin1) = sortCoins(_coin0,_coin1);
    Pool storage pool = pools[coin0][coin1];
    if (!pool.exists) revert PoolDoesNotExist();

    if (pool.totalShares == 0) revert ZeroLiquidity();

    if (_coin0 == coin0) {
      coin1Amount = (_coin0Amount * pools[coin0][coin1].reserve1) / pools[coin0][coin1].reserve0;
    } else {
      coin1Amount = (_coin0Amount * pools[coin0][coin1].reserve0) / pools[coin0][coin1].reserve1;
    }
  }

  function calculateAmountOut(Coin _coinIn, Coin _coinOut, uint256 _amountIn)
    public view returns (uint256 amountOut, uint256 feeAmount, uint256 slippage)
  {
    if (_amountIn == 0) revert ZeroAmount();

    // Sort coins to choose the right pool
    (Coin coin0 ,Coin coin1) = sortCoins(_coinIn, _coinOut);
    Pool storage pool = pools[coin0][coin1];
    if (!pool.exists) revert();

    // Choose which reserve coresponds to which coin
    (uint256 reserveIn, uint256 reserveOut) = (_coinIn == coin0)
      ? (pool.reserve0, pool.reserve1)
      : (pool.reserve1, pool.reserve0);
  
    if (reserveIn <= 0 || reserveOut <= 0 ) revert notEnoughLiquidity();

    // Calculate no Fee Output (No Fee,  with Slippage)
    uint256 pureAmountOut = (_amountIn * reserveOut) / (reserveIn + _amountIn);

    // Calculate Current spot-price Output (with Fee but without Slippage)
    uint256 spotNumerator = _amountIn * ( FEE_DENOMINATOR - DEFAULT_FEE ) * reserveOut;
    uint256 spotDenominator = reserveIn * FEE_DENOMINATOR;
    uint256 spotAmountOut = spotNumerator / spotDenominator;

    // Calculate Actual Output ( with fees and slippage)
    uint256 amountInAfterFee = _amountIn * ( FEE_DENOMINATOR - DEFAULT_FEE );
    uint256 numerator = amountInAfterFee * reserveOut;
    uint256 denominator =  reserveIn * FEE_DENOMINATOR  +  amountInAfterFee;
    amountOut = numerator /denominator;

    if (amountOut == reserveOut) {
      amountOut--;
    }

    // Calculate Fee cost 
    feeAmount =  pureAmountOut > amountOut ? pureAmountOut - amountOut : 0;

    // Calculate Slippage ( every 100 slippage is 1% lost price  (Spot-Actual)/Spot )

    if(spotAmountOut > amountOut) {
      uint256 slippageLoss = spotAmountOut - amountOut;
      slippage = (slippageLoss * 10000) / spotAmountOut;
    } else {
      slippage = 0;
    }

  }

  function calculateWithdrawAmount(Coin _coin0, Coin _coin1, uint256 _shareAmount)
  public view returns(uint256 coin0Amount, uint256 coin1Amount)
  {
    (Coin coin0, Coin coin1) = sortCoins(_coin0, _coin1);
    Pool storage pool = pools[coin0][coin1];

    require (_shareAmount <= pool.totalShares,
    "Amount of share to be removed must be less than totalshares");

    if (_shareAmount != pool.totalShares) {
      coin0Amount = (_shareAmount * pool.reserve0) / pool.totalShares;
      coin1Amount = (_shareAmount * pool.reserve1) / pool.totalShares;
    } else {
      coin0Amount = pool.reserve0;
      coin1Amount = pool.reserve1;
    }
    
  }

  // POOL FUNCTIONS

  function initializePool(Coin _coin0, Coin _coin1) external onlyOwner {
    (Coin coin0 ,Coin coin1) = sortCoins(_coin0, _coin1);

    Pool storage pool = pools[coin0][coin1];
    require(!pool.exists, "Pool already registered");

    pool.exists = true;

    Token token0 = Token(tokens[uint256(coin0)]);
    Token token1 = Token(tokens[uint256(coin1)]);
    emit PoolInitialized(address(token0), address(token1));
  }


  function addLiquidity(Coin _coin0, uint256 _coin0Amount, Coin _coin1, uint256 _coin1Amount)
    external
  {
    // sort everything
    (
      Coin coin0, Coin coin1, uint256 coin0Amount, uint256 coin1Amount
    ) = sortCoinsAndAmounts(_coin0, _coin1 , _coin0Amount, _coin1Amount);

    Token token0 = Token(tokens[uint256(coin0)]);
    Token token1 = Token(tokens[uint256(coin1)]);

    // Deposit Tokens
    require(
      token0.transferFrom(msg.sender, address(this), coin0Amount),
      string(abi.encodePacked("failed to transfer ", token0.name()))
    );
    require(
      token1.transferFrom(msg.sender, address(this), coin1Amount),
      string(abi.encodePacked("failed to transfer ", token1.name()))
    );

    Pool storage pool = pools[coin0][coin1];

    //Calculate shares to Mint
    uint256 sharesToMint;
    if (pool.totalShares != 0) {
      uint256 share1 = (pool.totalShares * coin0Amount) / pool.reserve0;
      uint256 share2 = (pool.totalShares * coin1Amount) / pool.reserve1;
      require(
        (share1 / 10**3) == (share2 / 10**3),
        "must provide equal token amounts"
      );
      sharesToMint = share1;
    } else {
      sharesToMint = 100 * PRECISION;
    }

    //  Manage pool
    pool.reserve0 += coin0Amount;
    pool.reserve1 += coin1Amount;
    pool.K = pool.reserve0 * pool.reserve1;
    pool.totalShares += sharesToMint;
    userShares[coin0][coin1][msg.sender] += sharesToMint;

    emit LiquidityAdded(
      msg.sender,
      address(token0),
      address(token1),
      coin0Amount,
      coin1Amount,
      sharesToMint,
      pool.reserve0,
      pool.reserve1,
      pool.totalShares,
      block.timestamp
    );
  }

  function removeLiquidity(Coin _coin0, Coin _coin1, uint256 _shareAmount)
    external returns(uint256 coin0Amount, uint256 coin1Amount)
  {
    
    (Coin coin0, Coin coin1) = sortCoins(_coin0, _coin1);
    require(
      _shareAmount <= userShares[coin0][coin1][msg.sender],
      "Cannot withdraw more shares than you own"
    );
    
    (coin0Amount, coin1Amount) = calculateWithdrawAmount( coin0, coin1, _shareAmount);
    
    // updates user shares
    userShares[coin0][coin1][msg.sender] -= _shareAmount;

    //update pool
    Pool storage pool = pools[coin0][coin1];
    pool.totalShares -= _shareAmount;

    pool.reserve0 -= coin0Amount;
    pool.reserve1 -= coin1Amount;
    pool.K = pool.reserve0 * pool.reserve1;

    // trasfer tokens
    Token token0 = Token(tokens[uint256(coin0)]);
    Token token1 = Token(tokens[uint256(coin1)]);

    require(token0.transfer(msg.sender, coin0Amount),
    string(abi.encodePacked("failed to transfer ", token0.name())));
    require(token1.transfer(msg.sender, coin1Amount),
    string(abi.encodePacked("failed to transfer ", token1.name())));

    emit LiquidityRemoved(
      msg.sender,
      address(token0),
      address(token1),
      coin0Amount,
      coin1Amount,
      _shareAmount,
      pool.reserve0,
      pool.reserve1,
      pool.totalShares,
      block.timestamp
    );
  }

  // SWAP FUNCTION

  function swap(Coin _coinIn, Coin _coinOut, uint256 _coinInAmount)
    external returns(uint256 coinOutAmount) 
  {
    // Calculate coin1Amount
    uint256 feeAmount;
    (coinOutAmount, feeAmount, ) = calculateAmountOut(_coinIn, _coinOut, _coinInAmount);
    
    (Coin coin0, Coin coin1) = sortCoins(_coinIn, _coinOut);
    Pool storage pool = pools[coin0][coin1];

    Token tokenIn = Token(tokens[uint256(_coinIn)]);
    Token tokenOut = Token(tokens[uint256(_coinOut)]);

    // Do swap
    // 1. transfer _coinIn out of user wallet to contract
    require(
      tokenIn.transferFrom(msg.sender, address(this), _coinInAmount),
      string(abi.encodePacked("failed to transfer ", tokenIn.name()))
    );
    
    // 2. update pool
    if (_coinIn == coin0) {
      pool.reserve0 += _coinInAmount;
      pool.reserve1 -= coinOutAmount;
    } else {
      pool.reserve1 += _coinInAmount;
      pool.reserve0 -= coinOutAmount;
    }
    pool.K = pool.reserve0 * pool.reserve1;

    // 3. transfer _coinOut from contract to user wallet
    require(
      tokenOut.transfer(msg.sender, coinOutAmount),
      string(abi.encodePacked("failed to transfer ", tokenOut.name()))
    );

    emit Swap(
      msg.sender,
      address(tokenIn),
      address(tokenOut),
      _coinInAmount,
      coinOutAmount,
      feeAmount,
      pool.reserve0,
      pool.reserve1,
      block.timestamp
    );
  }
}

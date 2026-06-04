//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "./Token.sol";
import "./Ownable.sol";

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract NMN is Ownable {
  using Math for uint256;

  enum Coin { mirian, castar, tharni, pony, penny, brass, copper }

  Token[] public tokens;

  uint256 constant PRECISION = 10**18;
  uint256 public constant DEFAULT_FEE = 30;
  uint256 public constant FEE_DENOMINATOR = 10000 ;

  struct Pool {
    uint256 reserve0;
    uint256 reserve1;
    uint256 sqrtK;
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
    uint256 currentSqrtK,
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
    uint256 currentSqrtK,
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
    uint256 userSharesRemaining,
    uint256 timestamp
  );

  error IdenticalTokens();
  error ZeroAmount();
  error PoolDoesNotExist();
  error ZeroLiquidity();
  error notEnoughLiquidity();
  error InvariantViolated();

  constructor(Token[] memory _tokens) {
    for (uint i = 0; i < _tokens.length ; i++) {
      tokens.push(_tokens[i]);
    }
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

  function sqrt(uint256 y) internal pure returns (uint256 z) {
    if (y > 3) {
      z = y;
      uint256 x = y / 2 + 1;
      while (x < z) {
        z = x;
        x = (y / x + x) / 2;
      }
    } else if (y != 0) {
      z = 1;
    }
    // If y == 0,  returns z = 0
  }
  
  function calculateLiquidityAmount(Coin _coin0, Coin _coin1,  uint256 _coin0Amount)
    public view returns(uint256 coin1Amount) 
  {
    if (_coin0Amount == 0) revert ZeroAmount();

    (Coin coin0, Coin coin1) = sortCoins(_coin0,_coin1);
    Pool storage pool = pools[coin0][coin1];

    if (!pool.exists) revert PoolDoesNotExist();
    if (pool.totalShares == 0) revert ZeroLiquidity();

    if (_coin0 == coin0) {
      coin1Amount = _coin0Amount.mulDiv(pool.reserve1, pool.reserve0);
    } else {
      coin1Amount = _coin0Amount.mulDiv(pool.reserve0, pool.reserve1);
    }
  }

  function calculateAmountOut(Coin _coinIn, Coin _coinOut, uint256 _amountIn)
    public view returns (uint256 amountOut, uint256 feeAmount, uint256 slippage)
  {
    if (_amountIn == 0) revert ZeroAmount();

    (Coin coin0 ,Coin coin1) = sortCoins(_coinIn, _coinOut);
    Pool storage pool = pools[coin0][coin1];
    if (!pool.exists) revert PoolDoesNotExist();

    // Choose which reserve coresponds to which coin
    (uint256 reserveIn, uint256 reserveOut) =
    (_coinIn == coin0) ? (pool.reserve0, pool.reserve1) : (pool.reserve1, pool.reserve0);

    if (reserveIn <= 0 || reserveOut <= 0 ) revert notEnoughLiquidity();

    // 1. Calculate Fee Cost removed from  _amountIn
    feeAmount = _amountIn.mulDiv(DEFAULT_FEE, FEE_DENOMINATOR);

    // 2. Calculate Actual Output (with fee deducted from entry capital)
    // calculated as amountInWithFee * reserveOut) / (reserveIn + amountInWithFee)
    uint256 amountInAfterFee = _amountIn - feeAmount; 
    amountOut = amountInAfterFee.mulDiv(reserveOut, reserveIn + amountInAfterFee);
    if (amountOut >= reserveOut) revert notEnoughLiquidity();

    // 3. Calculate Slippage (Spot price output vs Actual output)
    // Spot Amount Out (No Slippage) = (amountInAfterFee * reserveOut) / reserveIn
    uint256 spotAmountOut = amountInAfterFee.mulDiv(reserveOut, reserveIn);
    if (spotAmountOut > amountOut) {
      uint256 slippageLoss = spotAmountOut - amountOut;
      slippage = slippageLoss.mulDiv(10000, spotAmountOut);
    } else {
      slippage = 0;
    }

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

    if (!pool.exists) revert PoolDoesNotExist();

    uint256 totalShares = pool.totalShares;
    require (_shareAmount <= totalShares,
    "Amount of share to be removed must be less than totalshares");

    if (_shareAmount != totalShares) {
      coin0Amount = _shareAmount.mulDiv(pool.reserve0, totalShares);
      coin1Amount = _shareAmount.mulDiv(pool.reserve1, totalShares);
    } else {
      coin0Amount = pool.reserve0;
      coin1Amount = pool.reserve1;
    }
  }

  // POOL & Liquidity functions

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

    Pool storage pool = pools[coin0][coin1];
    if (!pool.exists) revert PoolDoesNotExist();

    // Calculate shares to Mint
    uint256 sharesToMint;
    {
      Token token0 = Token(tokens[uint256(coin0)]);
      Token token1 = Token(tokens[uint256(coin1)]);

      // Deposit Tokens
      require(token0.transferFrom(msg.sender, address(this), coin0Amount),
      string(abi.encodePacked("failed to transfer ", token0.name())));
      require(token1.transferFrom(msg.sender, address(this), coin1Amount),
      string(abi.encodePacked("failed to transfer ", token1.name())));

      uint256 currentTotalShares = pool.totalShares;

      if (currentTotalShares != 0) {
        uint256 share1 = currentTotalShares.mulDiv(coin0Amount, pool.reserve0);
        uint256 share2 = currentTotalShares.mulDiv(coin1Amount, pool.reserve1);
        
        require(
          (share1 / 10**3) == (share2 / 10**3),
          "must provide equal token amounts"
        );
        sharesToMint = share1;
      } else {
        sharesToMint = 100 * PRECISION;
      }
    }

    // Update pool and user shares storage
    pool.reserve0 += coin0Amount;
    pool.reserve1 += coin1Amount;
    pool.sqrtK = (pool.reserve0 * pool.reserve1).sqrt();
    pool.totalShares += sharesToMint;

    userShares[coin0][coin1][msg.sender] += sharesToMint;

    emit LiquidityAdded(
      msg.sender,
      address(tokens[uint256(coin0)]),
      address(tokens[uint256(coin1)]),
      coin0Amount,
      coin1Amount,
      sharesToMint,
      pool.reserve0,
      pool.reserve1,
      pool.totalShares,
      pool.sqrtK,
      block.timestamp
    );
  }

  function removeLiquidity(Coin _coin0, Coin _coin1, uint256 _shareAmount)
    external returns(uint256 coin0Amount, uint256 coin1Amount)
  {
    if (_shareAmount == 0) revert ZeroAmount();
    (Coin coin0, Coin coin1) = sortCoins(_coin0, _coin1);

    Pool storage pool = pools[coin0][coin1];
    if (!pool.exists) revert PoolDoesNotExist();

    uint256 currentUserShares = userShares[coin0][coin1][msg.sender];
    require(
      _shareAmount <= userShares[coin0][coin1][msg.sender],
      "Cannot withdraw more shares than you own"
    );
    
    (coin0Amount, coin1Amount) = calculateWithdrawAmount( coin0, coin1, _shareAmount);
    
    // updates user shares
    uint256 remainingUserShares = currentUserShares - _shareAmount;
    userShares[coin0][coin1][msg.sender] = remainingUserShares;

    //update pool
    {
      pool.totalShares -= _shareAmount;
      pool.reserve0 -= coin0Amount;
      pool.reserve1 -= coin1Amount;
      pool.sqrtK = (pool.reserve0 * pool.reserve1).sqrt();
    }
    
    // token declarations
    Token token0 = Token(tokens[uint256(coin0)]);
    Token token1 = Token(tokens[uint256(coin1)]);

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
      remainingUserShares,
      block.timestamp
    );

    require(token0.transfer(msg.sender, coin0Amount),
    string(abi.encodePacked("failed to transfer ", token0.name())));
    require(token1.transfer(msg.sender, coin1Amount),
    string(abi.encodePacked("failed to transfer ", token1.name())));
  }

  // SWAP FUNCTION

  function swap(Coin _coinIn, Coin _coinOut, uint256 _coinInAmount)
    external returns(uint256 coinOutAmount) 
  {
    (Coin coin0, Coin coin1) = sortCoins(_coinIn, _coinOut);
    Pool storage pool = pools[coin0][coin1];
    if (!pool.exists) revert PoolDoesNotExist();
    
    uint256 feeAmount;
    (coinOutAmount, feeAmount, ) = calculateAmountOut(_coinIn, _coinOut, _coinInAmount);

    Token tokenIn = Token(tokens[uint256(_coinIn)]);
    Token tokenOut = Token(tokens[uint256(_coinOut)]);

    // transfer _coinIn from user wallet to contract
    require(tokenIn.transferFrom(msg.sender, address(this), _coinInAmount),
    string(abi.encodePacked("failed to transfer ", tokenIn.name())));

    // Local execution scope block
    uint256 newSqrtK;
    {
      uint256 res0 = pool.reserve0;
      uint256 res1 = pool.reserve1;
      uint256 sqrtKBefore = pool.sqrtK;

      if (_coinIn == coin0) {
        res0 += _coinInAmount;
        res1 -= coinOutAmount;
      } else {
        res1 += _coinInAmount;
        res0 -= coinOutAmount;
      }      

      // update pool sqrtK
      newSqrtK = (res0 * res1).sqrt();
      if (newSqrtK < sqrtKBefore) revert InvariantViolated();

      // up date pool
      pool.reserve0 = res0;
      pool.reserve1 = res1;
      pool.sqrtK = newSqrtK;
    }

    emit Swap(
      msg.sender,
      address(tokenIn),
      address(tokenOut),
      _coinInAmount,
      coinOutAmount,
      feeAmount,
      pool.reserve0,
      pool.reserve1,
      newSqrtK,
      block.timestamp
    );

    // transfer _coinOut from contract to user wallet
    require(tokenOut.transfer(msg.sender, coinOutAmount),
    string(abi.encodePacked("failed to transfer ", tokenOut.name())));


    // // Calculate coin1Amount
    // uint256 feeAmount;
    // (coinOutAmount, feeAmount, ) = calculateAmountOut(_coinIn, _coinOut, _coinInAmount);
    
    // (Coin coin0, Coin coin1) = sortCoins(_coinIn, _coinOut);
    // Pool storage pool = pools[coin0][coin1];

    // Token tokenIn = Token(tokens[uint256(_coinIn)]);
    // Token tokenOut = Token(tokens[uint256(_coinOut)]);

    // // Do swap
    // // 1. transfer _coinIn out of user wallet to contract
    // require(
    //   tokenIn.transferFrom(msg.sender, address(this), _coinInAmount),
    //   string(abi.encodePacked("failed to transfer ", tokenIn.name()))
    // );

    // // 2. make sure sure sqrtK does not gets smaller
    // uint256 res0 = pool.reserve0;
    // uint256 res1 = pool.reserve1;
    // uint256 sqrtKBefore = pool.sqrtK;

    // if (_coinIn == coin0) {
    //   res0 += _coinInAmount;
    //   unchecked { res1 -= coinOutAmount; }
    // } else {
    //   res1 += _coinInAmount;
    //   unchecked { res0 -= coinOutAmount; }
    // }

    // uint256 sqrtKAfter = sqrt(res0 * res1);
    // if (sqrtKAfter < sqrtKBefore) revert InvariantViolated();

    
    // // 3. update pool
    // pool.reserve0 = res0;
    // pool.reserve1 = res1;
    // pool.sqrtK = sqrtKAfter;

    // // 4. transfer _coinOut from contract to user wallet
    // require(
    //   tokenOut.transfer(msg.sender, coinOutAmount),
    //   string(abi.encodePacked("failed to transfer ", tokenOut.name()))
    // );

    // emit Swap(
    //   msg.sender,
    //   address(tokenIn),
    //   address(tokenOut),
    //   _coinInAmount,
    //   coinOutAmount,
    //   feeAmount,
    //   pool.reserve0,
    //   pool.reserve1,
    //   pool.sqrtK,
    //   block.timestamp
    // );
  }
}

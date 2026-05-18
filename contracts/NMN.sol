//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "./Token.sol";

// import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract NMN {

  enum Coin { mirian, castar, tharni, pony, penny, brass, copper }

  Token public mirian;
  Token public castar;
  Token public tharni;
  Token public pony;
  Token public penny;
  Token public brass;
  Token public copper;
  Token[] public tokens;

  uint256 constant PRECISION = 10**18;

  struct Pool {
    uint256 reserve0;
    uint256 reserve1;
    uint256 K;
    uint256 totalShares;
    bool exists;
  }

  mapping(Coin => mapping(Coin => Pool)) public pools;
  mapping(Coin => mapping(Coin => mapping(address => uint256))) public userShares;

  error IdenticalTokens();
  error ZeroAmount();
  error PoolDoesNotExist();
  error ZeroLiquidity();

  constructor(Token[] memory _tokens) {
    mirian = _tokens[0];
    castar = _tokens[1];
    tharni = _tokens[2];
    pony = _tokens[3];
    penny = _tokens[4];
    brass = _tokens[5];
    copper = _tokens[6];

    for (uint i = 0; i <= 6 ; i++) {
      tokens.push(_tokens[i]);
    }
    pools[Coin.mirian][Coin.castar]= Pool(0 ,0, 0, 0, true);
  }

  // sorting functions
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
  
  function updatePoolBalances(
    Coin _coin1, uint256 _coin1Amount,
    Coin _coin2, uint256 _coin2Amount
    ) public {
    pools[_coin1][_coin2].reserve0 += _coin1Amount;
    pools[_coin1][_coin2].reserve1 += _coin2Amount;
    pools[_coin1][_coin2].K = pools[_coin1][_coin2].reserve0 * pools[_coin1][_coin2].reserve1;
    
  }

  function addLiquidity(
    Coin _coin0, uint256 _coin0Amount, Coin _coin1, uint256 _coin1Amount
  ) external{
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

    //Calculate shares to mMint
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
    updatePoolBalances(coin0, coin0Amount, coin1, coin1Amount);
    pool.totalShares += sharesToMint;
    userShares[coin0][coin1][msg.sender] += sharesToMint;

  }

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


}

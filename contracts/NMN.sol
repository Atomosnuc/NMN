//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "./Token.sol";

contract NMN {
  Token public mirian;
  Token public castar;
  Token public tharni;
  Token public pony;
  Token public penny;
  Token public brass;
  Token public copper;

  constructor(Token[] memory _tokens) {
    mirian = _tokens[0];
    castar = _tokens[1];
    tharni = _tokens[2];
    pony = _tokens[3];
    penny = _tokens[4];
    brass = _tokens[5];
    copper = _tokens[6];
  }

}

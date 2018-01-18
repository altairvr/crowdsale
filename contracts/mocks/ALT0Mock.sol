pragma solidity ^0.4.18;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';

contract ALT0Mock {
  using SafeMath for uint256;
  uint256 public totalSupply;
  mapping(address => uint256) balances;

  function ALT0Mock(address initialAccount, uint256 initialBalance, address holder) public {
    balances[initialAccount] = initialBalance;
    totalSupply = initialBalance;
    balances[holder] = totalSupply.div(50);
  }

  function balanceOf(address _owner) public view returns (uint256 balance) {
    return balances[_owner];
  }

}

pragma solidity ^0.4.18;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/token/ERC20Basic.sol';
import 'zeppelin-solidity/contracts/ownership/Ownable.sol';

contract ALT0Token is Ownable, ERC20Basic {
  using SafeMath for uint256;

  string public constant name     = "Altair VR presale token";
  string public constant symbol   = "ALT0";
  uint8  public constant decimals = 18;

  bool public mintingFinished = false;

  mapping(address => uint256) public balances;

  event Mint(address indexed to, uint256 amount);
  event MintFinished();

  /**
  * @dev Function to mint tokens
  * @param _to The address that will receive the minted tokens.
  * @param _amount The amount of tokens to mint.
  * @return A boolean that indicates if the operation was successful.
  */
  function mint(address _to, uint256 _amount) onlyOwner canMint public returns (bool) {
    totalSupply = totalSupply.add(_amount);
    balances[_to] = balances[_to].add(_amount);
    Mint(_to, _amount);
    Transfer(address(0), _to, _amount);
    return true;
  }

  /**
  * @dev Function to stop minting new tokens.
  * @return True if the operation was successful.
  */
  function finishMinting() onlyOwner canMint public returns (bool) {
    mintingFinished = true;
    MintFinished();
    return true;
  }

  /**
  * @dev Current token is not transferred.
  * After start official token sale ALT, you can exchange your ALT0 to ALT
  */
  function transfer(address, uint256) public returns (bool) {
    revert();
    return false;
  }

  /**
  * @dev Gets the balance of the specified address.
  * @param _owner The address to query the the balance of.
  * @return An uint256 representing the amount owned by the passed address.
  */
  function balanceOf(address _owner) public view returns (uint256 balance) {
    return balances[_owner];
  }

  modifier canMint() {
    require(!mintingFinished);
    _;
  }
}

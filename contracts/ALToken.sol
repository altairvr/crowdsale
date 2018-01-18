pragma solidity 0.4.18;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/token/ERC20.sol';

/**
 * @title AltairVR token
 *
 * @dev Implementation of the AltairVR token.
 * @dev Based on ERC20 standart
 */
contract ALToken is ERC20 {
  using SafeMath for uint256;

  event Burn(address indexed burner, uint256 value);
  event Unpause();

  string  public name = "AltairVR token";
  string  public symbol = "ALT";
  uint256 public decimals = 18;

  bool    public paused = true;

  uint256 public totalSupply;
  address public owner;

  mapping (address => mapping (address => uint256)) internal allowed;
  mapping (address => HoldBalance) public holdBalances;
  mapping (address => uint256) public balances;

  struct HoldBalance { 
    uint timestamp;
    uint256 amount;
  }

  function ALToken() public {
    totalSupply = 1000000000 * 10 ** decimals;
    balances[msg.sender] = totalSupply;
    owner = msg.sender;
  }

  // publics

  /**
   * @dev transfer token for a specified address
   * @param _to The address to transfer to.
   * @param _value The amount to be transferred.
   */
  function transfer(address _to, uint256 _value) whenNotPaused nonZeroAddress(_to) available(_value) public returns (bool) {
    balances[msg.sender] = balances[msg.sender].sub(_value);
    balances[_to] = balances[_to].add(_value);
    Transfer(msg.sender, _to, _value);
    return true;
  }

  /**
   * @dev Transfer tokens from one address to another
   * @param _from address The address which you want to send tokens from
   * @param _to address The address which you want to transfer to
   * @param _value uint256 the amount of tokens to be transferred
   */
  function transferFrom(address _from, address _to, uint256 _value) whenNotPaused availableFrom(_from, _to, _value) public returns (bool) {
    balances[_from] = balances[_from].sub(_value);
    balances[_to] = balances[_to].add(_value);
    allowed[_from][msg.sender] = allowed[_from][msg.sender].sub(_value);
    Transfer(_from, _to, _value);
    return true;
  }

  /**
   * @dev Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
   * @param _spender The address which will spend the funds.
   * @param _value The amount of tokens to be spent.
   */
  function approve(address _spender, uint256 _value) whenNotPaused nonZeroAddress(_spender) available(_value) public returns (bool) {
    require(_value == 0 || allowance(msg.sender, _spender) == 0);
    allowed[msg.sender][_spender] = _value;
    Approval(msg.sender, _spender, _value);
    return true;
  }

  // views

  /**
   * @dev Gets the balance of the specified address.
   * @param _owner The address to query the the balance of.
   * @return An uint256 representing the amount owned by the passed address.
   */
  function balanceOf(address _owner) public view returns (uint256 balance) {
    balance = balances[_owner];
  }

  /**
   * @dev Gets the holded balance of the specified address.
   * @param _owner The address to query the the balance of.
   * @return An uint256 representing the amount owned by the passed address.
   */
  function holdOnBalanceOf(address _owner) public view returns (uint256 balance) {
    if (isReleased(_owner)) {
      balance = 0;
    } else {
      balance = holdBalances[_owner].amount;
    }
  }

  /**
   * @dev Gets the released balance of the specified address.
   * @param _owner The address to query the the balance of.
   * @return An uint256 representing the amount owned by the passed address.
   */
  function nonHoldOnBalanceOf(address _owner) public view returns (uint256 balance) {
    if (isReleased(_owner)) {
      balance = balances[_owner];
    } else {
      balance = balances[_owner].sub(holdOnBalanceOf(_owner));
    }
  }

  /**
   * @dev Function to check if some holded tokens of account released in current time.
   * @param _owner address The address which owns the funds.
   * @return A @bool specifying is tokens released for current time
   */
  function isReleased (address _owner) public view returns (bool) {
    return holdBalances[_owner].timestamp == 0 || now >= holdBalances[_owner].timestamp;
  }

  /**
   * @dev Function to check the amount of tokens that an owner allowed to a spender.
   * @param _owner address The address which owns the funds.
   * @param _spender address The address which will spend the funds.
   * @return A uint256 specifying the amount of tokens still available for the spender.
   */
  function allowance(address _owner, address _spender) public view returns (uint256) {
    return allowed[_owner][_spender];
  }

  // externals

  /**
   * @dev Burns a specific amount of tokens.
   * @param _value The amount of token to be burned.
   */
  function burn(uint256 _value) whenNotPaused available(_value) external {
    balances[msg.sender] = balances[msg.sender].sub(_value);
    totalSupply = totalSupply.sub(_value);
    Burn(msg.sender, _value);
  }

  function toHold(address _to, uint _value, uint _date) onlyOwner external {
    require(balances[_to] >= _value);
    holdBalances[_to].amount = _value;
    holdBalances[_to].timestamp = _date;
  }

  /**
   * @dev called by the owner to pause, triggers stopped state
   */
  function unpause() onlyOwner whenPaused external {
    paused = false;
    Unpause();
  }

  // modifiers

  /**
   * @dev Throws if called by any account other than the owner.
   */
  modifier onlyOwner() {
    require(msg.sender == owner);
    _;
  }

  /**
   * @dev Throws if given balance value more than avaliable value
   */
  modifier available(uint _value) {
    require(_value <= nonHoldOnBalanceOf(msg.sender));
    _;
  }

  /**
   * @dev Throws if value not allowed from _from to _to or given value holded on _from account
   */
  modifier availableFrom(address _from, address _to, uint _value) {
    require(_from != address(0));
    require(_to != address(0));
    require(_value <= nonHoldOnBalanceOf(_from));
    require(_value <= allowed[_from][msg.sender]);
    _;
  }

  /**
   * @dev Modifier throws when give address is zero address
   */
  modifier nonZeroAddress(address _address) {
    require(_address != address(0));
    _;
  }

  /**
   * @dev Modifier to make a function callable only when the contract is not paused.
   */
  modifier whenNotPaused() {
    require(!paused || owner == msg.sender);
    _;
  }

  /**
   * @dev Modifier to make a function callable only when the contract is paused.
   */
  modifier whenPaused() {
    require(paused);
    _;
  }

}

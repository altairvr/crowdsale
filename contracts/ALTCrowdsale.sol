pragma solidity ^0.4.18;

import './ALToken.sol';
import './mocks/ALT0Mock.sol';
import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/token/ERC20.sol';

/**
 * @title ALTCrowdsale
 * @dev ALTCrowdsale is a contract for managing a ALToken crowdsale.
 */
contract ALTCrowdsale {
  using SafeMath for uint256;

  event Pause();
  event Unpause();
  event Finalize();
  event Test(uint256 one, uint256 two, uint256 three, uint256 four);

  enum HoldsDates { FortyFiveDays, ThreeMonths, OneYear }
  enum Stages { PreSale, Sale }

  ALToken public token;
  ERC20   public ALT0;

  uint256 public startTime;

  uint256 public weiRaised;
  uint256 public soldTokens;

  address public advisers;
  address public company;
  address public owner;
  address public team;

  address public bountyManager;
  uint public bountyFund;

  Stages public stage = Stages.PreSale;

  uint[2] public HARD_CAP_BY_STAGES;

  uint256 public MIN_AMOUNT = 0.05 ether;
  uint256 public SOFT_CAP   = 500 ether;

  uint256 public rate = 10000;

  mapping(uint => uint) public endTimes;
  mapping(uint => uint) public holdsDates;
  mapping(address => uint) public ALT0Holders;
  mapping(address => uint) public purchases;

  mapping(uint => uint) public bonusesByAmount;
  uint[4] public bonusesAmounts = [uint256(100 ether), 200 ether, 500 ether, 1000 ether];

  mapping(uint => uint) public bonusesByDates;
  uint[] public bonusesDates;

  bool public isFinalized = false;
  bool public paused = false;

  /**
   * event for token purchase logging
   * @param purchaser who paid for the tokens
   * @param beneficiary who got the tokens
   * @param value weis paid for purchase
   * @param amount amount of tokens purchased
   */
  event TokenPurchase(address indexed purchaser, address indexed beneficiary, uint256 value, uint256 amount);

  /**
   * The ALTCrowdsale constructor sets the start and end timestamps, distribution 
   * addresses and Closed pre-sale ALT0 token address.
   * @param _startTime crowdsale starting timestamp
   * @param _endTime crowdsale ending timestamp
   * @param _team address of tokens distribution for team
   * @param _advisers address of tokens distribution for advisers
   * @param _company address of tokens distribution for company
   * @param _alt0 address of token from closed pre-sales
   * @param _bountyManager address of account which will controll bounty fund after crowdsale ending
   */
  function ALTCrowdsale(uint256 _startTime, uint256 _endTime, address _team, address _advisers, address _company, address _alt0, address _bountyManager) public {
    require(_startTime >= now);
    require(_endTime >= _startTime);

    owner = msg.sender;
    team = _team;
    advisers = _advisers;
    company = _company;
    bountyManager = _bountyManager;

    token = new ALToken();

    HARD_CAP_BY_STAGES = [
      uint256(
         90000000  * 10 ** token.decimals()
      ), 500000000 * 10 ** token.decimals()
    ];

    ALT0 = ERC20(_alt0);
    startTime = _startTime;
    endTimes[uint(Stages.Sale)] = _endTime;
    endTimes[uint(Stages.PreSale)] = startTime + 15 days;

    bonusesDates = [
      uint256(endTimes[uint(Stages.PreSale)]),
      endTimes[uint(Stages.PreSale)] + 1 days,
      endTimes[uint(Stages.PreSale)] + 7 days,
      endTimes[uint(Stages.PreSale)] + 14 days,
      endTimes[uint(Stages.PreSale)] + 21 days
    ];

    bonusesByDates[bonusesDates[0]] = 25;
    bonusesByDates[bonusesDates[1]] = 15;
    bonusesByDates[bonusesDates[2]] = 10;
    bonusesByDates[bonusesDates[3]] = 7;
    bonusesByDates[bonusesDates[4]] = 5;

    bonusesByAmount[bonusesAmounts[0]] = 3;
    bonusesByAmount[bonusesAmounts[1]] = 5;
    bonusesByAmount[bonusesAmounts[2]] = 7;
    bonusesByAmount[bonusesAmounts[3]] = 10;

    holdsDates[uint(HoldsDates.ThreeMonths)] = endTimes[uint(Stages.Sale)] + 90 days;
    holdsDates[uint(HoldsDates.OneYear)] = endTimes[uint(Stages.Sale)] + 1 years;
    holdsDates[uint(HoldsDates.FortyFiveDays)] = endTimes[uint(Stages.Sale)] + 45 days;
  }

  function () external payable {
    buyTokens(msg.sender);
  }

  // publics

  /**
   * main token purchase function
   * @param beneficiary address of person who will got tokens
   */
  function buyTokens(address beneficiary) public payable hasNotEnded hardCapped whenNotPaused needsStageChanging softStageEnded {
    require(beneficiary != address(0));
    require(isFinalized == false);
    require(validPurchase());

    uint256 weiAmount = msg.value;
    uint256 tokens = tokensForWei(weiAmount);

    purchases[beneficiary] = purchases[beneficiary].add(weiAmount);
    soldTokens = soldTokens.add(tokens);
    weiRaised = weiRaised.add(weiAmount);

    token.transfer(beneficiary, tokens);
    TokenPurchase(msg.sender, beneficiary, weiAmount, tokens);
  }

  /**
   * function for refund operation, when crowdsale has failed soft cap value
   * @param beneficiary address of person who will got refund
   */
  function refund(address beneficiary) refundable public {
    require(purchases[beneficiary] > 0);
    uint _refund = purchases[beneficiary];
    purchases[beneficiary] = 0;
    return beneficiary.transfer(_refund);
  }

  /**
   * function for crowdsale finish and parts of tokens distributing
   */
  function finalize() public {
    require(hasEnded());
    require(isFinalized == false);

    isFinalized = true;

    uint fund = soldTokens.mul(2);

    token.transfer(team, fund.mul(13).div(100));
    token.toHold(  team, token.balanceOf(team), holdsDates[uint(HoldsDates.OneYear)]);

    token.transfer(company,  fund.mul(32).div(100));

    token.transfer(advisers, fund.mul(2).div(100));
    token.toHold(  advisers, token.balanceOf(advisers).div(2), holdsDates[uint(HoldsDates.ThreeMonths)]);

    bountyFund = (soldTokens.mul(2)).mul(3).div(100);

    token.unpause();

    Finalize();
  }

  // ownable

  /**
   * function for setting crowdsale on pause
   */
  function pause() onlyOwner whenNotPaused public {
    paused = true;
    Pause();
  }

  /**
   * function for unpause crowdsale
   */
  function unpause() onlyOwner whenPaused public {
    paused = false;
    Unpause();
  }
  
  /**
   * function for direct token transfering for external payments
   * @param _to address of person who will got tokens
   * @param _amount amount of tokens for _to address
   */
  function transferTokens(address _to, uint _amount) onlyOwner needsStageChanging public returns (bool) {
    require(isFinalized == false);
    weiRaised = weiRaised.add(_amount.mul(rate));
    soldTokens = soldTokens.add(_amount);
    return token.transfer(_to, _amount);
  }

  /**
   * function converting closed pre-sales tokens ALT0 (1:25)
   * @param beneficiary address of person who got AL0 tokens for converting
   */
  function convertALT0(address beneficiary) public onlyOwner holdersALT0(beneficiary) {
    uint amount = (ALT0.balanceOf(beneficiary)).mul(25);
    ALT0Holders[beneficiary] = amount;
    token.transfer(beneficiary, amount);
    token.toHold(beneficiary, amount.div(2), holdsDates[uint(HoldsDates.ThreeMonths)]);
  }

  /**
   * function for withdraw ether from this contract
   * @param beneficiary address of person who will got ether
   * @param _amount amount of withdrawing ether
   */
  function withdraw(address beneficiary, uint _amount) onlyOwner softCapped public {
    return beneficiary.transfer(_amount);
  }

  /**
   * function for withdraw rest of tokens on crowdsale contract for managing by owners
   * @param beneficiary address of person who will got tokens
   */
  function withdrawRestTokens(address beneficiary) onlyOwner public {
    require(isFinalized);
    uint amount = token.balanceOf(this).sub(bountyFund);
    require(amount > 0);
    token.transfer(beneficiary, token.balanceOf(this).sub(bountyFund));
  }

  // bounty

  /**
   * function for bounty fund transfering 
   * @param _to address of person who will got bounty tokens
   * @param _amount amount of tokens to transfiring for
   */
  function transferBounty(address _to, uint _amount) public onlyBountyManager {
    require(bountyFund >= _amount);
    require(_amount > 0);
    bountyFund = bountyFund.sub(_amount);
    token.transfer(_to, _amount);
    token.toHold(_to, _amount, holdsDates[uint(HoldsDates.FortyFiveDays)]);
  }

  // views

  /**
   * function for getting bonus amount in tokens for big payments like 2000, 5000 and 10000 ether
   * @param _tokens amount of tokens for investor's payment
   * @param _payment payment of investor in wei
   */
  function getMoneyBonus(uint256 _tokens, uint256 _payment) public view returns (uint256) {
    if (_payment >= bonusesAmounts[0] && _payment < bonusesAmounts[1]) {
      return _tokens.mul(bonusesByAmount[bonusesAmounts[0]]).div(100);
    }
    if (_payment >= bonusesAmounts[1] && _payment < bonusesAmounts[2]) {
      return _tokens.mul(bonusesByAmount[bonusesAmounts[1]]).div(100);
    }
    if (_payment >= bonusesAmounts[2] && _payment < bonusesAmounts[3]) {
      return _tokens.mul(bonusesByAmount[bonusesAmounts[2]]).div(100);
    }
    if (_payment >= bonusesAmounts[3]) {
      return _tokens.mul(bonusesByAmount[bonusesAmounts[3]]).div(100);
    }
    return 0;
  }

  /**
   * function for getting bonus amount in tokens for payments during special time intervals
   * @param _tokens amount of tokens for investor's payment
   */
  function getTimeBonus(uint256 _tokens) public view returns (uint256) {
    if (now <= bonusesDates[0]) {
      return _tokens.mul(bonusesByDates[bonusesDates[0]]).div(100);
    }
    if (now <= bonusesDates[1]) {
      return _tokens.mul(bonusesByDates[bonusesDates[1]]).div(100);
    }
    if (now <= bonusesDates[2]) {
      return _tokens.mul(bonusesByDates[bonusesDates[2]]).div(100);
    }
    if (now <= bonusesDates[3]) {
      return _tokens.mul(bonusesByDates[bonusesDates[3]]).div(100);
    }
    if (now <= bonusesDates[4]) {
      return _tokens.mul(bonusesByDates[bonusesDates[4]]).div(100);
    }
    return 0;
  }

  /**
   * function for validating purchases. Checking for amount of payment and time intervals of crowdsale
   */
  function validPurchase() internal view returns (bool) {
    bool withinPeriod = now >= startTime && now <= endTimes[uint(Stages.Sale)];
    bool nonZeroPurchase = msg.value != 0;
    bool moreThanMinAmount = msg.value >= MIN_AMOUNT; 
    return withinPeriod && nonZeroPurchase && moreThanMinAmount;
  }

  /**
   * function for checking if crowdsale has ended
   */
  function hasEnded() public view returns (bool) {
    return now >= endTimes[uint(Stages.Sale)];
  }

  function tokensForWei(uint weiAmount) public view returns (uint tokens) {
    tokens = weiAmount.mul(rate);

    tokens = tokens.add(getMoneyBonus(tokens, weiAmount))
                   .add(getTimeBonus(tokens));
  }

  //modifiers

  /**
   * Throws if called by any account other than the owner.
   */
  modifier onlyOwner() {
    require(msg.sender == owner);
    _;
  }

  /**
   * Throws if called by not an ALT0 holder or second time call for same ALT0 holder
   */
  modifier holdersALT0(address beneficiary) {
    require(ALT0.balanceOf(beneficiary) > 0);
    require(ALT0Holders[beneficiary] == 0);
    _;
  }

  /**
   * Throws if called when raised weis less then softcap goal
   */
  modifier softCapped() {
    require(weiRaised >= SOFT_CAP);
    _;
  }

  /**
   * Throws if called when crowdsale ended
   */
  modifier hasNotEnded() {
    require(!hasEnded());
    _;
  }

  /**
   * Throws if tokens for called value plus all sold tokens more then hardcap of sale stage
   */
  modifier hardCapped() {
    require(soldTokens.add(tokensForWei(msg.value)) <= HARD_CAP_BY_STAGES[uint(Stages.Sale)]);
    _;
  }

  /**
   * Throws if softcap wasn't reach during presales
   */
  modifier softStageEnded() {
    require(stage == Stages.Sale || weiRaised >= SOFT_CAP || now < endTimes[uint(Stages.PreSale)]);
    _;
  }

  /**
   * Throws when presale stage hasn't ended 
   */
  modifier refundable() {
    require(stage == Stages.PreSale && weiRaised < SOFT_CAP && now >= endTimes[uint(Stages.PreSale)]);
    _;
  }

  /**
   * Modifier for checking if we need to state stage of crowdsale because of hardcap reached
   * or softcap reached with time later than presales ending
   */
  modifier needsStageChanging() {
    if (weiRaised >= SOFT_CAP && now >= endTimes[uint(stage)]) {
      stage = Stages.Sale;
    }
    _;
    if (stage == Stages.PreSale && soldTokens >= HARD_CAP_BY_STAGES[uint(Stages.PreSale)]) {
      stage = Stages.Sale;
    }
  }

  /**
   * Throws if called by any account other than the bountyManager.
   */
  modifier onlyBountyManager() {
    require(msg.sender == bountyManager);
    _;
  }

  /**
   * Throws when crowdsale paused
   */
  modifier whenNotPaused() {
    require(!paused);
    _;
  }

  /**
   * Throws when crowdsale not paused
   */
  modifier whenPaused() {
    require(paused);
    _;
  }
}

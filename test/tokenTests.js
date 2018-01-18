const assertRevert  = require('./helpers/assertRevert');

const BASE_PATH = './../contracts'
const ALToken = artifacts.require(`${BASE_PATH}/ALToken`)

contract('ALToken', function(accounts) {

  beforeEach(async function () {
    this.instance = await ALToken.new();
    let decimals = await this.instance.decimals.call();
    this.decimalsCorrection = 10 ** decimals
  });

  it("should put billion ALToken on the first account", async function() {
    let balance = await this.instance.balanceOf(accounts[0]);
    assert.equal(balance.valueOf(), 1000000000 * this.decimalsCorrection, "1000000000 wasn't in the first account");
  });

  it("should transfer tokens from owner account when they are paused (selling)", async function() {
    let account_one = accounts[0];
    let account_two = accounts[1];

    let account_one_starting_balance;
    let account_two_starting_balance;
    let account_one_ending_balance;
    let account_two_ending_balance;

    let amount = 10 * this.decimalsCorrection;

    account_one_starting_balance = await this.instance.balanceOf(account_one)
    account_one_starting_balance = account_one_starting_balance.valueOf();
    account_two_starting_balance = await this.instance.balanceOf(account_two);
    account_two_starting_balance = account_two_starting_balance.valueOf()

    await this.instance.transfer(account_two, amount, {from: account_one});

    account_one_ending_balance = await this.instance.balanceOf(account_one)
    account_one_ending_balance = account_one_ending_balance.valueOf();
    account_two_ending_balance = await this.instance.balanceOf(account_two);
    account_two_ending_balance = account_two_ending_balance.valueOf();

    assert.equal(Number(account_one_ending_balance), Number(account_one_starting_balance) - amount, "Amount wasn't correctly taken from the sender");
    assert.equal(Number(account_two_ending_balance), Number(account_two_starting_balance) + amount, "Amount wasn't correctly sent to the receiver");
  })

  it("should not transfer tokens from any account when they are paused", async function() {
    let amount = 10;
    await this.instance.transfer(accounts[1], amount, {from: accounts[0]})
    let account_one = accounts[1];
    let account_two = accounts[2];
    await assertRevert(this.instance.transfer(account_two, amount, {from: account_one}));
  })

  it("should transfer tokens correctly when unpaused", async function() {

    let account_one = accounts[0];
    let account_two = accounts[1];

    let account_one_starting_balance;
    let account_two_starting_balance;
    let account_one_ending_balance;
    let account_two_ending_balance;

    let amount = 10 * this.decimalsCorrection;

    this.instance.unpause({from: account_one});
    account_one_starting_balance = await this.instance.balanceOf(account_one)
    account_one_starting_balance = account_one_starting_balance.valueOf();
    account_two_starting_balance = await this.instance.balanceOf(account_two);
    account_two_starting_balance = account_two_starting_balance.valueOf()

    await this.instance.transfer(account_two, amount, {from: account_one});

    account_one_ending_balance = await this.instance.balanceOf(account_one)
    account_one_ending_balance = account_one_ending_balance.valueOf();
    account_two_ending_balance = await this.instance.balanceOf(account_two);
    account_two_ending_balance = account_two_ending_balance.valueOf();

    assert.equal(Number(account_one_ending_balance), Number(account_one_starting_balance) - amount, "Amount wasn't correctly taken from the sender");
    assert.equal(Number(account_two_ending_balance), Number(account_two_starting_balance) + amount, "Amount wasn't correctly sent to the receiver");
  });

  it("shouldn't unpause from not an owner", async function() {
    await assertRevert(this.instance.unpause({from: accounts[1]}));
  })

  it("should not allow send tokens to 0x0 address", async function() {
    await assertRevert(this.instance.transfer("0x0", 10, {from: accounts[0]}))
  })

  it("should burn own tokens", async function() {
    let amount = 10 * this.decimalsCorrection;
    
    let starting_balance = await this.instance.balanceOf(accounts[0]);
    await this.instance.burn(amount, {from: accounts[0]});
    let ending_balance = await this.instance.balanceOf(accounts[0]);
    assert.equal(starting_balance.valueOf(), ending_balance.add(amount).valueOf(), "tokens wasn't burned");
  })

  it("should hold amount of tokens and return correct holded/nonholded balance", async function() {
    let amount = 33 * this.decimalsCorrection;
    await this.instance.transfer(accounts[1], amount, {from: accounts[0]})
    let timestamp = 1546300800 //01-01-2019 00:00:00
    let allBalance = await this.instance.balanceOf(accounts[1]);
    allBalance = allBalance.valueOf();
    await this.instance.toHold(accounts[1], amount - 5, timestamp);
    let holdedBalance = await this.instance.holdOnBalanceOf(accounts[1]);
    holdedBalance = holdedBalance.valueOf();
    let nonHoldedBalance = await this.instance.nonHoldOnBalanceOf(accounts[1]);
    nonHoldedBalance = nonHoldedBalance.valueOf();
    assert.equal(holdedBalance, (amount - 5), "holded balance isn't right");
    assert.equal(nonHoldedBalance, allBalance - holdedBalance, "non holded balance isn't right");
    assert.equal(allBalance, Number(holdedBalance) + Number(nonHoldedBalance), "sums of balances isn't right");
  })

  it("should not allow to spend holded tokens", async function() {
    let amount = 33 * this.decimalsCorrection;
    await this.instance.transfer(accounts[1], amount, {from: accounts[0]})
    let timestamp = 1546300800 //01-01-2019 00:00:00
    let allBalance = await this.instance.balanceOf(accounts[1]);
    allBalance = allBalance.valueOf();
    await this.instance.toHold(accounts[1], allBalance - 1, timestamp);
    await assertRevert(this.instance.transfer(accounts[5], allBalance, {from: accounts[1]}))
  })

  it ("should allow spend unholded tokens by timestamp", async function() {
    let amount = 33 * this.decimalsCorrection;
    await this.instance.transfer(accounts[1], amount, {from: accounts[0]})
    let timestamp = 1483228800 //01-01-2017 00:00:00
    let allBalance = await this.instance.balanceOf(accounts[1]);
    allBalance = allBalance.valueOf();
    let balanceOfAnother = await this.instance.balanceOf(accounts[5]);
    balanceOfAnother = balanceOfAnother.valueOf();
    await this.instance.toHold(accounts[1], allBalance - 1, timestamp);
    await this.instance.unpause({from: accounts[0]});
    await this.instance.transfer(accounts[5], allBalance, {from: accounts[1]})
    let endingBalanceOfAnother = await this.instance.balanceOf(accounts[5]);
    endingBalanceOfAnother = endingBalanceOfAnother.valueOf();
    assert.equal(endingBalanceOfAnother - balanceOfAnother, allBalance, "tokens wasn't trasfered")
  })


  it("should approve tokens to spend them by another account", async function() {
    let amount = 20 * this.decimalsCorrection;
    await this.instance.transfer(accounts[1], amount, {from: accounts[0]})
    await this.instance.unpause({from: accounts[0]});
    await this.instance.approve(accounts[2], amount, {from: accounts[1]})
    let balanceOfOther = await this.instance.balanceOf(accounts[5]);
    balanceOfOther = balanceOfOther.valueOf();
    let allowance = await this.instance.allowance(accounts[1], accounts[2])
    allowance = allowance.valueOf();
    assert.equal(amount, allowance, "allowance not equal what was approved")
    await this.instance.transferFrom(accounts[1], accounts[5], amount, {from: accounts[2]});
    let endBalance = await this.instance.balanceOf(accounts[5]);
    endBalance = endBalance.valueOf();
    assert.equal(Number(balanceOfOther) + amount, endBalance, "balance is same");
  })

  it("should not allow spend more then approved", async function() {
    let amount = 10 * this.decimalsCorrection;
    await this.instance.transfer(accounts[1], amount, {from: accounts[0]})
    await this.instance.unpause({from: accounts[0]});
    await this.instance.approve(accounts[2], amount, {from: accounts[1]})
    await assertRevert(this.instance.transferFrom(accounts[1], accounts[5], amount * 2, {from: accounts[2]}));
  })
});

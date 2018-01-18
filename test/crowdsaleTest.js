const assertRevert  = require('./helpers/assertRevert');
const latestTime  = require('./helpers/latestTime');
const duration = require('./helpers/durations');
const ether = require('./helpers/ether');
const increaseTimeTo = require('./helpers/increaseTime');

const BASE_PATH = './../contracts';
const ALToken = artifacts.require(`${BASE_PATH}/ALToken`);
const ALTCrowdsale = artifacts.require(`${BASE_PATH}/ALTCrowdsale`);
const ALT0Mock = artifacts.require(`${BASE_PATH}/mocks/ALT0Mock`);

const BigNumber = web3.BigNumber;
const should = require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('ALTCrowdsale', function(accounts) {
  
  beforeEach(async function() {
    this.startTime = latestTime() + duration.seconds(1);
    this.endTime = this.startTime + duration.weeks(10);
    this.alt0 = await ALT0Mock.new(accounts[5], 10000, accounts[6])
    this.crowdsale = await ALTCrowdsale.new(this.startTime, this.endTime, accounts[9], accounts[8], accounts[7], this.alt0.address, accounts[6]);
    this.token = ALToken.at(await this.crowdsale.token());
    let decimals = await this.token.decimals.call();
    this.decimalsCorrection = 10 ** decimals
    this.totalSupply = await this.token.totalSupply.call();
    await increaseTimeTo(this.startTime);
  })

  describe('buyTokens', async function () {
    it("should buy some tokens", async function() {
      let tokensOnOneEth = 10000 * this.decimalsCorrection + (10000 * this.decimalsCorrection * 0.25); //+ bonus for pre-ico
      await this.crowdsale.sendTransaction({from: accounts[1], value: ether(1), gas: 1000000});
      let balance = (await this.token.balanceOf(accounts[1])).toNumber();
      assert.equal(balance, tokensOnOneEth, "tokens wasn't buy");
    });
    it("should reject transaction because of value < min amount", async function() {
      await assertRevert(this.crowdsale.sendTransaction({from: accounts[1], value: ether(0.01), gas: 1000000}));
    });
    it("should reject transaction because of sale is on pause", async function() {
      await this.crowdsale.pause({from: accounts[0]});
      await assertRevert(this.crowdsale.sendTransaction({from: accounts[1], value: ether(1), gas: 1000000}));
    });
    it("should reject pause call for second time", async function() {
      await this.crowdsale.pause({from: accounts[0]});
      await assertRevert(this.crowdsale.pause({from: accounts[0]}));
    });
    it("should buy tokens when was unpaused", async function() {
      await this.crowdsale.pause({from: accounts[0]});
      await assertRevert(this.crowdsale.sendTransaction({from: accounts[1], value: ether(1), gas: 1000000}));
      await this.crowdsale.unpause({from: accounts[0]});
      let tokensOnOneEth = 10000 * this.decimalsCorrection + (10000 * this.decimalsCorrection * 0.25); //+ bonus for pre-ico
      await this.crowdsale.sendTransaction({from: accounts[1], value: ether(1), gas: 1000000});
      let balance = (await this.token.balanceOf(accounts[1])).toNumber();
      assert.equal(balance, tokensOnOneEth, "tokens wasn't buy");
    });
    it("should reject transaction because of softcap wasn't raised and time of stage is up", async function() {
      await increaseTimeTo(this.startTime + duration.days(16));
      await assertRevert(this.crowdsale.sendTransaction({from: accounts[1], value: ether(1), gas: 1000000}));
    });
    it("should change stage because of soft cap raised (when we got a soft cap ehter, but time is up, state changing gone by user)", async function() {
      await this.crowdsale.sendTransaction({from: accounts[9], value: ether(500), gas: 6000000});
      let stage = await this.crowdsale.stage.call();
      await increaseTimeTo(this.startTime + duration.days(16));
      await this.crowdsale.sendTransaction({from: accounts[9], value: ether(10), gas: 6000000});
      stage = await this.crowdsale.stage.call();
      stage.should.be.bignumber.equal(new BigNumber(1));
    })
    it("should change stage because of hardcap of presale was raised", async function() {
      await this.crowdsale.sendTransaction({from: accounts[9], value: ether(500), gas: 6000000});
      let stage1 = await this.crowdsale.stage.call();
      await this.crowdsale.sendTransaction({from: accounts[10], value: ether(8500), gas: 6000000});
      let stage2 = await this.crowdsale.stage.call();
      stage2.should.be.bignumber.equal(new BigNumber(1));
    })
    it("should reject transaction because of hardcap of sale was raised", async function() {
      await this.crowdsale.sendTransaction({from: accounts[9], value: ether(37037), gas: 6000000});
      let stage1 = await this.crowdsale.stage.call();
      await assertRevert(this.crowdsale.sendTransaction({from: accounts[10], value: ether(1500), gas: 6000000}));
      stage1.should.be.bignumber.equal(new BigNumber(1));
    })
    it("should buy tokens with 5% bonus by time", async function() {
      await this.crowdsale.sendTransaction({from: accounts[17], value: ether(500), gas: 6000000});
      let tokensBought = new BigNumber(ether(10)).mul(10000).add(new BigNumber(ether(10)).mul(10000).mul(0.05));
      await increaseTimeTo(this.startTime + duration.days(15) + duration.days(20));
      let startingBalance = await this.token.balanceOf(accounts[8]);
      await this.crowdsale.sendTransaction({from: accounts[8], value: ether(10), gas: 6000000});
      let endingBalance = await this.token.balanceOf(accounts[8]);
      tokensBought.should.be.bignumber.equal(endingBalance.sub(startingBalance));
    })
  })

  describe('refund method', async function() {
    it("should refund befor softcap wasn't raised in time", async function() {
      let tokensOnOneEth = 10000 * this.decimalsCorrection + (10000 * this.decimalsCorrection * 0.25); //+ bonus for pre-ico
      await this.crowdsale.sendTransaction({from: accounts[1], value: ether(1), gas: 1000000});
      await increaseTimeTo(this.startTime + duration.days(16));
      let balance = await web3.eth.getBalance(accounts[1]);
      await this.crowdsale.refund(accounts[1],{from: accounts[0]});
      let endBalance = await web3.eth.getBalance(accounts[1]);
      new BigNumber(ether(1)).should.be.bignumber.equal(endBalance.sub(balance));
    });
    it("should reject refund while presales didn't get to ending (and softcap will be less then 500)", async function() {
      await this.crowdsale.sendTransaction({from: accounts[1], value: ether(1), gas: 1000000});
      await assertRevert(this.crowdsale.refund(accounts[1], {from: accounts[0]}));
    })
    it("should reject second time refund of one user", async function() {
      let tokensOnOneEth = 10000 * this.decimalsCorrection + (10000 * this.decimalsCorrection * 0.25); //+ bonus for pre-ico
      await this.crowdsale.sendTransaction({from: accounts[1], value: ether(1), gas: 1000000});
      await increaseTimeTo(this.startTime + duration.days(16));
      let balance = await web3.eth.getBalance(accounts[1]);
      await this.crowdsale.refund(accounts[1],{from: accounts[0]});
      let endBalance = await web3.eth.getBalance(accounts[1]);
      new BigNumber(ether(1)).should.be.bignumber.equal(endBalance.sub(balance));
      await assertRevert(this.crowdsale.refund(accounts[1],{from: accounts[0]}));
    });
    it("should refund full wasted ether for 2 purchases", async function() {
      let tokensOnOneEth = 10000 * this.decimalsCorrection + (10000 * this.decimalsCorrection * 0.25); //+ bonus for pre-ico
      await this.crowdsale.sendTransaction({from: accounts[1], value: ether(1), gas: 1000000});
      await this.crowdsale.sendTransaction({from: accounts[1], value: ether(1), gas: 1000000});
      await increaseTimeTo(this.startTime + duration.days(16));
      let balance = await web3.eth.getBalance(accounts[1]);
      await this.crowdsale.refund(accounts[1],{from: accounts[0]});
      let endBalance = await web3.eth.getBalance(accounts[1]);
      new BigNumber(ether(2)).should.be.bignumber.equal(endBalance.sub(balance));
    });
  })

  describe ('Crowdsale ending tokens distribution', async function() {
    beforeEach(async function() {
      this.tokensOnOneEth = 10000 * this.decimalsCorrection + (10000 * this.decimalsCorrection * 0.25); //+ bonus for pre-ico
      await this.crowdsale.sendTransaction({from: accounts[1], value: ether(1), gas: 1000000});
      await increaseTimeTo(this.endTime + duration.seconds(30));
      await this.crowdsale.finalize();
    })
    it("team must receive 13% of all tokens", async function() {
      let balance = await this.token.balanceOf(await this.crowdsale.team.call());
      let expectedBalance = ((new BigNumber(this.tokensOnOneEth)).mul(2)).mul(13).div(100);
      balance.should.be.bignumber.equal(expectedBalance);
    })
    it("team tokens should be holded", async function() {
      let balance = await this.token.holdOnBalanceOf(await this.crowdsale.team.call());
      let expectedBalance = ((new BigNumber(this.tokensOnOneEth)).mul(2)).mul(13).div(100);
      balance.should.be.bignumber.equal(expectedBalance);
    })
    it("company must receive 32% of all tokens", async function() {
      let balance = await this.token.balanceOf(await this.crowdsale.company.call());
      let expectedBalance = ((new BigNumber(this.tokensOnOneEth)).mul(2)).mul(32).div(100);
      balance.should.be.bignumber.equal(expectedBalance);
    })
    it("advisers must receive 2% of all tokens", async function() {
      let balance = await this.token.balanceOf(await this.crowdsale.advisers.call());
      let expectedBalance = ((new BigNumber(this.tokensOnOneEth)).mul(2)).mul(2).div(100);
      balance.should.be.bignumber.equal(expectedBalance);
    })
  })

  describe('getMoneyBonus method', async function() {
    it ("should return correct money bonus for 100+ ether", async function() {
      let facts = await this.crowdsale.getMoneyBonus(ether(110) * 10000, ether(110));
      let expected = new BigNumber(ether(110)).mul(10000).mul(3).div(100);
      facts.should.be.bignumber.equal(expected);
    })
    it ("should return correct money bonus for 100 ether", async function() {
      let facts = await this.crowdsale.getMoneyBonus(ether(100) * 10000, ether(100));
      let expected = new BigNumber(ether(100)).mul(10000).mul(3).div(100);
      facts.should.be.bignumber.equal(expected);
    })
    it ("should return correct money bonus for 200+ ether", async function() {
      let facts = await this.crowdsale.getMoneyBonus(ether(210) * 10000, ether(210));
      let expected = new BigNumber(ether(210)).mul(10000).mul(5).div(100);
      facts.should.be.bignumber.equal(expected);
    })
    it ("should return correct money bonus for 200 ether", async function() {
      let facts = await this.crowdsale.getMoneyBonus(ether(200) * 10000, ether(200));
      let expected = new BigNumber(ether(200)).mul(10000).mul(5).div(100);
      facts.should.be.bignumber.equal(expected);
    })    
    it ("should return correct money bonus for 500+ ether", async function() {
      let facts = await this.crowdsale.getMoneyBonus(ether(510) * 10000, ether(510));
      let expected = new BigNumber(ether(510)).mul(10000).mul(7).div(100);
      facts.should.be.bignumber.equal(expected);
    })
    it ("should return correct money bonus for 500 ether", async function() {
      let facts = await this.crowdsale.getMoneyBonus(ether(500) * 10000, ether(500));
      let expected = new BigNumber(ether(500)).mul(10000).mul(7).div(100);
      facts.should.be.bignumber.equal(expected);
    })
    it ("should return correct money bonus for 1000+ ether", async function() {
      let facts = await this.crowdsale.getMoneyBonus(ether(1100) * 10000, ether(1100));
      let expected = new BigNumber(ether(1100)).mul(10000).mul(10).div(100);
      facts.should.be.bignumber.equal(expected);
    })
    it ("should return correct money bonus for 1000 ether", async function() {
      let facts = await this.crowdsale.getMoneyBonus(ether(1000) * 10000, ether(1000));
      let expected = new BigNumber(ether(1000)).mul(10000).mul(10).div(100);
      facts.should.be.bignumber.equal(expected);
    })
    it ("should not return bonus for low payment", async function() {
      let lowValueForBonus = await this.crowdsale.getMoneyBonus(ether(10) * 10000, ether(10));
      lowValueForBonus.should.be.bignumber.equal(new BigNumber(0));
    })
  })

  describe('getTimeBonus method', async function() {
    it("should give a presales bonus 25%", async function() {
      let bonusTokens = await this.crowdsale.getTimeBonus(ether(10) * 10000);
      let expectedBonusTokens = (new BigNumber(ether(10))).mul(10000).mul(25).div(100);
      bonusTokens.should.be.bignumber.equal(expectedBonusTokens);
    });

    it("should give a one day bonus 15%", async function() {
      await increaseTimeTo(this.startTime + duration.days(15) + duration.hours(23));
      let bonusTokens = await this.crowdsale.getTimeBonus(ether(10) * 10000);
      let expectedBonusTokens = (new BigNumber(ether(10))).mul(10000).mul(15).div(100);
      bonusTokens.should.be.bignumber.equal(expectedBonusTokens);
    });

    it("should give a 7 days bonus 10%", async function() {
      await increaseTimeTo(this.startTime + duration.days(15) + duration.days(6));
      let bonusTokens = await this.crowdsale.getTimeBonus(ether(10) * 10000);
      let expectedBonusTokens = (new BigNumber(ether(10))).mul(10000).mul(10).div(100);
      bonusTokens.should.be.bignumber.equal(expectedBonusTokens);
    });

    it("should give a 14 bonus 7%", async function() {
      await increaseTimeTo(this.startTime + duration.days(15) + duration.days(13));
      let bonusTokens = await this.crowdsale.getTimeBonus(ether(10) * 10000);
      let expectedBonusTokens = (new BigNumber(ether(10))).mul(10000).mul(7).div(100);
      bonusTokens.should.be.bignumber.equal(expectedBonusTokens);
    });

    it("should give a 21 bonus 5%", async function() {
      await increaseTimeTo(this.startTime + duration.days(15) + duration.days(20));
      let bonusTokens = await this.crowdsale.getTimeBonus(ether(10) * 10000);
      let expectedBonusTokens = (new BigNumber(ether(10))).mul(10000).mul(5).div(100);
      bonusTokens.should.be.bignumber.equal(expectedBonusTokens);
    });

    it("should not give a bonus", async function() {
      await increaseTimeTo(this.startTime + duration.days(15) + duration.days(22));
      let bonusTokens = await this.crowdsale.getTimeBonus(ether(10) * 10000);
      let expectedBonusTokens = new BigNumber(0);
      bonusTokens.should.be.bignumber.equal(expectedBonusTokens);
    });
  })

  describe('convertALT0 method', async function() {
    it ("should convert alt0 to alt and hold it for 3 month before ico ended", async function() {
      await this.crowdsale.convertALT0(accounts[6], {from: accounts[0]});
      let balance = await this.token.balanceOf(accounts[6]);
      let expectedBalance = new BigNumber(5000);
      balance.should.be.bignumber.equal(expectedBalance);
      let holdedBalance = await this.token.holdOnBalanceOf(accounts[6]);
      let expectedHoldedBalance = new BigNumber(2500);
      holdedBalance.should.be.bignumber.equal(expectedHoldedBalance);
      await increaseTimeTo(this.endTime + duration.days(90) + duration.seconds(1));
      let unholdedBalance = await this.token.holdOnBalanceOf(accounts[6]);
      let expectedUnoldedBalance = new BigNumber(0);
      unholdedBalance.should.be.bignumber.equal(expectedUnoldedBalance);
    }) 
    
    it("should not give tokens to non alt0 holder", async function() {
      await assertRevert(this.crowdsale.convertALT0(accounts[1], {from: accounts[0]}));
    })

    it("should not convert alt0 second time", async function() {
      await this.crowdsale.convertALT0(accounts[6], {from: accounts[0]});
      await assertRevert(this.crowdsale.convertALT0(accounts[6], {from: accounts[0]}));
    })
  })

  describe('finalize method', async function() {
    beforeEach(async function() {
      this.tokensOnOneEth = 10000 * this.decimalsCorrection + (10000 * this.decimalsCorrection * 0.25); //+ bonus for pre-ico
      await this.crowdsale.sendTransaction({from: accounts[1], value: ether(1), gas: 1000000});
    })
    it("should not finalize because not ended", async function() {
      await assertRevert(this.crowdsale.finalize())
    })
    it("should finalize", async function() {
      await this.crowdsale.sendTransaction({from: accounts[1], value: ether(500), gas: 1000000});
      await increaseTimeTo(this.endTime + duration.seconds(30));
      await this.crowdsale.finalize();
      let flag = await this.crowdsale.isFinalized.call();
      assert.isTrue(flag, "isFinalized false")
    })
    it("should not finalize second time", async function() {
      await increaseTimeTo(this.endTime + duration.seconds(30));
      await this.crowdsale.finalize();
      await assertRevert(this.crowdsale.finalize());
    })
  })

  describe('withdrawRestTokens method', async function() {
    beforeEach(async function() {
      this.tokensOnOneEth = 10000 * this.decimalsCorrection + (10000 * this.decimalsCorrection * 0.25);
      await this.crowdsale.sendTransaction({from: accounts[13], value: ether(1), gas: 1000000});
      await increaseTimeTo(this.endTime + duration.seconds(30));
      await this.crowdsale.finalize();
    })
    it("should reject withdrawing because of called not from owner", async function() {
      await assertRevert(this.crowdsale.withdrawRestTokens(accounts[33], {from: accounts[33]}));
    })
    it("should withdraw rests of tokens ", async function() {
      await this.crowdsale.withdrawRestTokens(accounts[33], {from: accounts[0]});
      let funds = ((new BigNumber(this.tokensOnOneEth)).mul(2)).mul(13).div(100);
      funds = funds.add(((new BigNumber(this.tokensOnOneEth)).mul(2)).mul(32).div(100));
      funds = funds.add(((new BigNumber(this.tokensOnOneEth)).mul(2)).mul(2).div(100));
      let bountyFund = await this.crowdsale.bountyFund.call();
      funds = funds.add(bountyFund);
      let balance = await this.token.balanceOf(accounts[33]);
      balance.should.be.bignumber.equal(this.totalSupply.sub(funds).sub(new BigNumber(this.tokensOnOneEth)));
    })
  })

  describe('withdraw method', async function() {
    it("should reject transaction, because of softcap wasn't raised", async function() {
      await this.crowdsale.sendTransaction({from: accounts[1], value: ether(1), gas: 1000000});
      await assertRevert(this.crowdsale.withdraw(accounts[0], ether(1)));
    })
    it("should reject transaction, because of call from not owner", async function() {
      await this.crowdsale.sendTransaction({from: accounts[1], value: ether(1000), gas: 1000000});
      await assertRevert(this.crowdsale.withdraw(accounts[0], ether(1), {from: accounts[1]}));
    })
    it("should withdraw", async function() {
      await this.crowdsale.sendTransaction({from: accounts[1], value: ether(1000), gas: 1000000});
      let balance = await web3.eth.getBalance(accounts[14]);
      await this.crowdsale.withdraw(accounts[14], ether(10), {from: accounts[0]});
      let endingBalance = await web3.eth.getBalance(accounts[14]);
      new BigNumber(ether(10)).should.be.bignumber.equal(endingBalance.sub(balance));
    })
  })

  describe('transferBounty method', async function() {
    beforeEach(async function() {
      await this.crowdsale.sendTransaction({from: accounts[13], value: ether(500), gas: 1000000});
      this.bonusTokens = await this.crowdsale.getTimeBonus(ether(500) * 10000)
      this.bonusTokens = this.bonusTokens.add(await this.crowdsale.getMoneyBonus(ether(500) * 10000, ether(500)));
      await increaseTimeTo(this.startTime + duration.days(15) + duration.days(22));
      await this.crowdsale.sendTransaction({from: accounts[1], value: ether(1000), gas: 1000000});
      this.bonusTokens = this.bonusTokens.add(await this.crowdsale.getMoneyBonus(ether(1000) * 10000, ether(1000)));
    })
    it("bounty fund should be 3% of selling*2", async function() {
      await increaseTimeTo(this.endTime + duration.seconds(30));
      await this.crowdsale.finalize();
      let bountyFund = ((new BigNumber(ether(1500)* 10000).add(this.bonusTokens)).mul(2)).mul(3).div(100);
      let bounty = await this.crowdsale.bountyFund();
      bountyFund.should.be.bignumber.equal(bounty);
    })
    it("should reject bounty transfering because of calling not from manager", async function() {
      await increaseTimeTo(this.endTime + duration.seconds(30));
      await this.crowdsale.finalize();
      let bounty = await this.crowdsale.bountyFund();
      await assertRevert(this.crowdsale.transferBounty(accounts[1], bounty, {from: accounts[0]}));
    })
    it("should reject bounty transfering because of not finalize (fund == 0)", async function() {
      let bounty = await this.crowdsale.bountyFund();
      await assertRevert(this.crowdsale.transferBounty(accounts[1], bounty, {from: accounts[6]}));
    })
    it("should reject bounty transfering because of amount > fund", async function() {
      await increaseTimeTo(this.endTime + duration.seconds(30));
      await this.crowdsale.finalize();
      let bounty = await this.crowdsale.bountyFund();
      await assertRevert(this.crowdsale.transferBounty(accounts[17], bounty.add(1), {from: accounts[6]}));
    })
    it("should transfer bounty", async function() {
      await increaseTimeTo(this.endTime + duration.seconds(30));
      await this.crowdsale.finalize();
      let bounty = await this.crowdsale.bountyFund();
      await this.crowdsale.transferBounty(accounts[17], bounty, {from: accounts[6]});
      let balance = await this.token.balanceOf(accounts[17]);
      bounty.should.be.bignumber.equal(balance);
    })
    it("should reject because of bountyFund is empty before first time transfering", async function() {
      await increaseTimeTo(this.endTime + duration.seconds(30));
      await this.crowdsale.finalize();
      let bounty = await this.crowdsale.bountyFund();
      await this.crowdsale.transferBounty(accounts[17], bounty, {from: accounts[6]});
      await assertRevert(this.crowdsale.transferBounty(accounts[17], bounty, {from: accounts[6]}));
    })
  })

})

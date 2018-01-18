const assertRevert  = require('./helpers/assertRevert');
const latestTime  = require('./helpers/latestTime');
const duration = require('./helpers/durations');
const increaseTimeTo = require('./helpers/increaseTime');

const BASE_PATH = './../contracts';
const ALT0 = artifacts.require(`${BASE_PATH}/ALT0Token`);
const ALToken = artifacts.require(`${BASE_PATH}/ALToken`);
const ALTCrowdsale = artifacts.require(`${BASE_PATH}/ALTCrowdsale`);

const BigNumber = web3.BigNumber;
const should = require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

const saleBonuses = [0.25, 0.15, 0.10, 0.07, 0.05, 0];
const alt0Sum = 1000000;

let currentBonusDate = 0;

const stages = {
  PreSale: 0,
  Sale: 1
};

contract('Spec test', function(accounts) {
  let startTime, endTime, alt0, crowdsale, token, totalSupply, rate, bountyFund;

  const owner = accounts[0];

  const alt0Holders = accounts.slice(10, 20);
  const investors = accounts.slice(20, 45);
  const bountyAccounts = accounts.slice(45, 50);

  const beneficiary = accounts[6];
  const team = accounts[9];
  const advisers = accounts[8];
  const company = accounts[7];
  const bountyManager = accounts[6];

  describe('Fail case: Soft cap did not raise', () => {
    setup();

    generateStateVariablesDescribe();
    generateClosePreSaleDescribe();

    describe('STAGE 2: public pre sale', () => {
      alt0Holders.map(async (alt0Holder) => {
        generateCorrectConvertALT0toALTTest(alt0Holder);
        generateRejectReplyConvertALT0toALTTest(alt0Holder, 'reply');
      });

      generateRejectReplyConvertALT0toALTTest(beneficiary, 'incorrect');
      generateCorrectCrowdsaleBalanceTest();
      generateRejectBuyOverLimitTest();
      generateCheckInvestorsTokenBalanceTest(new BigNumber(0));
      generateCheckCrowdsaleStageTest('PreSale');

      it('should buy tokens x2 for half soft cap', async () => {
        const value = new BigNumber(web3.toWei(5));

        const preWeiRaised = await crowdsale.weiRaised.call();

        await Promise.all(investors.map(async (investor) => {
          const preBalance = await token.balanceOf.call(investor);

          await crowdsale.sendTransaction({from: investor, value: value});
          await crowdsale.sendTransaction({from: investor, value: value});

          const balance = await token.balanceOf.call(investor);

          const expectedSum = value.mul(2).mul(rate);

          balance.should.be.bignumber.equal(expectedSum.add(expectedSum.mul(currentBonus())).add(preBalance));
        }));

        const weiRaised = await crowdsale.weiRaised.call();

        weiRaised.should.be.bignumber.equal(value.mul(2).mul(investors.length).add(preWeiRaised));
      });

      generateRejectRefundTest();

      generateRejectWithdrawTest();

      generateCheckInvestorsTokenBalanceTest(new BigNumber(web3.toWei(10)));

      setTimeToPreSaleEnd();

      generateRejectWithdrawTest();

      investors.map(async (investor) => {
        it(`should approve refund ${investor}`, async () => {
          const preBalance = web3.eth.getBalance(investor);
          const refund = new BigNumber(web3.toWei(5 * 2));

          await crowdsale.refund(investor, {from: owner});

          const postBalance = web3.eth.getBalance(investor);
          const purchases = await crowdsale.purchases.call(investor);

          purchases.should.be.bignumber.equal(0);
          postBalance.should.be.bignumber.equal(preBalance.add(refund));
        });
      });

      generateCheckCrowdsaleStageTest('PreSale');

      it('should reject buy tokens for pre sale hard cap', async () => {
        const investor = investors[0];
        const value = web3.toWei(10);
        await assertRevert(crowdsale.sendTransaction({from: investor, value: value}));
      });
    });
  });

  describe('Success case: hard cap not raised', () => {
    setup();

    generateStateVariablesDescribe();
    generateClosePreSaleDescribe();

    describe('STAGE 2: public pre sale', () => {
      alt0Holders.map(async (alt0Holder) => {
        generateCorrectConvertALT0toALTTest(alt0Holder);
        generateRejectReplyConvertALT0toALTTest(alt0Holder, 'reply');
      });

      generateRejectReplyConvertALT0toALTTest(beneficiary, 'incorrect');
      generateCorrectCrowdsaleBalanceTest();
      generateRejectBuyOverLimitTest();
      generateCheckInvestorsTokenBalanceTest(new BigNumber(0));
      generateCheckCrowdsaleStageTest('PreSale');

      it('should buy tokens for half soft cap', async () => {
        const value = new BigNumber(web3.toWei(10));

        const preWeiRaised = await crowdsale.weiRaised.call();

        await Promise.all(investors.map(async (investor) => {
          const preBalance = await token.balanceOf.call(investor);
          await crowdsale.sendTransaction({from: investor, value: value});
          const balance = await token.balanceOf.call(investor);

          const expectedSum = value.mul(rate);

          balance.should.be.bignumber.equal(expectedSum.add(expectedSum.mul(currentBonus())).add(preBalance));
        }));

        const weiRaised = await crowdsale.weiRaised.call();

        weiRaised.should.be.bignumber.equal(value.mul(investors.length).add(preWeiRaised));
      });

      generateRejectRefundTest();
      generateRejectFinalizeTest();
      generateRejectWithdrawTest();
      generatePauseTest();

      it('should buy tokens for other half soft cap', async () => {
        const value = new BigNumber(web3.toWei(10));

        const preWeiRaised = await crowdsale.weiRaised.call();

        await Promise.all(investors.map(async (investor) => {
          const preBalance = await token.balanceOf.call(investor);
          await crowdsale.sendTransaction({from: investor, value: value});
          const balance = await token.balanceOf.call(investor);

          const expectedSum = value.mul(rate);

          balance.should.be.bignumber.equal(expectedSum.add(expectedSum.mul(currentBonus())).add(preBalance));
        }));

        const weiRaised = await crowdsale.weiRaised.call();

        weiRaised.should.be.bignumber.equal(value.mul(investors.length).add(preWeiRaised));
      });

      generateCheckInvestorsTokenBalanceTest((new BigNumber(web3.toWei(20))));

      it('should approve withdraw', async () => {
        const preBalance = web3.eth.getBalance(beneficiary);
        const weiRaised = await crowdsale.weiRaised.call();

        await crowdsale.withdraw(beneficiary, weiRaised, {from: owner});

        const balance = web3.eth.getBalance(beneficiary);
        const crowdsaleBalance = web3.eth.getBalance(crowdsale.address);

        balance.should.be.bignumber.equal(preBalance.add(weiRaised));
        crowdsaleBalance.should.be.bignumber.equal(0);
      });

      generateRejectRefundTest();

      generateCheckCrowdsaleStageTest('PreSale');

      it('should send tokens', async () => {
        await crowdsale.transferTokens(beneficiary, toTokens(5000000));
        const balance = await token.balanceOf.call(beneficiary);
        balance.should.be.bignumber.equal(toTokens(5000000));
      });

      setTimeToPreSaleEnd();

      it('should buy tokens and push stage', async () => {
        const investor = investors[0];
        const value = new BigNumber(web3.toWei(0.05));

        await crowdsale.sendTransaction({from: investor, value: value});
      });
    });

    describe('STAGE 3: public sale', () => {
      generateCheckCrowdsaleStageTest('Sale');
      generateRejectBuyLessMinimalAmountTest();
    });
  });

  describe('Success case: hard cap raised', () => {
    setup();

    generateStateVariablesDescribe();
    generateClosePreSaleDescribe();

    describe('STAGE 2: public pre sale', () => {
      alt0Holders.map(async (alt0Holder) => {
        generateCorrectConvertALT0toALTTest(alt0Holder);
        generateRejectReplyConvertALT0toALTTest(alt0Holder, 'reply');
      });

      generateRejectReplyConvertALT0toALTTest(beneficiary, 'incorrect');
      generateCorrectCrowdsaleBalanceTest();
      generateRejectBuyOverLimitTest();
      generateCheckInvestorsTokenBalanceTest(new BigNumber(0));
      generateCheckCrowdsaleStageTest('PreSale');

      it('should buy tokens for half soft cap', async () => {
        const value = new BigNumber(web3.toWei(10));

        const preWeiRaised = await crowdsale.weiRaised.call();

        await Promise.all(investors.map(async (investor) => {
          const preBalance = await token.balanceOf.call(investor);
          await crowdsale.sendTransaction({from: investor, value: value});
          const balance = await token.balanceOf.call(investor);

          const expectedSum = value.mul(rate);

          balance.should.be.bignumber.equal(expectedSum.add(expectedSum.mul(currentBonus())).add(preBalance));
        }));

        const weiRaised = await crowdsale.weiRaised.call();

        weiRaised.should.be.bignumber.equal(value.mul(investors.length).add(preWeiRaised));
      });

      generateRejectRefundTest();
      generateRejectFinalizeTest();
      generateRejectWithdrawTest();
      generatePauseTest();

      it('should buy tokens for other half soft cap', async () => {
        const value = new BigNumber(web3.toWei(10));

        const preWeiRaised = await crowdsale.weiRaised.call();

        await Promise.all(investors.map(async (investor) => {
          const preBalance = await token.balanceOf.call(investor);
          await crowdsale.sendTransaction({from: investor, value: value});
          const balance = await token.balanceOf.call(investor);

          const expectedSum = value.mul(rate);

          balance.should.be.bignumber.equal(expectedSum.add(expectedSum.mul(currentBonus())).add(preBalance));
        }));

        const weiRaised = await crowdsale.weiRaised.call();

        weiRaised.should.be.bignumber.equal(value.mul(investors.length).add(preWeiRaised));
      });

      generateCheckInvestorsTokenBalanceTest((new BigNumber(web3.toWei(20))));
      generateApproveWithdrawTest();
      generateRejectRefundTest();
      generateCheckCrowdsaleStageTest('PreSale');

      it('should send tokens', async () => {
        await crowdsale.transferTokens(beneficiary, toTokens(5000000));
        const balance = await token.balanceOf.call(beneficiary);

        balance.should.be.bignumber.equal(toTokens(5000000));
      });

      investors.map(async (investor) => {
        generateBuyTokensTest(investor, new BigNumber(web3.toWei(320)));
      });

    });

    describe('STAGE 3: public sale', () => {
      generateCheckCrowdsaleStageTest('Sale');
      generateRejectBuyLessMinimalAmountTest();

      saleBonuses.slice(1).map((bonus, index) => {
        it('should change bonus time', async () => {
          currentBonusDate = index;
          const bonusesDate = (await crowdsale.bonusesDates.call(currentBonusDate)).toNumber() - 10;
          await increaseTimeTo(bonusesDate);
        });

        generateBuyTokensTest(investors[0], new BigNumber(web3.toWei(10)));
      });

      it('should change bonus time', async () => {
        currentBonusDate = 5;
      });

      it('should increase time to end sale', async () => {
        const saleEndTime = await crowdsale.endTimes.call(1);
        await increaseTimeTo(saleEndTime.toNumber());
      });

      it('should still token on pause', async () => {
        (await token.paused.call()).should.be.equal(true);
      });

      it('should finalize sale', async () => {
        const soldTokens = await crowdsale.soldTokens.call();
        await crowdsale.finalize();
        const fund = soldTokens.mul(2);

        bountyFund = await crowdsale.bountyFund.call();

        (await token.balanceOf(company)).should.be.not.equal(fund.mul(0.32));
        (await token.balanceOf(team)).should.be.not.equal(fund.mul(0.13));
        (await token.balanceOf(advisers)).should.be.not.equal(fund.mul(0.02));
      });

      it('should remove token from pause', async () => {
        (await token.paused.call()).should.be.equal(false);
      });

      alt0Holders.map((alt0Holder) => {
        it(`should still 50% alt0 holder ${alt0Holder} tokens on hold`, async () => {
          const balance = await token.balanceOf.call(alt0Holder);
          const holdOnBalance = await token.holdOnBalanceOf.call(alt0Holder);
          const nonHoldOnBalance = await token.nonHoldOnBalanceOf.call(alt0Holder);

          balance.div(2).should.be.bignumber.equal(holdOnBalance);
          balance.div(2).should.be.bignumber.equal(nonHoldOnBalance);
        });
      });

      it(`should still 100% company holder ${company} tokens on hold`, async () => {
        const balance = await token.balanceOf.call(company);
        const holdOnBalance = await token.holdOnBalanceOf.call(company);
        const nonHoldOnBalance = await token.nonHoldOnBalanceOf.call(company);

        holdOnBalance.should.be.bignumber.equal(0);
        nonHoldOnBalance.should.be.bignumber.equal(balance);
      });

      it(`should still 100% team holder ${team} tokens on hold`, async () => {
        const balance = await token.balanceOf.call(team);
        const holdOnBalance = await token.holdOnBalanceOf.call(team);
        const nonHoldOnBalance = await token.nonHoldOnBalanceOf.call(team);

        holdOnBalance.should.be.bignumber.equal(balance);
        nonHoldOnBalance.should.be.bignumber.equal(0);
      });

      it(`should still 50% advisers ${advisers} tokens on hold`, async () => {
        const balance = await token.balanceOf.call(advisers);
        const holdOnBalance = await token.holdOnBalanceOf.call(advisers);
        const nonHoldOnBalance = await token.nonHoldOnBalanceOf.call(advisers);

        balance.div(2).should.be.bignumber.equal(holdOnBalance);
        balance.div(2).should.be.bignumber.equal(nonHoldOnBalance);
      });

      bountyAccounts.map((bountyAccount) => {
        it(`should send bounty to ${bountyAccount}`, async () => {
          const value = bountyFund.div(bountyAccounts.length);

          await crowdsale.transferBounty(bountyAccount, value, { from: bountyManager });

          const balance = await token.balanceOf.call(bountyAccount);
          const holdOnBalance = await token.holdOnBalanceOf.call(bountyAccount);
          const nonHoldOnBalance = await token.nonHoldOnBalanceOf.call(bountyAccount);

          holdOnBalance.should.be.bignumber.equal(balance);
          nonHoldOnBalance.should.be.bignumber.equal(0);
        })
      });

      it(`should withdraw rest tokens from crowdsale`, async () => {
        const preBalance = await token.balanceOf.call(crowdsale.address);
        await crowdsale.withdrawRestTokens(owner);
        const balance = await token.balanceOf.call(crowdsale.address);
        const ownerBalance = await token.balanceOf.call(owner);

        balance.should.be.bignumber.equal(0);
        ownerBalance.should.be.bignumber.equal(preBalance);
      });

      it(`should reject transfer all token balance from owner balance to some account`, async () => {
        const balance = await token.balanceOf.call(owner);
        await token.transfer(investors[0], balance, { from: owner })
      });

      it(`should reject transfer all token balance from team balance to some account`, async () => {
        const balance = await token.balanceOf.call(team);
        await assertRevert(token.transfer(investors[0], balance, { from: team }));
        await assertRevert(token.transfer(investors[0], toTokens(1), { from: team }));
      });

      it(`should reject transfer all token balance from advisers balance to some account`, async () => {
        const balance = await token.balanceOf.call(advisers);
        await assertRevert(token.transfer(investors[0], balance, { from: advisers }));
      });

      it(`should transfer half token balance from advisers balance to some account`, async () => {
        const balance = await token.balanceOf.call(advisers);
        await token.transfer(investors[0], balance.div(2), { from: advisers })
      });

      it(`should increase time to unhold advisers tokens date`, async () => {
        const saleEndTime = await crowdsale.endTimes.call(1);
        await increaseTimeTo(saleEndTime.add(duration.years(1)).toNumber());
      });

      it(`should transfer all token balance from advisers balance to some account`, async () => {
        const balance = await token.balanceOf.call(advisers);
        await token.transfer(investors[0], balance, { from: advisers });
      });

      it(`should burn all own tokens`, async () => {
        const balance = await token.balanceOf.call(investors[0]);
        await token.burn(balance, { from: investors[0] });
      });
    });
  });

  function generateStateVariablesDescribe() {
    describe('State variables', () => {
      it('should have correct token address', async () => {
        (await crowdsale.token.call()).should.be.not.equal('0x0000000000000000000000000000000000000000');
      });

      it('should have correct rate', async () => {
        (await crowdsale.rate.call()).should.be.bignumber.equal(10000);
      });

      it('should have correct soft cap', async () => {
        (await crowdsale.SOFT_CAP.call()).should.be.bignumber.equal(new BigNumber(web3.toWei(500)));
      });

      it('should have correct hard cap', async () => {
        (await crowdsale.HARD_CAP_BY_STAGES.call(1)).should.be.bignumber.equal((new BigNumber(toTokens(500000000))));
      });

      it('should have correct min amount', async () => {
        (await crowdsale.MIN_AMOUNT.call()).should.be.bignumber.equal(new BigNumber(web3.toWei(0.05)));
      });
    });
  }

  function generateClosePreSaleDescribe() {
    describe('STAGE 1: closed pre sale', () => {
      it('should mint ALT0 tokens', async () => {
        await Promise.all(alt0Holders.map(async (alt0Holder) => {
          await alt0.mint(alt0Holder, toTokens(alt0Sum));

          (await alt0.balanceOf.call(alt0Holder)).should.be.bignumber.equal(toTokens(alt0Sum));
        }));

        (await alt0.totalSupply.call()).should.be.bignumber.equal(toTokens(alt0Sum).mul(alt0Holders.length));
      });
    });
  }

  function generateCorrectConvertALT0toALTTest(alt0Holder) {
    it(`should correct convert ALT0 to ALT 1:25 for ${alt0Holder} holder`, async () => {
      await crowdsale.convertALT0(alt0Holder);

      const alt0Balance = await alt0.balanceOf.call(alt0Holder);
      const altBalance = await token.balanceOf.call(alt0Holder);

      const issued = await crowdsale.ALT0Holders.call(alt0Holder);

      issued.div(25).should.be.bignumber.equal(alt0Balance);
      altBalance.should.be.bignumber.equal(alt0Balance.mul(25));
    });
  }

  function generateRejectReplyConvertALT0toALTTest(alt0Holder, cause) {
    it(`should reject ${cause} convert ALT0 to ALT 1:25 for ${alt0Holder} holder`, async () => {
      await assertRevert(crowdsale.convertALT0(alt0Holder));
    });
  }

  function generateCorrectCrowdsaleBalanceTest() {
    it('should have correct crowdsale balance', async () => {
      const balance = await token.balanceOf.call(crowdsale.address);

      (totalSupply).should.be.bignumber.equal(balance.add(toTokens(alt0Sum).mul(alt0Holders.length).mul(25)));
    });
  }

  function generateRejectBuyOverLimitTest() {
    it('should reject buy over limit', async () => {
      const investor = investors[0];
      const tokenBalance = await token.balanceOf.call(crowdsale.address);

      await assertRevert(crowdsale.sendTransaction({from: investor, value: tokenBalance.div(rate)}));
      await assertRevert(crowdsale.sendTransaction({
        from: investor,
        value: totalSupply.add(toTokens(1)).div(rate).div(2)
      }));
    });
  }

  function generateCheckInvestorsTokenBalanceTest(expected) {
    it(`should check investors balance and return ${expected.toNumber()}`, async () => {
      await Promise.all(investors.map(async (investor) => {
        const balance = await token.balanceOf.call(investor);
        balance.should.be.bignumber.equal(expected.mul(rate).add(expected.mul(rate).mul(currentBonus())));
      }));
    });
  }

  function generateCheckCrowdsaleStageTest(stageName) {
    it(`should have ${stageName} stage`, async () => {
      const stage = await crowdsale.stage.call();
      stage.should.be.bignumber.equal(stages[stageName]);
    });
  }

  function generateRejectRefundTest () {
    it('should reject refund', async () => {
      await Promise.all(investors.map(async (investor) => {
        await assertRevert(crowdsale.refund(investor));
      }));
    });
  }

  function generateRejectFinalizeTest () {
    it('should reject finalize', async () => {
      await assertRevert(crowdsale.finalize());
    });
  }

  function generateRejectWithdrawTest () {
    it('should reject withdraw', async () => {
      const weiRaised = await crowdsale.weiRaised.call();
      await assertRevert(crowdsale.withdraw(owner, weiRaised));
    });
  }

  function generatePauseTest () {
    it('should set pause', async () => {
      await crowdsale.pause();

      const paused = await crowdsale.paused.call();
      paused.should.be.equal(true);
    });

    it('should reject buy when paused', async () => {
      const investor = investors[0];
      const value = new BigNumber(web3.toWei(10));

      await assertRevert(crowdsale.sendTransaction({from: investor, value: value}));
    });

    it('should set unpause', async () => {
      await crowdsale.unpause();

      const paused = await crowdsale.paused.call();
      paused.should.be.equal(false);
    });
  }

  function generateApproveWithdrawTest () {
    it('should approve withdraw', async () => {
      const preBalance = web3.eth.getBalance(beneficiary);
      const weiRaised = await crowdsale.weiRaised.call();

      await crowdsale.withdraw(beneficiary, weiRaised, {from: owner});

      const balance = web3.eth.getBalance(beneficiary);
      const crowdsaleBalance = web3.eth.getBalance(crowdsale.address);

      balance.should.be.bignumber.equal(preBalance.add(weiRaised));
      crowdsaleBalance.should.be.bignumber.equal(0);
    });
  }

  function generateRejectBuyLessMinimalAmountTest () {
    it('should reject buy less minimal amount', async () => {
      const investor = investors[0];
      const value = new BigNumber(web3.toWei(0.04));

      await assertRevert(crowdsale.sendTransaction({from: investor, value: value}));
    });
  }
  
  function generateBuyTokensTest (investor, value) {
    it('should buy tokens', async () => {
      const preBalance = await token.balanceOf.call(investor);

      await crowdsale.sendTransaction({ from: investor, value: value });

      const balance = await token.balanceOf.call(investor);
      const expectedSum = value.mul(rate);

      balance.should.be.bignumber.equal(expectedSum.add(expectedSum.mul(currentBonus())).add(preBalance));
    });
  }

  function setTimeToPreSaleEnd () {
    it('should increase time to end pre sale', async () => {
      const preSaleEndTime = await crowdsale.endTimes.call(0);
      await increaseTimeTo(preSaleEndTime.toNumber());
    });
  }

  function setup () {
    before(async function () {
      startTime = latestTime() + duration.seconds(1);
      endTime = startTime + duration.weeks(10);

      alt0 = await ALT0.new();

      crowdsale = await ALTCrowdsale.new(startTime, endTime, team, advisers, company, alt0.address, bountyManager);

      token = ALToken.at(await crowdsale.token());
      totalSupply = await token.totalSupply.call();
      rate = await crowdsale.rate.call();
    });
  }
});

function toTokens (amount) {
  return new BigNumber(web3.toWei(amount));
}

function currentBonus () {
 return saleBonuses[currentBonusDate];
}

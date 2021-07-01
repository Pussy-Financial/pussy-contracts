const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const Decimal = require('decimal.js');

const { duration, latest } = require('./helpers/Time');
const Contracts = require('./helpers/Contracts');

const {
    constants: { AddressZero: ZERO_ADDRESS }
} = ethers;

describe('PussyHODLFarm', () => {
    const TOTAL_SUPPLY = BigNumber.from(1_000_000_000_000).mul(BigNumber.from(10).pow(18));
    const RATE_FACTOR = BigNumber.from(10).pow(BigNumber.from(18));

    let accounts;
    let owner;
    let nonOwner;

    let stakeToken;
    let rewardToken;
    let pussyHODLFarm;

    let now;
    let prevNow;

    const setTime = async (time) => {
        prevNow = now;
        now = time;

        await pussyHODLFarm.setTime(now);
    };

    before(async () => {
        accounts = await ethers.getSigners();

        owner = accounts[0];
        nonOwner = accounts[1];

        now = await latest();
    });

    beforeEach(async () => {
        stakeToken = await Contracts.TestERC20Token.deploy('Stake Token', 'STKN', TOTAL_SUPPLY);
        rewardToken = await Contracts.TestERC20Token.deploy('Reward Token', 'RTKN', TOTAL_SUPPLY);
    });

    describe('construction', () => {
        it('should revert when initialized with an invalid stake token address', async () => {
            await expect(
                Contracts.TestPussyHODLFarm.deploy(
                    ZERO_ADDRESS,
                    rewardToken.address,
                    BigNumber.from(0),
                    now.add(BigNumber.from(100)),
                    BigNumber.from(1)
                )
            ).to.be.revertedWith('INVALID_ADDRESS');
        });

        it('should revert when initialized with an invalid reward token address', async () => {
            await expect(
                Contracts.TestPussyHODLFarm.deploy(
                    stakeToken.address,
                    ZERO_ADDRESS,
                    BigNumber.from(0),
                    now.add(BigNumber.from(100)),
                    BigNumber.from(1)
                )
            ).to.be.revertedWith('INVALID_ADDRESS');
        });

        it('should revert when initialized with an invalid time', async () => {
            await expect(
                Contracts.TestPussyHODLFarm.deploy(
                    stakeToken.address,
                    rewardToken.address,
                    now.add(BigNumber.from(100)),
                    now.add(BigNumber.from(10)),
                    BigNumber.from(1)
                )
            ).to.be.revertedWith('INVALID_DURATION');

            await expect(
                Contracts.TestPussyHODLFarm.deploy(
                    stakeToken.address,
                    rewardToken.address,
                    BigNumber.from(0),
                    now.sub(BigNumber.from(10)),
                    BigNumber.from(1)
                )
            ).to.be.revertedWith('INVALID_DURATION');
        });

        it('should revert when initialized with an invalid reward amount', async () => {
            await expect(
                Contracts.TestPussyHODLFarm.deploy(
                    stakeToken.address,
                    rewardToken.address,
                    BigNumber.from(0),
                    now.add(BigNumber.from(10)),
                    BigNumber.from(0)
                )
            ).to.be.revertedWith('INVALID_VALUE');
        });

        it('should be properly initialized', async () => {
            const startTime = now;
            const endTime = now.add(BigNumber.from(100));
            const rewardRate = BigNumber.from(1000);

            const pussyHODLFarm = await Contracts.TestPussyHODLFarm.deploy(
                stakeToken.address,
                rewardToken.address,
                startTime,
                endTime,
                rewardRate
            );

            const program = await pussyHODLFarm.getProgram();
            expect(program[0]).to.equal(startTime);
            expect(program[1]).to.equal(endTime);
            expect(program[2]).to.equal(rewardRate);
            expect(program[3]).to.equal(endTime.sub(startTime).mul(rewardRate));

            expect(await pussyHODLFarm.getTotalStaked()).to.equal(BigNumber.from(0));
            expect(await pussyHODLFarm.time()).to.equal(await latest());
        });
    });

    describe('rewards', () => {
        let stakeAmounts;
        let totalStakedAmount;

        let programStartTime;
        let programEndTime;
        const REWARDS_DURATION = duration.days(30);
        const REWARD_RATE = BigNumber.from(10 ** 9)
            .mul(BigNumber.from(10).pow(18))
            .div(REWARDS_DURATION);

        beforeEach(async () => {
            stakeAmounts = {};

            for (const account of accounts) {
                stakeAmounts[account.address] = BigNumber.from(0);
            }

            totalStakedAmount = BigNumber.from(0);
        });

        const expectAlmostEqual = (amount1, amount2, maxError = 0.0000000001) => {
            if (!amount1.eq(amount2)) {
                const error = new Decimal(amount1.toString()).div(amount2.toString()).sub(1).abs();
                expect(error.lte(maxError)).to.equal(true, `error = ${error.toFixed(maxError.length)}`);
            }
        };

        const stake = async (account, amount) => {
            await stakeToken.transfer(account.address, amount);

            expect(await pussyHODLFarm.getStake(account.address)).to.equal(stakeAmounts[account.address]);
            expect(await pussyHODLFarm.getTotalStaked()).to.equal(totalStakedAmount);

            const prevAccountBalance = await stakeToken.balanceOf(account.address);
            const prevFarmBalance = await stakeToken.balanceOf(pussyHODLFarm.address);
            const prevClaimed = await pussyHODLFarm.getClaimed(account.address);

            await stakeToken.connect(account).approve(pussyHODLFarm.address, amount);
            const res = await pussyHODLFarm.connect(account).stake(amount);
            await expect(res).to.emit(pussyHODLFarm, 'Staked').withArgs(account.address, amount);

            stakeAmounts[account.address] = stakeAmounts[account.address].add(amount);
            totalStakedAmount = totalStakedAmount.add(amount);

            expect(await stakeToken.balanceOf(account.address)).to.equal(prevAccountBalance.sub(amount));
            expect(await stakeToken.balanceOf(pussyHODLFarm.address)).to.equal(prevFarmBalance.add(amount));
            expect(await pussyHODLFarm.getClaimed(account.address)).to.equal(prevClaimed);
            expect(await pussyHODLFarm.getStake(account.address)).to.equal(stakeAmounts[account.address]);
            expect(await pussyHODLFarm.getTotalStaked()).to.equal(totalStakedAmount);
        };

        const withdraw = async (account, amount) => {
            expect(await pussyHODLFarm.getStake(account.address)).to.equal(stakeAmounts[account.address]);
            expect(await pussyHODLFarm.getTotalStaked()).to.equal(totalStakedAmount);

            const prevAccountBalance = await stakeToken.balanceOf(account.address);
            const prevFarmBalance = await stakeToken.balanceOf(pussyHODLFarm.address);
            const prevClaimed = await pussyHODLFarm.getClaimed(account.address);

            const res = await pussyHODLFarm.connect(account).withdraw(amount);
            await expect(res).to.emit(pussyHODLFarm, 'Withdrawn').withArgs(account.address, amount);

            stakeAmounts[account.address] = stakeAmounts[account.address].sub(amount);
            totalStakedAmount = totalStakedAmount.sub(amount);

            expect(await stakeToken.balanceOf(account.address)).to.equal(prevAccountBalance.add(amount));
            expect(await stakeToken.balanceOf(pussyHODLFarm.address)).to.equal(prevFarmBalance.sub(amount));
            expect(await pussyHODLFarm.getClaimed(account.address)).to.equal(prevClaimed);
            expect(await pussyHODLFarm.getStake(account.address)).to.equal(stakeAmounts[account.address]);
            expect(await pussyHODLFarm.getTotalStaked()).to.equal(totalStakedAmount);
        };

        const claim = async (account) => {
            const reward = await pussyHODLFarm.getPendingRewards(account.address);
            const expectedReward = expectedRelativeRewards(account);

            expect(reward).to.equal(expectedReward);

            const claimable = await pussyHODLFarm.connect(account).callStatic.claim();
            expect(claimable).to.equal(reward);

            const prevAccountBalance = await rewardToken.balanceOf(account.address);
            const prevFarmBalance = await rewardToken.balanceOf(pussyHODLFarm.address);
            const prevClaimed = await pussyHODLFarm.getClaimed(account.address);

            const tx = await pussyHODLFarm.connect(account).claim();
            if (claimable.gt(BigNumber.from(0))) {
                await expect(tx).to.emit(pussyHODLFarm, 'Claimed').withArgs(account.address, claimable);
            }

            expect(await pussyHODLFarm.getPendingRewards(account.address)).to.equal(BigNumber.from(0));

            expect(await rewardToken.balanceOf(account.address)).to.equal(prevAccountBalance.add(reward));
            expect(await rewardToken.balanceOf(pussyHODLFarm.address)).to.equal(prevFarmBalance.sub(reward));
            expect(await pussyHODLFarm.getClaimed(account.address)).to.equal(prevClaimed.add(reward));
            expect(await pussyHODLFarm.getStake(account.address)).to.equal(stakeAmounts[account.address]);
            expect(await pussyHODLFarm.getTotalStaked()).to.equal(totalStakedAmount);
        };

        const expectedRewards = (account, duration) => {
            const reward = BigNumber.from(0);

            if (totalStakedAmount.eq(BigNumber.from(0))) {
                return reward;
            }

            if (duration.lte(BigNumber.from(0))) {
                return reward;
            }

            return stakeAmounts[account.address]
                .mul(duration.mul(REWARD_RATE).mul(RATE_FACTOR).div(totalStakedAmount))
                .div(RATE_FACTOR);
        };

        const expectedRelativeRewards = (account) => {
            const effectiveTime = BigNumber.min(now, programEndTime);
            return expectedRewards(account, effectiveTime.sub(prevNow));
        };

        const testRewards = async (account) => {
            const reward = await pussyHODLFarm.getPendingRewards(account.address);

            const effectiveTime = BigNumber.min(now, programEndTime);
            const expectedReward = expectedRewards(account, effectiveTime.sub(programStartTime));

            expect(reward).to.equal(expectedReward);
        };

        const testPartialRewards = async (account, prevReward) => {
            const reward = await pussyHODLFarm.getPendingRewards(account.address);
            const extraReward = expectedRelativeRewards(account);

            expectAlmostEqual(prevReward.add(extraReward), reward);
        };

        const tests = (accountsIndices = []) => {
            for (let i = 0; i < accountsIndices.length; ++i) {
                context(`account #${accountsIndices[i]}`, () => {
                    let account;

                    beforeEach(async () => {
                        account = accounts[accountsIndices[i]];
                    });

                    describe('querying', () => {
                        it('should properly calculate all rewards', async () => {
                            await setTime(now.add(duration.seconds(1)));
                            await testRewards(account);

                            await setTime(programStartTime.add(duration.days(1)));
                            await testRewards(account);

                            await setTime(programStartTime.add(duration.weeks(1)));
                            await testRewards(account);

                            await setTime(programEndTime);
                            await testRewards(account, duration.weeks(4));

                            await setTime(programEndTime.add(duration.days(1)));
                            await testRewards(account, duration.weeks(4));
                        });

                        it('should not affect the rewards, when staking at the same block', async () => {
                            const account3 = accounts[3];

                            await setTime(programStartTime.add(duration.weeks(5)));

                            const reward = await pussyHODLFarm.getPendingRewards(account.address);
                            await stake(account, BigNumber.from(1).mul(BigNumber.from(10).pow(BigNumber.from(18))));

                            expectAlmostEqual(await pussyHODLFarm.getPendingRewards(account.address), reward);

                            await stake(account, BigNumber.from(11111).mul(BigNumber.from(10).pow(BigNumber.from(18))));
                            await stake(
                                account3,
                                BigNumber.from(1000000).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );

                            expectAlmostEqual(await pussyHODLFarm.getPendingRewards(account.address), reward);

                            await stake(account, BigNumber.from(11111).mul(BigNumber.from(10).pow(BigNumber.from(18))));
                            await stake(account3, BigNumber.from(1).mul(BigNumber.from(10).pow(BigNumber.from(18))));
                            await stake(
                                account,
                                BigNumber.from(234324234234).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );

                            expectAlmostEqual(await pussyHODLFarm.getPendingRewards(account.address), reward);
                        });

                        it('should properly calculate all rewards when staking', async () => {
                            await setTime(programStartTime);

                            const account3 = accounts[3];

                            let prevReward = await pussyHODLFarm.getPendingRewards(account.address);

                            await stake(account, BigNumber.from(1000).mul(BigNumber.from(10).pow(BigNumber.from(18))));

                            await setTime(now.add(duration.days(1)));
                            await testPartialRewards(account, prevReward);

                            prevReward = await pussyHODLFarm.getPendingRewards(account.address);

                            await stake(
                                account,
                                BigNumber.from(28238238).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );

                            await stake(
                                account3,
                                BigNumber.from(50000).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );

                            await setTime(now.add(duration.days(1)));
                            await testPartialRewards(account, prevReward);

                            prevReward = await pussyHODLFarm.getPendingRewards(account.address);

                            await stake(
                                account,
                                BigNumber.from(990930923).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );
                            await stake(
                                account3,
                                BigNumber.from(2666678).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );

                            await setTime(now.add(duration.weeks(2)));
                            await testPartialRewards(account, prevReward, duration.weeks(2));
                        });

                        it('should properly calculate new stake rewards after the program has ended', async () => {
                            await setTime(programEndTime.add(duration.days(1)));

                            const account3 = accounts[3];
                            await stake(
                                account3,
                                BigNumber.from(1000000).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );

                            const reward = await pussyHODLFarm.getPendingRewards(account3.address);
                            expect(reward).to.equal(BigNumber.from(0));

                            const claimed = await pussyHODLFarm.connect(account3).callStatic.claim();
                            expect(claimed).to.equal(reward);
                        });
                    });

                    describe('claiming', () => {
                        beforeEach(async () => {
                            await setTime(programStartTime);
                        });

                        it('should claim all rewards', async () => {
                            await setTime(programStartTime.add(duration.seconds(1)));
                            await claim(account);

                            await setTime(programStartTime.add(duration.days(1)));
                            await claim(account);

                            await setTime(programStartTime.add(duration.weeks(1)));
                            await claim(account);

                            await setTime(programStartTime.add(duration.weeks(3)));
                            await claim(account, duration.weeks(2));

                            await setTime(programEndTime);
                            await claim(account, duration.weeks(4));

                            await setTime(programEndTime.add(duration.days(1)));
                            await claim(account);
                        });
                    });

                    describe('withdrawing', () => {
                        beforeEach(async () => {
                            await setTime(programStartTime);
                        });

                        it('should not allow withdrawing before the end of the program', async () => {
                            const account3 = accounts[3];

                            await stake(
                                account3,
                                BigNumber.from(1000000).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );

                            await expect(withdraw(account, BigNumber.from(1000))).to.be.revertedWith('STAKE_LOCKED');
                            await expect(withdraw(account3, BigNumber.from(1000))).to.be.revertedWith('STAKE_LOCKED');

                            await setTime(now.add(duration.weeks(2)));

                            await expect(withdraw(account, BigNumber.from(1000))).to.be.revertedWith('STAKE_LOCKED');
                            await expect(withdraw(account3, BigNumber.from(1000))).to.be.revertedWith('STAKE_LOCKED');

                            await setTime(programEndTime);

                            await withdraw(account, BigNumber.from(1000));
                            await withdraw(account3, BigNumber.from(1000));
                        });

                        it('should not affect the rewards, when withdrawing in the same block', async () => {
                            const account3 = accounts[3];

                            await stake(
                                account3,
                                BigNumber.from(1000000).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );

                            await setTime(programEndTime.add(duration.weeks(5)));

                            const reward = await pussyHODLFarm.getPendingRewards(account.address);

                            await withdraw(account, BigNumber.from(1000));
                            await withdraw(account3, BigNumber.from(1000));

                            expectAlmostEqual(await pussyHODLFarm.getPendingRewards(account.address), reward);

                            await withdraw(account3, BigNumber.from(50000));

                            expectAlmostEqual(await pussyHODLFarm.getPendingRewards(account.address), reward);

                            await withdraw(account3, BigNumber.from(500000));

                            expectAlmostEqual(await pussyHODLFarm.getPendingRewards(account.address), reward);
                        });

                        it('should properly calculate all rewards when withdrawing', async () => {
                            await setTime(programStartTime);

                            const account3 = accounts[3];

                            await stake(
                                account3,
                                BigNumber.from(1000000).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );

                            let prevReward = await pussyHODLFarm.getPendingRewards(account.address);

                            await setTime(programEndTime.add(duration.seconds(1)));
                            await testPartialRewards(account, prevReward);

                            prevReward = await pussyHODLFarm.getPendingRewards(account.address);

                            await withdraw(account, BigNumber.from(500000));
                            await withdraw(account3, BigNumber.from(500000));

                            await setTime(now.add(duration.days(1)));
                            await testPartialRewards(account, prevReward);

                            prevReward = await pussyHODLFarm.getPendingRewards(account.address);

                            await withdraw(account, BigNumber.from(100000));

                            await setTime(now.add(duration.days(1)));
                            await testPartialRewards(account, prevReward);

                            prevReward = await pussyHODLFarm.getPendingRewards(account.address);

                            await withdraw(account, BigNumber.from(200000));
                            await withdraw(account3, BigNumber.from(300000));

                            await setTime(now.add(duration.weeks(3)));
                            await testPartialRewards(account, prevReward, duration.weeks(3));
                        });

                        it('should keep all rewards when withdrawing', async () => {
                            await setTime(programEndTime.add(duration.weeks(1)));

                            const unclaimed = await pussyHODLFarm.getPendingRewards(account.address);
                            expect(unclaimed).to.equal(expectedRelativeRewards(account));

                            const prevBalance = await stakeToken.balanceOf(account.address);
                            const staked = await pussyHODLFarm.getStake(account.address);
                            await withdraw(account, staked);
                            expect(await stakeToken.balanceOf(account.address)).to.equal(prevBalance.add(staked));

                            let reward = await pussyHODLFarm.getPendingRewards(account.address);
                            expectAlmostEqual(reward, unclaimed);

                            await setTime(now.add(duration.weeks(1)));
                            reward = await pussyHODLFarm.getPendingRewards(account.address);
                            expectAlmostEqual(reward, unclaimed);

                            await setTime(now.add(duration.weeks(2)));
                            reward = await pussyHODLFarm.getPendingRewards(account.address);
                            expectAlmostEqual(reward, unclaimed);
                        });

                        it('should keep all rewards when partially withdrawing', async () => {
                            await setTime(programEndTime.add(duration.weeks(1)));

                            const unclaimed = await pussyHODLFarm.getPendingRewards(account.address);
                            expect(unclaimed).to.equal(expectedRelativeRewards(account));

                            const prevBalance = await stakeToken.balanceOf(account.address);
                            const staked = await pussyHODLFarm.getStake(account.address);
                            await withdraw(account, staked.div(2));
                            expect(await stakeToken.balanceOf(account.address)).to.equal(
                                prevBalance.add(staked.div(2))
                            );

                            let reward = await pussyHODLFarm.getPendingRewards(account.address);
                            expectAlmostEqual(reward, unclaimed);

                            await setTime(now.add(duration.weeks(1)));
                            reward = await pussyHODLFarm.getPendingRewards(account.address);
                            expectAlmostEqual(reward, unclaimed);

                            await setTime(now.add(duration.weeks(1)));
                            reward = await pussyHODLFarm.getPendingRewards(account.address);
                            expectAlmostEqual(reward, unclaimed);

                            await setTime(now.add(duration.weeks(1)));
                            reward = await pussyHODLFarm.getPendingRewards(account.address);
                            expectAlmostEqual(reward, unclaimed);
                        });

                        it('should allow claiming rewards after withdrawal', async () => {
                            await setTime(programEndTime.add(duration.weeks(1)));

                            const unclaimed = await pussyHODLFarm.getPendingRewards(account.address);
                            expect(unclaimed).to.equal(expectedRelativeRewards(account));

                            const prevBalance = await rewardToken.balanceOf(account.address);
                            await withdraw(account, await pussyHODLFarm.getStake(account.address));
                            expect(await rewardToken.balanceOf(account.address)).to.equal(prevBalance);

                            const reward = await pussyHODLFarm.getPendingRewards(account.address);

                            expectAlmostEqual(reward, unclaimed);

                            const claimed = await pussyHODLFarm.connect(account).callStatic.claim();
                            expect(claimed).to.equal(reward);
                            const prevBalance2 = await rewardToken.balanceOf(account.address);
                            const tx = await pussyHODLFarm.connect(account).claim();
                            if (claimed.gt(BigNumber.from(0))) {
                                await expect(tx).to.emit(pussyHODLFarm, 'Claimed').withArgs(account.address, claimed);
                            }
                            expect(await rewardToken.balanceOf(account.address)).to.equal(prevBalance2.add(reward));

                            expect(await pussyHODLFarm.getPendingRewards(account.address)).to.equal(BigNumber.from(0));
                        });
                    });
                });
            }
        };

        const testFarm = (startTimeOffset, duration, rewardsRate) => {
            beforeEach(async () => {
                programStartTime = now.add(startTimeOffset);
                programEndTime = programStartTime.add(duration);

                pussyHODLFarm = await Contracts.TestPussyHODLFarm.deploy(
                    stakeToken.address,
                    rewardToken.address,
                    programStartTime,
                    programEndTime,
                    REWARD_RATE
                );

                await rewardToken.transfer(
                    pussyHODLFarm.address,
                    programEndTime.sub(programStartTime).mul(REWARD_RATE)
                );

                await setTime(now);
            });

            it('should revert when staking 0 tokens', async () => {
                await expect(stake(accounts[0], BigNumber.from(0))).to.be.revertedWith('INVALID_AMOUNT');
            });

            it('should revert when withdrawing 0 tokens', async () => {
                await setTime(programEndTime);

                await expect(withdraw(accounts[0], BigNumber.from(0))).to.be.revertedWith('INVALID_AMOUNT');
            });

            context('single staker', () => {
                beforeEach(async () => {
                    await stake(accounts[0], BigNumber.from(10_000_000));
                });

                tests([0]);

                context('multiple stakers', () => {
                    beforeEach(async () => {
                        await stake(accounts[1], BigNumber.from(888_888_888));
                    });

                    tests([0, 1]);
                });
            });
        };

        context('new farm', () => {
            testFarm(BigNumber.from(0), REWARDS_DURATION, REWARD_RATE);
        });

        context('existing farm', () => {
            testFarm(BigNumber.from(duration.weeks(1)), REWARDS_DURATION, REWARD_RATE);
        });
    });

    describe('withdraw tokens', () => {
        const testWithdrawTokens = (createToken, staked) => {
            const tokenAmount = BigNumber.from(5000);
            let token;

            beforeEach(async () => {
                pussyHODLFarm = await Contracts.TestPussyHODLFarm.deploy(
                    stakeToken.address,
                    rewardToken.address,
                    BigNumber.from(0),
                    now.add(BigNumber.from(1000)),
                    BigNumber.from(1000)
                );

                token = await createToken();

                await token.transfer(pussyHODLFarm.address, tokenAmount);
            });

            it('should revert when a non-owner attempts to withdraw rewards', async () => {
                await expect(
                    pussyHODLFarm.connect(nonOwner).withdrawTokens(token.address, BigNumber.from(1))
                ).to.be.revertedWith('Ownable: caller is not the owner');
            });

            it('should allow withdrawing tokens', async () => {
                if (token.address === stakeToken.address) {
                    const stakeAmount = BigNumber.from(10000);
                    await token.approve(pussyHODLFarm.address, stakeAmount);

                    await pussyHODLFarm.stake(stakeAmount);
                    expect(await pussyHODLFarm.getTotalStaked()).to.equal(stakeAmount);

                    await expect(
                        pussyHODLFarm.withdrawTokens(token.address, await token.balanceOf(pussyHODLFarm.address))
                    ).to.be.revertedWith('INVALID_AMOUNT');

                    const prevOwnerBalance = await token.balanceOf(owner.address);

                    await pussyHODLFarm.withdrawTokens(token.address, tokenAmount);

                    expect(await token.balanceOf(owner.address)).to.equal(prevOwnerBalance.add(tokenAmount));
                    expect(await token.balanceOf(pussyHODLFarm.address)).to.equal(stakeAmount);

                    await expect(pussyHODLFarm.withdrawTokens(token.address, BigNumber.from(1))).to.be.revertedWith(
                        'INVALID_AMOUNT'
                    );
                } else {
                    let prevOwnerBalance = await token.balanceOf(owner.address);
                    let prevFarmBalance = await token.balanceOf(pussyHODLFarm.address);

                    const amount = BigNumber.from(100);

                    await pussyHODLFarm.withdrawTokens(token.address, amount);

                    expect(await token.balanceOf(owner.address)).to.equal(prevOwnerBalance.add(amount));
                    expect(await token.balanceOf(pussyHODLFarm.address)).to.equal(prevFarmBalance.sub(amount));

                    prevOwnerBalance = await token.balanceOf(owner.address);
                    prevFarmBalance = await token.balanceOf(pussyHODLFarm.address);

                    await pussyHODLFarm.withdrawTokens(token.address, tokenAmount.sub(amount));

                    expect(await token.balanceOf(owner.address)).to.equal(
                        prevOwnerBalance.add(tokenAmount.sub(amount))
                    );
                    expect(await token.balanceOf(pussyHODLFarm.address)).to.equal(BigNumber.from(0));
                }
            });
        };

        context('other token', () => {
            testWithdrawTokens(async () => Contracts.TestERC20Token.deploy('Token', 'tTKN', TOTAL_SUPPLY));
        });

        context('rewards token', () => {
            testWithdrawTokens(async () => rewardToken);
        });

        context('stake token', () => {
            testWithdrawTokens(async () => stakeToken);
        });
    });
});

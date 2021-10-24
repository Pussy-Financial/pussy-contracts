const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const Decimal = require('decimal.js');

const { duration, latest } = require('./helpers/Time');
const Contracts = require('./helpers/Contracts');

const {
    constants: { AddressZero: ZERO_ADDRESS }
} = ethers;

describe('PussyFarm', () => {
    const TOTAL_SUPPLY = BigNumber.from(1_000_000_000_000).mul(BigNumber.from(10).pow(18));
    const RATE_FACTOR = BigNumber.from(10).pow(BigNumber.from(18));

    let accounts;
    let owner;
    let nonOwner;

    let stakeToken;
    let rewardToken;
    let pussyFarm;

    let now;
    let prevNow;

    const setTime = async (time) => {
        prevNow = now;
        now = time;

        await pussyFarm.setTime(now);
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
                Contracts.TestPussyFarm.deploy(
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
                Contracts.TestPussyFarm.deploy(
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
                Contracts.TestPussyFarm.deploy(
                    stakeToken.address,
                    rewardToken.address,
                    now.add(BigNumber.from(100)),
                    now.add(BigNumber.from(10)),
                    BigNumber.from(1)
                )
            ).to.be.revertedWith('INVALID_DURATION');

            await expect(
                Contracts.TestPussyFarm.deploy(
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
                Contracts.TestPussyFarm.deploy(
                    stakeToken.address,
                    rewardToken.address,
                    BigNumber.from(0),
                    now.add(BigNumber.from(100)),
                    BigNumber.from(0)
                )
            ).to.be.revertedWith('INVALID_VALUE');
        });

        it('should be properly initialized', async () => {
            const startTime = now;
            const endTime = now.add(BigNumber.from(100));
            const rewardRate = BigNumber.from(1000);

            const pussyFarm = await Contracts.TestPussyFarm.deploy(
                stakeToken.address,
                rewardToken.address,
                startTime,
                endTime,
                rewardRate
            );

            const program = await pussyFarm.getProgram();
            expect(program[0]).to.equal(startTime);
            expect(program[1]).to.equal(endTime);
            expect(program[2]).to.equal(rewardRate);
            expect(program[3]).to.equal(endTime.sub(startTime).mul(rewardRate));

            expect(await pussyFarm.getTotalStaked()).to.equal(BigNumber.from(0));
            expect(await pussyFarm.time()).to.equal(await latest());
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

            expect(await pussyFarm.getStake(account.address)).to.equal(stakeAmounts[account.address]);
            expect(await pussyFarm.getTotalStaked()).to.equal(totalStakedAmount);

            const prevAccountBalance = await stakeToken.balanceOf(account.address);
            const prevFarmBalance = await stakeToken.balanceOf(pussyFarm.address);
            const prevClaimed = await pussyFarm.getClaimed(account.address);

            await stakeToken.connect(account).approve(pussyFarm.address, amount);
            const res = await pussyFarm.connect(account).stake(amount);
            await expect(res).to.emit(pussyFarm, 'Staked').withArgs(account.address, amount);

            stakeAmounts[account.address] = stakeAmounts[account.address].add(amount);
            totalStakedAmount = totalStakedAmount.add(amount);

            expect(await stakeToken.balanceOf(account.address)).to.equal(prevAccountBalance.sub(amount));
            expect(await stakeToken.balanceOf(pussyFarm.address)).to.equal(prevFarmBalance.add(amount));
            expect(await pussyFarm.getClaimed(account.address)).to.equal(prevClaimed);
            expect(await pussyFarm.getStake(account.address)).to.equal(stakeAmounts[account.address]);
            expect(await pussyFarm.getTotalStaked()).to.equal(totalStakedAmount);
        };

        const withdraw = async (account, amount) => {
            expect(await pussyFarm.getStake(account.address)).to.equal(stakeAmounts[account.address]);
            expect(await pussyFarm.getTotalStaked()).to.equal(totalStakedAmount);

            const prevAccountBalance = await stakeToken.balanceOf(account.address);
            const prevFarmBalance = await stakeToken.balanceOf(pussyFarm.address);
            const prevClaimed = await pussyFarm.getClaimed(account.address);
            const claimable = await pussyFarm.connect(account).callStatic.claim();

            const res = await pussyFarm.connect(account).withdraw(amount);
            await expect(res).to.emit(pussyFarm, 'Withdrawn').withArgs(account.address, amount);

            if (claimable.gt(BigNumber.from(0))) {
                await expect(res).to.emit(pussyFarm, 'Claimed').withArgs(account.address, claimable);
            }

            stakeAmounts[account.address] = stakeAmounts[account.address].sub(amount);
            totalStakedAmount = totalStakedAmount.sub(amount);

            expect(await stakeToken.balanceOf(account.address)).to.equal(prevAccountBalance.add(amount));
            expect(await stakeToken.balanceOf(pussyFarm.address)).to.equal(prevFarmBalance.sub(amount));
            expect(await pussyFarm.getClaimed(account.address)).to.equal(prevClaimed.add(claimable));
            expect(await pussyFarm.getStake(account.address)).to.equal(stakeAmounts[account.address]);
            expect(await pussyFarm.getTotalStaked()).to.equal(totalStakedAmount);
            expect(await pussyFarm.getPendingRewards(account.address)).to.equal(BigNumber.from(0));
        };

        const claim = async (account) => {
            const reward = await pussyFarm.getPendingRewards(account.address);

            const effectiveTime = BigNumber.min(now, programEndTime);
            const expectedReward = expectedRewards(account, effectiveTime.sub(prevNow));

            expect(reward).to.equal(expectedReward);

            const claimable = await pussyFarm.connect(account).callStatic.claim();
            expect(claimable).to.equal(reward);

            const prevAccountBalance = await rewardToken.balanceOf(account.address);
            const prevFarmBalance = await rewardToken.balanceOf(pussyFarm.address);
            const prevClaimed = await pussyFarm.getClaimed(account.address);

            const res = await pussyFarm.connect(account).claim();
            if (claimable.gt(BigNumber.from(0))) {
                await expect(res).to.emit(pussyFarm, 'Claimed').withArgs(account.address, claimable);
            }

            expect(await pussyFarm.getPendingRewards(account.address)).to.equal(BigNumber.from(0));

            expect(await rewardToken.balanceOf(account.address)).to.equal(prevAccountBalance.add(reward));
            expect(await rewardToken.balanceOf(pussyFarm.address)).to.equal(prevFarmBalance.sub(reward));
            expect(await pussyFarm.getClaimed(account.address)).to.equal(prevClaimed.add(reward));
            expect(await pussyFarm.getStake(account.address)).to.equal(stakeAmounts[account.address]);
            expect(await pussyFarm.getTotalStaked()).to.equal(totalStakedAmount);
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

        const testRewards = async (account) => {
            const reward = await pussyFarm.getPendingRewards(account.address);

            const effectiveTime = BigNumber.min(now, programEndTime);
            const expectedReward = expectedRewards(account, effectiveTime.sub(programStartTime));

            expect(reward).to.equal(expectedReward);
        };

        const testPartialRewards = async (account, prevReward, duration = BigNumber.from(0)) => {
            const reward = await pussyFarm.getPendingRewards(account.address);

            let extraReward;
            if (duration.eq(BigNumber.from(0))) {
                const effectiveTime = BigNumber.min(now, programEndTime);
                extraReward = expectedRewards(account, effectiveTime.sub(prevNow));
            } else {
                extraReward = expectedRewards(account, duration);
            }

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

                            const reward = await pussyFarm.getPendingRewards(account.address);
                            await stake(account, BigNumber.from(1).mul(BigNumber.from(10).pow(BigNumber.from(18))));

                            expectAlmostEqual(await pussyFarm.getPendingRewards(account.address), reward);

                            await stake(account, BigNumber.from(11111).mul(BigNumber.from(10).pow(BigNumber.from(18))));
                            await stake(
                                account3,
                                BigNumber.from(1000000).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );

                            expectAlmostEqual(await pussyFarm.getPendingRewards(account.address), reward);

                            await stake(account, BigNumber.from(11111).mul(BigNumber.from(10).pow(BigNumber.from(18))));
                            await stake(account3, BigNumber.from(1).mul(BigNumber.from(10).pow(BigNumber.from(18))));
                            await stake(
                                account,
                                BigNumber.from(234324234234).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );

                            expectAlmostEqual(await pussyFarm.getPendingRewards(account.address), reward);
                        });

                        it('should properly calculate all rewards when staking', async () => {
                            await setTime(programStartTime);

                            const account3 = accounts[3];

                            let prevReward = await pussyFarm.getPendingRewards(account.address);

                            await stake(account, BigNumber.from(1000).mul(BigNumber.from(10).pow(BigNumber.from(18))));

                            await setTime(now.add(duration.days(1)));
                            await testPartialRewards(account, prevReward);

                            prevReward = await pussyFarm.getPendingRewards(account.address);

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

                            prevReward = await pussyFarm.getPendingRewards(account.address);

                            await stake(
                                account,
                                BigNumber.from(990930923).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );
                            await stake(
                                account3,
                                BigNumber.from(2666678).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );

                            await setTime(now.add(duration.weeks(2)));
                            await testPartialRewards(account, prevReward);
                        });

                        it('should properly calculate new stake rewards after the program has ended', async () => {
                            await setTime(programEndTime.add(duration.days(1)));

                            const account3 = accounts[3];
                            await stake(
                                account3,
                                BigNumber.from(1000000).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );

                            const reward = await pussyFarm.getPendingRewards(account3.address);
                            expect(reward).to.equal(BigNumber.from(0));

                            const claimed = await pussyFarm.connect(account3).callStatic.claim();
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

                        it('should properly calculate all rewards when withdrawing', async () => {
                            await setTime(programStartTime);

                            const account3 = accounts[3];

                            await stake(
                                account3,
                                BigNumber.from(1000000).mul(BigNumber.from(10).pow(BigNumber.from(18)))
                            );

                            const prevReward = await pussyFarm.getPendingRewards(account.address);

                            await setTime(now.add(duration.seconds(1)));
                            await testPartialRewards(account, prevReward);

                            await withdraw(account, BigNumber.from(500000));
                            await withdraw(account3, BigNumber.from(500000));

                            await setTime(now.add(duration.days(4)));
                            await testPartialRewards(account, BigNumber.from(0), duration.days(4));

                            await withdraw(account, BigNumber.from(100000));

                            await setTime(now.add(duration.days(1)));
                            await testPartialRewards(account, BigNumber.from(0), duration.days(1));

                            await withdraw(account, BigNumber.from(200000));
                            await withdraw(account3, BigNumber.from(300000));

                            await setTime(now.add(duration.weeks(3)));
                            await testPartialRewards(account, BigNumber.from(0), duration.weeks(3));
                        });
                    });
                });
            }
        };

        const testFarm = (startTimeOffset, duration, rewardsRate) => {
            beforeEach(async () => {
                programStartTime = now.add(startTimeOffset);
                programEndTime = programStartTime.add(duration);

                pussyFarm = await Contracts.TestPussyFarm.deploy(
                    stakeToken.address,
                    rewardToken.address,
                    programStartTime,
                    programEndTime,
                    REWARD_RATE
                );

                await rewardToken.transfer(pussyFarm.address, programEndTime.sub(programStartTime).mul(REWARD_RATE));

                await setTime(now);
            });

            it('should revert when staking 0 tokens', async () => {
                await expect(stake(accounts[0], BigNumber.from(0))).to.be.revertedWith('INVALID_AMOUNT');
            });

            it('should revert when withdrawing 0 tokens', async () => {
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
                pussyFarm = await Contracts.TestPussyFarm.deploy(
                    stakeToken.address,
                    rewardToken.address,
                    BigNumber.from(0),
                    now.add(BigNumber.from(1000)),
                    BigNumber.from(1000)
                );

                token = await createToken();

                await token.transfer(pussyFarm.address, tokenAmount);
            });

            it('should revert when a non-owner attempts to withdraw rewards', async () => {
                await expect(
                    pussyFarm.connect(nonOwner).withdrawTokens(token.address, BigNumber.from(1))
                ).to.be.revertedWith('Ownable: caller is not the owner');
            });

            it('should allow withdrawing tokens', async () => {
                if (token.address === stakeToken.address) {
                    const stakeAmount = BigNumber.from(10000);
                    await token.approve(pussyFarm.address, stakeAmount);

                    await pussyFarm.stake(stakeAmount);
                    expect(await pussyFarm.getTotalStaked()).to.equal(stakeAmount);

                    await expect(
                        pussyFarm.withdrawTokens(token.address, await token.balanceOf(pussyFarm.address))
                    ).to.be.revertedWith('INVALID_AMOUNT');

                    const prevOwnerBalance = await token.balanceOf(owner.address);

                    await pussyFarm.withdrawTokens(token.address, tokenAmount);

                    expect(await token.balanceOf(owner.address)).to.equal(prevOwnerBalance.add(tokenAmount));
                    expect(await token.balanceOf(pussyFarm.address)).to.equal(stakeAmount);

                    await expect(pussyFarm.withdrawTokens(token.address, BigNumber.from(1))).to.be.revertedWith(
                        'INVALID_AMOUNT'
                    );
                } else {
                    let prevOwnerBalance = await token.balanceOf(owner.address);
                    let prevFarmBalance = await token.balanceOf(pussyFarm.address);

                    const amount = BigNumber.from(100);

                    await pussyFarm.withdrawTokens(token.address, amount);

                    expect(await token.balanceOf(owner.address)).to.equal(prevOwnerBalance.add(amount));
                    expect(await token.balanceOf(pussyFarm.address)).to.equal(prevFarmBalance.sub(amount));

                    prevOwnerBalance = await token.balanceOf(owner.address);
                    prevFarmBalance = await token.balanceOf(pussyFarm.address);

                    await pussyFarm.withdrawTokens(token.address, tokenAmount.sub(amount));

                    expect(await token.balanceOf(owner.address)).to.equal(
                        prevOwnerBalance.add(tokenAmount.sub(amount))
                    );
                    expect(await token.balanceOf(pussyFarm.address)).to.equal(BigNumber.from(0));
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

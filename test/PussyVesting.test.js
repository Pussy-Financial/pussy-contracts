const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

const { duration, latest } = require('./helpers/Time');
const Contracts = require('./helpers/Contracts');

const {
    constants: { AddressZero: ZERO_ADDRESS }
} = ethers;

describe('PussyVesting', () => {
    const TOTAL_SUPPLY = BigNumber.from(1000000);

    let accounts;
    let owner;
    let nonOwner;

    let token;

    before(async () => {
        accounts = await ethers.getSigners();

        owner = accounts[0];
        nonOwner = accounts[1];
    });

    beforeEach(async () => {
        token = await Contracts.TestERC20Token.deploy('Token', 'TKN', TOTAL_SUPPLY);
    });

    describe('construction', () => {
        it('should revert when initialized with an invalid token address', async () => {
            await expect(Contracts.TestPussyVesting.deploy(ZERO_ADDRESS)).to.be.revertedWith('INVALID_ADDRESS');
        });

        it('should be properly initialized', async () => {
            const vesting = await Contracts.TestPussyVesting.deploy(token.address);

            expect(await vesting.getTotalVesting()).to.equal(BigNumber.from(0));
            expect(await vesting.time()).to.equal(await latest());
        });
    });

    describe('programs', () => {
        const getProgram = async (grantee) => {
            const data = await vesting.getProgram(grantee.address);

            return {
                amount: data[0],
                start: data[1],
                cliff: data[2],
                end: data[3],
                claimed: data[4]
            };
        };

        let vesting;

        let grantee;
        let grantee2;

        beforeEach(async () => {
            grantee = accounts[1];
            grantee2 = accounts[2];

            vesting = await Contracts.TestPussyVesting.deploy(token.address);
        });

        describe('create a program', () => {
            const now = BigNumber.from(10000000);

            it('should revert when a non-owner attempts to add a program', async () => {
                await expect(
                    vesting
                        .connect(nonOwner)
                        .addProgram(grantee.address, BigNumber.from(100), now, now, now.add(duration.years(1)))
                ).to.be.revertedWith('Ownable: caller is not the owner');
            });

            it('should revert when granting to the zero address', async () => {
                await expect(
                    vesting
                        .connect(owner)
                        .addProgram(ZERO_ADDRESS, BigNumber.from(100), now, now, now.add(duration.years(1)))
                ).to.be.revertedWith('INVALID_ADDRESS');
            });

            it('should revert when granting 0 tokens', async () => {
                await expect(
                    vesting
                        .connect(owner)
                        .addProgram(grantee.address, BigNumber.from(0), now, now, now.add(duration.years(1)))
                ).to.be.revertedWith('INVALID_AMOUNT');
            });

            it('should revert when granting with a cliff before the start', async () => {
                await expect(
                    vesting
                        .connect(owner)
                        .addProgram(
                            grantee.address,
                            BigNumber.from(100),
                            now,
                            now.sub(duration.days(1)),
                            now.add(duration.years(1))
                        )
                ).to.be.revertedWith('INVALID_TIME');
            });

            it('should revert when granting with a cliff after the vesting', async () => {
                await expect(
                    vesting
                        .connect(owner)
                        .addProgram(
                            grantee.address,
                            BigNumber.from(100),
                            now,
                            now.add(duration.years(1)),
                            now.add(duration.days(1))
                        )
                ).to.be.revertedWith('INVALID_TIME');
            });

            it('should revert when granting tokens more than once', async () => {
                const amount = BigNumber.from(100);

                await vesting
                    .connect(owner)
                    .addProgram(grantee.address, amount, now, now.add(duration.days(1)), now.add(duration.years(1)));

                await expect(
                    vesting
                        .connect(owner)
                        .addProgram(grantee.address, amount, now, now.add(duration.days(1)), now.add(duration.years(1)))
                ).to.be.revertedWith('ALREADY_EXISTS');
            });

            it('should allow creating new programs', async () => {
                const totalVesting = await vesting.getTotalVesting();
                expect(totalVesting).to.equal(BigNumber.from(0));

                const amount = BigNumber.from(12343);
                const start = now;
                const cliff = now.add(duration.weeks(14));
                const end = now.add(duration.years(5));

                const res = await vesting.connect(owner).addProgram(grantee.address, amount, start, cliff, end);
                await expect(res).to.emit(vesting, 'ProgramCreated').withArgs(grantee.address, amount);

                expect(await vesting.getTotalVesting()).to.equal(totalVesting.add(amount));

                const program1 = await getProgram(grantee);
                expect(program1.amount).to.equal(amount);
                expect(program1.start).to.equal(start);
                expect(program1.cliff).to.equal(cliff);
                expect(program1.end).to.equal(end);
                expect(program1.claimed).to.equal(BigNumber.from(0));

                const amount2 = BigNumber.from(999999);
                const start2 = now;
                const cliff2 = now;
                const end2 = now.add(duration.days(8));

                const res2 = await vesting.connect(owner).addProgram(grantee2.address, amount2, start2, cliff2, end2);
                await expect(res2).to.emit(vesting, 'ProgramCreated').withArgs(grantee2.address, amount2);

                expect(await vesting.getTotalVesting()).to.equal(totalVesting.add(amount).add(amount2));

                const program2 = await getProgram(grantee2);
                expect(program2.amount).to.equal(amount2);
                expect(program2.start).to.equal(start2);
                expect(program2.cliff).to.equal(cliff2);
                expect(program2.end).to.equal(end2);
                expect(program2.claimed).to.equal(BigNumber.from(0));
            });
        });

        describe('cancel a program', async () => {
            const now = BigNumber.from(10000000);

            beforeEach(async () => {
                const amount = BigNumber.from(12343);
                const start = now;
                const cliff = now.add(duration.weeks(14));
                const end = now.add(duration.years(5));

                await vesting.connect(owner).addProgram(grantee.address, amount, start, cliff, end);
            });

            it('should revert when a non-owner attempts to cancel a program', async () => {
                await expect(vesting.connect(nonOwner).cancelProgram(grantee.address)).to.be.revertedWith(
                    'Ownable: caller is not the owner'
                );
            });

            it('should revert when attempting to cancel a non-existing program', async () => {
                await expect(vesting.connect(owner).cancelProgram(grantee2.address)).to.be.revertedWith(
                    'INVALID_ADDRESS'
                );
            });

            it('should revert when attempting to cancel a program twice', async () => {
                await vesting.connect(owner).cancelProgram(grantee.address);
                await expect(vesting.connect(owner).cancelProgram(grantee.address)).to.be.revertedWith(
                    'INVALID_ADDRESS'
                );
            });

            it('should allow cancelling a program', async () => {
                const res = await vesting.connect(owner).cancelProgram(grantee.address);
                await expect(res).to.emit(vesting, 'ProgramCanceled').withArgs(grantee.address);

                const program = await getProgram(grantee);
                expect(program.amount).to.equal(BigNumber.from(0));
                expect(program.start).to.equal(BigNumber.from(0));
                expect(program.cliff).to.equal(BigNumber.from(0));
                expect(program.end).to.equal(BigNumber.from(0));
                expect(program.claimed).to.equal(BigNumber.from(0));
            });

            it('should allow restarting a program', async () => {
                await vesting.connect(owner).cancelProgram(grantee.address);

                const amount2 = BigNumber.from(999999);
                const start2 = now;
                const cliff2 = now;
                const end2 = now.add(duration.days(8));

                await vesting.connect(owner).addProgram(grantee.address, amount2, start2, cliff2, end2);

                const program2 = await getProgram(grantee);
                expect(program2.amount).to.equal(amount2);
                expect(program2.start).to.equal(start2);
                expect(program2.cliff).to.equal(cliff2);
                expect(program2.end).to.equal(end2);
                expect(program2.claimed).to.equal(BigNumber.from(0));
            });
        });

        describe('claiming a program', () => {
            it('should revert when claiming a non-existing program', async () => {
                await expect(vesting.connect(grantee).claim()).to.be.revertedWith('INVALID_ADDRESS');
            });

            it('should return no claimable tokens for a non-existing program', async () => {
                expect(await vesting.getClaimable(grantee.address)).to.equal(BigNumber.from(0));
            });

            [
                {
                    amount: BigNumber.from(1000),
                    startOffset: BigNumber.from(0),
                    cliffOffset: duration.days(30),
                    endOffset: duration.years(1),
                    steps: [
                        BigNumber.from(0),
                        duration.days(32).sub(duration.days(1)),
                        duration.days(5),
                        duration.hours(12),
                        duration.days(30).sub(duration.seconds(1)),
                        duration.days(200),
                        duration.years(300),
                        duration.days(1)
                    ]
                },
                {
                    amount: BigNumber.from(550000),
                    startOffset: BigNumber.from(0),
                    cliffOffset: duration.days(30),
                    endOffset: duration.years(1),
                    steps: [
                        BigNumber.from(0),
                        duration.days(30).sub(duration.days(1)),
                        duration.days(1).sub(duration.seconds(1)),
                        duration.seconds(1),
                        duration.days(30).sub(duration.seconds(1)),
                        duration.seconds(1),
                        duration.days(120),
                        duration.days(185),
                        duration.days(1)
                    ]
                },
                {
                    amount: BigNumber.from(1000),
                    startOffset: BigNumber.from(0),
                    cliffOffset: duration.days(30),
                    endOffset: duration.years(1),
                    steps: [
                        BigNumber.from(0),
                        duration.years(1).add(duration.days(1)),
                        duration.years(1).sub(duration.days(1))
                    ]
                },
                {
                    amount: BigNumber.from(1000),
                    startOffset: BigNumber.from(0),
                    cliffOffset: duration.days(30),
                    endOffset: duration.years(1),
                    steps: [
                        BigNumber.from(0),
                        duration.years(1).add(duration.days(1)),
                        duration.years(1).sub(duration.days(1))
                    ]
                },
                {
                    amount: TOTAL_SUPPLY,
                    startOffset: duration.days(30),
                    cliffOffset: duration.days(30),
                    endOffset: duration.years(10),
                    steps: [
                        duration.days(1),
                        duration.days(1),
                        duration.days(1),
                        duration.days(27),
                        duration.years(1),
                        duration.years(1),
                        duration.years(100),
                        duration.years(200)
                    ]
                },
                {
                    amount: BigNumber.from(1000000),
                    initialOffset: duration.days(15),
                    startOffset: BigNumber.from(0),
                    cliffOffset: duration.days(30),
                    endOffset: duration.years(1),
                    steps: [
                        BigNumber.from(0),
                        duration.days(15).sub(duration.days(1)),
                        duration.days(1).sub(duration.seconds(1)),
                        duration.seconds(1),
                        duration.days(30).sub(duration.seconds(1)),
                        duration.days(30),
                        duration.years(1)
                    ]
                }
            ].forEach((program, index) => {
                let now;

                const description = JSON.stringify(
                    program,
                    (key, value) => {
                        const { type, hex } = value;
                        if (type === 'BigNumber') {
                            return BigNumber.from(hex).toString();
                        }

                        return value;
                    },
                    '\t'
                );
                context(`program #${index + 1}: ${description}`, () => {
                    beforeEach(async () => {
                        const { amount, initialOffset, startOffset, cliffOffset, endOffset } = program;

                        now = await latest();

                        await token.connect(owner).transfer(vesting.address, amount);

                        const startTime = now.add(startOffset);
                        const cliffTime = now.add(cliffOffset);
                        const endTime = now.add(endOffset);

                        if (initialOffset) {
                            now = now.add(initialOffset);
                            await vesting.setTime(now);
                        }

                        await vesting.connect(owner).addProgram(grantee.address, amount, startTime, cliffTime, endTime);
                    });

                    it('should claim according to the schedule', async () => {
                        for (const step of program.steps) {
                            const totalVesting = await vesting.getTotalVesting();
                            const vestingBalance = await token.balanceOf(vesting.address);
                            const granteeBalance = await token.balanceOf(grantee.address);
                            const { amount, start, cliff, end, claimed } = await getProgram(grantee);

                            now = now.add(step);
                            await vesting.setTime(now);

                            let claimable;
                            if (now.lt(cliff)) {
                                claimable = BigNumber.from(0);
                            } else if (now.gte(end)) {
                                claimable = amount.sub(claimed);
                            } else {
                                claimable = amount.mul(now.sub(start)).div(end.sub(start)).sub(claimed);
                            }

                            expect(await vesting.getClaimable(grantee.address)).to.equal(claimable);
                            const res = await vesting.connect(grantee).claim();

                            if (claimable.gt(BigNumber.from(0))) {
                                await expect(res).to.emit(vesting, 'Claimed').withArgs(grantee.address, claimable);
                            }

                            const totalVesting2 = await vesting.getTotalVesting();
                            const vestingBalance2 = await token.balanceOf(vesting.address);
                            const granteeBalance2 = await token.balanceOf(grantee.address);
                            const { claimed: claimed2 } = await getProgram(grantee);

                            expect(totalVesting2).to.equal(totalVesting.sub(claimable));
                            expect(vestingBalance2).to.equal(vestingBalance.sub(claimable));
                            expect(granteeBalance2).to.equal(granteeBalance.add(claimable));
                            expect(claimed2).to.equal(claimed.add(claimable));
                        }
                    });
                });
            });
        });
    });

    describe('emergency withdraw', () => {
        let vesting;
        let token2;

        beforeEach(async () => {
            token2 = await Contracts.TestERC20Token.deploy('Token2', 'TKN2', TOTAL_SUPPLY);

            vesting = await Contracts.TestPussyVesting.deploy(token.address);

            await token.connect(owner).transfer(vesting.address, TOTAL_SUPPLY);
            await token2.connect(owner).transfer(vesting.address, TOTAL_SUPPLY);
        });

        it('should revert when a non-owner attempts to withdraw tokens', async () => {
            await expect(
                vesting.connect(nonOwner).withdraw(token.address, owner.address, BigNumber.from(100))
            ).to.be.revertedWith('Ownable: caller is not the owner');

            await expect(
                vesting.connect(nonOwner).withdraw(token2.address, owner.address, BigNumber.from(100))
            ).to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('should revert when attempting to withdraw to a 0 address', async () => {
            await expect(
                vesting.connect(owner).withdraw(token.address, ZERO_ADDRESS, BigNumber.from(100))
            ).to.be.revertedWith('INVALID_ADDRESS');
        });

        it('should allow the owner to withdraw tokens', async () => {
            const receiver = accounts[5];

            const token1Balance = await token.balanceOf(vesting.address);
            const amount = BigNumber.from(10000);
            await vesting.connect(owner).withdraw(token.address, receiver.address, amount);

            expect(await token.balanceOf(vesting.address)).to.equal(token1Balance.sub(amount));
            expect(await token.balanceOf(receiver.address)).to.equal(amount);

            const token2Balance = await token2.balanceOf(vesting.address);
            const amount2 = BigNumber.from(1);
            await vesting.connect(owner).withdraw(token2.address, receiver.address, amount2);

            expect(await token2.balanceOf(vesting.address)).to.equal(token2Balance.sub(amount2));
            expect(await token2.balanceOf(receiver.address)).to.equal(amount2);

            await vesting.connect(owner).withdraw(token.address, receiver.address, token1Balance.sub(amount));

            expect(await token.balanceOf(vesting.address)).to.equal(BigNumber.from(0));
            expect(await token.balanceOf(receiver.address)).to.equal(token1Balance);

            await vesting.connect(owner).withdraw(token2.address, receiver.address, token2Balance.sub(amount2));

            expect(await token2.balanceOf(vesting.address)).to.equal(BigNumber.from(0));
            expect(await token2.balanceOf(receiver.address)).to.equal(token2Balance);
        });
    });
});

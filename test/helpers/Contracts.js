const { ethers } = require('hardhat');

const deploy = async (contractName, ...args) =>
    (await ethers.getContractFactory(contractName, (await ethers.getSigners())[0])).deploy(...(args || []));

const attach = async (contractName, address) => ethers.getContractAt(contractName, address);

const deployOrAttach = (contractName) => {
    return {
        deploy: (...args) => {
            return deploy(contractName, ...args);
        },
        attach: (address) => {
            return attach(contractName, address);
        }
    };
};

const CONTRACTS = ['TestERC20Token', 'TestPussyFarm', 'TestPussyHODLFarm', 'TestPussyVesting'];

module.exports = Object.fromEntries(CONTRACTS.map((contract) => [contract, deployOrAttach(contract)]));

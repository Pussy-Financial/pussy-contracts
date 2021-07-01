const { ethers } = require('hardhat');

const deploy = async (contractName, ...args) => {
    let signer = (await ethers.getSigners())[0];

    if (typeof args[args.length - 1] === 'object' && args[args.length - 1].from) {
        signer = args[args.length - 1].from;
        if (typeof signer !== 'object' || signer.constructor.name !== 'SignerWithAddress') {
            throw new Error('Signer must be SignerWithAddress');
        }
        args.pop();
    }

    const contractFactory = await ethers.getContractFactory(contractName, signer);
    return args === undefined || args.length === 0 ? await contractFactory.deploy() : contractFactory.deploy(...args);
};

const attach = async (contractName, address) => {
    return await ethers.getContractAt(contractName, address);
};

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

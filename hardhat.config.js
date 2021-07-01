require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
require('@typechain/hardhat');

require('solidity-coverage');

const { BigNumber } = require('ethers');

module.exports = {
    networks: {
        hardhat: {
            gasPrice: 25000000000,
            gas: 10000000,
            accounts: {
                count: 10,
                accountsBalance: '1000000000000000000000000000'
            }
        }
    },

    solidity: {
        version: '0.7.6',
        settings: {
            optimizer: {
                enabled: true,
                runs: 2000
            }
        }
    },

    mocha: {
        bail: true,
        exit: true,
        recursive: true,
        useColors: true
    }
};

BigNumber.min = (a, b) => (BigNumber.from(a).gt(b) ? b : a);
BigNumber.max = (a, b) => (BigNumber.from(a).gt(b) ? a : b);

// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "./PussyFarm.sol";

contract PussyHODLFarm is PussyFarm {
    mapping(address => uint256) private _stakeTimes;

    /**
     * @dev Constructor that initializes the contract.
     */
    constructor(
        IERC20 stakeToken,
        IERC20 rewardToken,
        uint256 startTime,
        uint256 endTime,
        uint256 rewardRate
    ) PussyFarm(stakeToken, rewardToken, startTime, endTime, rewardRate) {}

    /**
     * @dev Unstakes the specified token amount from the contract.
     */
    function withdraw(uint256 amount) public override {
        require(_time() >= _endTime, "STAKE_LOCKED");

        super.withdraw(amount);
    }
}

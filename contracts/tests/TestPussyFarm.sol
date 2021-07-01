// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../PussyFarm.sol";

contract TestPussyFarm is PussyFarm {
    uint256 private _currentTime;

    constructor(
        IERC20 stakeToken,
        IERC20 rewardToken,
        uint256 startTime,
        uint256 endTime,
        uint256 rewardRate
    ) PussyFarm(stakeToken, rewardToken, startTime, endTime, rewardRate) {}

    function _time() internal view virtual override returns (uint256) {
        return _currentTime != 0 ? _currentTime : super._time();
    }

    function setTime(uint256 newCurrentTime) external {
        _currentTime = newCurrentTime;
    }

    function time() external view returns (uint256) {
        return _time();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../PussyVesting.sol";

contract TestPussyVesting is PussyVesting {
    uint256 private _currentTime;

    constructor(IERC20 token) PussyVesting(token) {}

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

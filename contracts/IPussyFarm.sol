// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPussyFarm {
    event Staked(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event Claimed(address indexed account, uint256 reward);

    function getProgram()
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        );

    function getStakeToken() external view returns (IERC20);

    function getRewardToken() external view returns (IERC20);

    function getStake(address account) external view returns (uint256);

    function getClaimed(address account) external view returns (uint256);

    function getTotalStaked() external view returns (uint256);

    function stake(uint256 amount) external;

    function withdraw(uint256 amount) external;

    function getPendingRewards(address account) external view returns (uint256);

    function claim() external returns (uint256);
}

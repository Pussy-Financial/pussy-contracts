// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./IPussyFarm.sol";

contract PussyFarm is IPussyFarm, Ownable {
    using Math for uint256;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 private constant RATE_FACTOR = 1e18;

    IERC20 internal immutable _stakeToken;
    IERC20 internal immutable _rewardToken;
    uint256 internal immutable _startTime;
    uint256 internal immutable _endTime;
    uint256 private immutable _rewardRate;

    mapping(address => uint256) internal _stakes;
    uint256 internal _totalStaked;

    uint256 private _lastUpdateTime;
    uint256 private _rewardPerTokenStored;
    mapping(address => uint256) private _stakerRewardPerTokenPaid;
    mapping(address => uint256) private _rewards;
    mapping(address => uint256) private _claimed;

    /**
     * @dev Constructor that initializes the contract.
     */
    constructor(
        IERC20 stakeToken,
        IERC20 rewardToken,
        uint256 startTime,
        uint256 endTime,
        uint256 rewardRate
    ) {
        require(address(stakeToken) != address(0) && address(rewardToken) != address(0), "INVALID_ADDRESS");
        require(startTime < endTime && endTime > _time(), "INVALID_DURATION");
        require(rewardRate > 0, "INVALID_VALUE");

        _stakeToken = stakeToken;
        _rewardToken = rewardToken;
        _startTime = startTime;
        _endTime = endTime;
        _rewardRate = rewardRate;
    }

    /**
     * @dev Updates msg.sender's pending rewards and rate.
     */
    modifier updateReward() {
        _rewardPerTokenStored = _rewardPerToken();
        _lastUpdateTime = Math.min(_time(), _endTime);

        _rewards[msg.sender] = _pendingRewards(msg.sender);
        _stakerRewardPerTokenPaid[msg.sender] = _rewardPerTokenStored;

        _;
    }

    /**
     * @dev Returns the parameters for this vesting contract.
     */
    function getProgram()
        external
        view
        override
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (_startTime, _endTime, _rewardRate, _endTime.sub(_startTime).mul(_rewardRate));
    }

    /**
     * @dev Returns the current stake of a given account.
     */
    function getStake(address account) external view override returns (uint256) {
        return (_stakes[account]);
    }

    /**
     * @dev Returns the total claimed rewards amount for a given account.
     */
    function getClaimed(address account) external view override returns (uint256) {
        return (_claimed[account]);
    }

    /**
     * @dev Returns the total staked tokens in the contract.
     */
    function getTotalStaked() external view override returns (uint256) {
        return _totalStaked;
    }

    /**
     * @dev Stakes the specified token amount into the contract.
     */
    function stake(uint256 amount) public virtual override updateReward {
        require(amount > 0, "INVALID_AMOUNT");

        _stakes[msg.sender] = _stakes[msg.sender].add(amount);
        _totalStaked = _totalStaked.add(amount);

        _stakeToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount);
    }

    /**
     * @dev Unstakes the specified token amount from the contract.
     */
    function withdraw(uint256 amount) public virtual override updateReward {
        require(amount > 0, "INVALID_AMOUNT");

        _stakes[msg.sender] = _stakes[msg.sender].sub(amount);
        _totalStaked = _totalStaked.sub(amount);

        _stakeToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @dev Returns the pending rewards for a given account.
     */
    function getPendingRewards(address account) external view override returns (uint256) {
        return _pendingRewards(account);
    }

    /**
     * @dev Claims pending rewards and sends them to the owner.
     */
    function claim() external virtual override updateReward returns (uint256) {
        uint256 reward = _pendingRewards(msg.sender);
        if (reward == 0) {
            return reward;
        }

        _rewards[msg.sender] = 0;
        _claimed[msg.sender] = _claimed[msg.sender].add(reward);

        _rewardToken.safeTransfer(msg.sender, reward);

        emit Claimed(msg.sender, reward);

        return reward;
    }

    /**
     * @dev Admin-only emergency transfer of contract owned funds. Please note that community funds are excluded.
     */
    function withdrawTokens(IERC20 token, uint256 amount) external onlyOwner {
        require(
            address(token) != address(_stakeToken) || amount <= token.balanceOf(address(this)).sub(_totalStaked),
            "INVALID_AMOUNT"
        );

        token.safeTransfer(msg.sender, amount);
    }

    /**
     * @dev Calculates current reward per-token amount.
     */
    function _rewardPerToken() private view returns (uint256) {
        if (_totalStaked == 0) {
            return _rewardPerTokenStored;
        }

        uint256 currentTime = _time();
        if (currentTime < _startTime) {
            return 0;
        }

        uint256 stakingEndTime = Math.min(currentTime, _endTime);
        uint256 stakingStartTime = Math.max(_startTime, _lastUpdateTime);
        if (stakingStartTime == stakingEndTime) {
            return _rewardPerTokenStored;
        }

        return
            _rewardPerTokenStored.add(
                stakingEndTime.sub(stakingStartTime).mul(_rewardRate).mul(RATE_FACTOR).div(_totalStaked)
            );
    }

    /**
     * @dev Calculates account's pending rewards.
     */
    function _pendingRewards(address account) private view returns (uint256) {
        return
            _stakes[account].mul(_rewardPerToken().sub(_stakerRewardPerTokenPaid[account])).div(RATE_FACTOR).add(
                _rewards[account]
            );
    }

    /**
     * @dev Returns the current time (and used for testing).
     */
    function _time() internal view virtual returns (uint256) {
        return block.timestamp;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PussyVesting is Ownable {
    using SafeERC20 for IERC20;

    struct Program {
        uint256 amount;
        uint256 start;
        uint256 cliff;
        uint256 end;
        uint256 claimed;
    }

    IERC20 private immutable _token;
    mapping(address => Program) private _programs;
    uint256 private _totalVesting;

    event ProgramCreated(address indexed owner, uint256 amount);
    event ProgramCanceled(address indexed owner);
    event Claimed(address indexed owner, uint256 amount);

    /**
     * @dev Constructor that initializes the contract.
     */
    constructor(IERC20 token) {
        require(address(token) != address(0), "INVALID_ADDRESS");

        _token = token;
    }

    /**
     * @dev Returns a program for a given owner.
     */
    function getProgram(address owner)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        Program memory p = _programs[owner];

        return (p.amount, p.start, p.cliff, p.end, p.claimed);
    }

    /**
     * @dev Returns the total remaining vesting tokens in the contract.
     */
    function getTotalVesting() external view returns (uint256) {
        return _totalVesting;
    }

    /**
     * @dev Creates a new vesting program for a given owner.
     */
    function addProgram(
        address owner,
        uint256 amount,
        uint256 start,
        uint256 cliff,
        uint256 end
    ) external onlyOwner {
        require(owner != address(0), "INVALID_ADDRESS");
        require(amount > 0, "INVALID_AMOUNT");
        require(start <= cliff && cliff <= end, "INVALID_TIME");

        require(_programs[owner].amount == 0, "ALREADY_EXISTS");

        _programs[owner] = Program({ amount: amount, start: start, cliff: cliff, end: end, claimed: 0 });

        _totalVesting += amount;

        emit ProgramCreated(owner, amount);
    }

    /**
     * @dev Cancels an existing vesting program (including unclaimed vested tokens).
     */
    function cancelProgram(address owner) external onlyOwner {
        Program memory p = _programs[owner];

        require(p.amount > 0, "INVALID_ADDRESS");

        _totalVesting -= p.amount - p.claimed;

        delete _programs[owner];

        emit ProgramCanceled(owner);
    }

    /**
     * @dev Returns the current claimable vested amount.
     */
    function getClaimable(address owner) external view returns (uint256) {
        return _claimable(_programs[owner]);
    }

    /**
     * @dev Claims vested tokens and sends them to the owner.
     */
    function claim() external {
        Program storage p = _programs[msg.sender];
        require(p.amount > 0, "INVALID_ADDRESS");

        uint256 unclaimed = _claimable(p);
        if (unclaimed == 0) {
            return;
        }

        p.claimed += unclaimed;

        _totalVesting -= unclaimed;

        _token.safeTransfer(msg.sender, unclaimed);

        emit Claimed(msg.sender, unclaimed);
    }

    /**
     * @dev Admin-only emergency transfer of contract's funds.
     */
    function withdraw(
        IERC20 token,
        address target,
        uint256 amount
    ) external onlyOwner {
        require(target != address(0), "INVALID_ADDRESS");

        token.safeTransfer(target, amount);
    }

    /**
     * @dev Returns the current claimable amount.
     */
    function _claimable(Program memory p) private view returns (uint256) {
        if (p.amount == 0) {
            return 0;
        }

        uint256 vested = _vested(p);
        if (vested == 0) {
            return 0;
        }

        return vested - p.claimed;
    }

    /**
     * @dev Returns the current claimable amount for a owner at the specific time.
     */
    function _vested(Program memory p) private view returns (uint256) {
        uint256 time = _time();

        if (time < p.cliff) {
            return 0;
        }

        if (time >= p.end) {
            return p.amount;
        }

        // Interpolate vesting: claimable = amount * ((time - start) / (end - start)).
        return (p.amount * (time - p.start)) / (p.end - p.start);
    }

    /**
     * @dev Returns the current time (and used for testing).
     */
    function _time() internal view virtual returns (uint256) {
        return block.timestamp;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PussyNFT is ERC721Enumerable, ReentrancyGuard, Ownable {
    using Strings for uint256;
    using SafeERC20 for IERC20;

    IERC20 private immutable _token;
    address private immutable _dao;
    uint256 private immutable _maxSupply;
    uint256 private immutable _mintPrice;
    uint256 private immutable _mintStartTime;
    string private _tempUri;
    string private _uri;
    bool private _mintFinished;

    event Finalized(string uri);

    constructor(
        IERC20 token,
        address dao,
        uint256 maxSupply,
        uint256 mintPrice,
        uint256 mintStartTime,
        string memory tempUri
    ) ERC721("Pussy Financial Punks", "PFP") {
        require(address(token) != address(0) && dao != address(0), "INVALID_ADDRESS");
        require(maxSupply > 0, "INVALID_MAX_SUPPLY");
        require(mintPrice > 0, "INVALID_PRICE");

        _token = token;
        _dao = dao;
        _maxSupply = maxSupply;
        _mintPrice = mintPrice;
        _mintStartTime = mintStartTime;
        _tempUri = tempUri;
    }

    /**
     * @dev Returns minting settings
     */
    function settings()
        external
        view
        returns (
            IERC20,
            address,
            uint256,
            uint256,
            uint256,
            string memory,
            bool
        )
    {
        return (_token, _dao, _maxSupply, _mintPrice, _mintStartTime, _tempUri, _mintFinished);
    }

    /**
     * @dev Returns the URI of the specified token.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "TOKEN_DOES_NOT_EXIST");

        if (!_mintFinished) {
            return _tempUri;
        }

        string memory baseUri = _uri;
        return bytes(baseUri).length > 0 ? string.concat(baseUri, tokenId.toString(), ".json") : "";
    }

    /**
     * @dev Mints a single PFP.
     */
    function mint(uint256 quantity) external nonReentrant {
        require(_time() >= _mintStartTime, "MINT_NOT_STARTED");
        require(quantity > 0, "INVALID_QUANTITY");

        uint256 totalSupply = totalSupply();
        uint256 availableQuantity = Math.min(_maxSupply - totalSupply, quantity);

        require(availableQuantity > 0, "MAX_SUPPLY_REACHED");

        // Transfer the tokens to the DAO
        _token.safeTransferFrom(msg.sender, _dao, _mintPrice * availableQuantity);

        // Mint tokens to the purchaser (starting from token ID 1)
        uint256 tokenId = totalSupply;
        for (uint256 i = 0; i < availableQuantity; i++) {
            _safeMint(msg.sender, tokenId + i + 1);
        }
    }

    /**
     * @dev Finalizes the minting process.
     */
    function finalizeMint(string memory uri) external nonReentrant onlyOwner {
        require(!_mintFinished, "ALREADY_FINISHED");
        require(totalSupply() == _maxSupply, "MAX_SUPPLY_NOT_REACHED");

        bytes memory rawUri = bytes(uri);
        require(rawUri[rawUri.length - 1] == "/", "INVALID_TERMINATOR");

        _mintFinished = true;
        _uri = uri;

        emit Finalized(uri);
    }

    /**
     * @dev Returns the current time (and used for testing).
     */
    function _time() internal view virtual returns (uint256) {
        return block.timestamp;
    }
}

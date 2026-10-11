// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Test-only 6-decimal USDC stand-in. Never deploy to production.
/// @dev Arc's real USDC ERC-20 interface uses 6 decimals; this mirrors that so
///      tests exercise the same scale the BountyBoard uses onchain.
contract MockUSDC is ERC20 {
  constructor() ERC20("Mock USDC", "mUSDC") {}

  function decimals() public pure override returns (uint8) {
    return 6;
  }

  /// @notice Unrestricted mint for tests and local networks.
  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}

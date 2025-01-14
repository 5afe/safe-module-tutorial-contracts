// SPDX-License-Identifier: LGPL-3.0
pragma solidity ^0.8.0;
import "@safe-global/safe-contracts/contracts/common/Enum.sol";
import "@safe-global/safe-contracts/contracts/Safe.sol";

/**
 * @title TokenWithdrawModule
 * @dev Contract implementing the a module that transfers tokens from a Safe contract to the user having a valid signature.
 */
contract TokenWithdrawModule {
    bytes32 public immutable PERMIT_TYPEHASH =
        keccak256(
            "TokenWithdrawModule(uint256 amount,address _beneficiary,uint256 nonce,uint256 deadline)"
        );
    address public immutable safeAddress;
    address public immutable tokenAddress;
    mapping(address => uint256) public nonces;

    /**
     * @dev Constructor function for the contract
     *
     * @param _tokenAddress address of the ERC20 token contract
     * @param _safeAddress address of the Safe contract
     */
    constructor(address _tokenAddress, address _safeAddress) {
        tokenAddress = _tokenAddress;
        safeAddress = _safeAddress;
    }

    /**
     * @dev Generates the EIP-712 domain separator for the contract.
     *
     * @return The EIP-712 domain separator.
     */
    function getDomainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("TokenWithdrawModule")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    /**
     * @dev Transfers a specified amount of tokens to a beneficiary.
     *
     * @param _amount amount of tokens to be transferred
     * @param _beneficiary address of the beneficiary
     * @param _deadline deadline for the validity of the signature
     * @param _signatures signatures of the Safe owner(s)
     */
    function tokenTransfer(
        uint _amount,
        address _beneficiary,
        uint256 _deadline,
        bytes memory _signatures
    ) public {
        require(_deadline >= block.timestamp, "expired deadline");

        bytes32 signatureData = keccak256(
            abi.encode(
                PERMIT_TYPEHASH,
                _amount,
                msg.sender,
                nonces[msg.sender]++,
                _deadline
            )
        );
        
        bytes32 hash = keccak256(
            abi.encodePacked("\x19\x01", getDomainSeparator(), signatureData)
        );

        Safe(payable(safeAddress)).checkSignatures(
            hash,
            abi.encodePacked(signatureData),
            _signatures
        );

        bytes memory data = abi.encodeWithSignature(
            "transfer(address,uint256)",
            _beneficiary,
            _amount
        );

        require(
            Safe(payable(safeAddress)).execTransactionFromModule(
                tokenAddress,
                0,
                data,
                Enum.Operation.Call
            ),
            "Could not execute token transfer"
        );
    }
}
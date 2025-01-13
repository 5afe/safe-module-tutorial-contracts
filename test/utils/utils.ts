import { ethers } from "hardhat";
import { Signer, AddressLike, BigNumberish, ZeroAddress } from "ethers";
import { Safe } from "../../typechain-types";

const { keccak256, toUtf8Bytes } = ethers;

// Define the type hash for the permit function
const PERMIT_TYPEHASH = keccak256(
  toUtf8Bytes(
    "TokenWithdrawModule(uint256 amount, address _beneficiary, uint256 nonce, uint256 deadline)"
  )
);

/**
 * Generates the EIP-712 digest for a token transfer.
 * @param name - The name of the contract.
 * @param address - The address of the contract.
 * @param chainId - The chain ID of the network.
 * @param amount - The amount of tokens to transfer.
 * @param user - The address of the beneficiary.
 * @param nonce - The nonce for the transaction.
 * @param deadline - The deadline for the transaction.
 * @returns The EIP-712 digest.
 */
function getDigest(
  name: string,
  address: string,
  chainId: bigint,
  amount: BigInt,
  user: string,
  nonce: BigInt,
  deadline: BigInt
): string {
  // Get the domain separator for the contract
  const DOMAIN_SEPARATOR = getDomainSeparator(name, address, chainId);
  const defaultAbiCoder = ethers.AbiCoder.defaultAbiCoder();

  // Generate the EIP-712 digest
  return keccak256(
    ethers.solidityPacked(
      ["bytes1", "bytes1", "bytes32", "bytes32"],
      [
        "0x19",
        "0x01",
        DOMAIN_SEPARATOR,
        keccak256(
          defaultAbiCoder.encode(
            ["bytes32", "uint256", "address", "uint256", "uint256"],
            [PERMIT_TYPEHASH, amount, user, nonce, deadline]
          )
        ),
      ]
    )
  );
}

/**
 * Gets the EIP-712 domain separator.
 * @param name - The name of the contract.
 * @param contractAddress - The address of the contract.
 * @param chainId - The chain ID of the network.
 * @returns The EIP-712 domain separator.
 */
function getDomainSeparator(
  name: string,
  contractAddress: string,
  chainId: bigint
): string {
  const defaultAbiCoder = ethers.AbiCoder.defaultAbiCoder();
  return keccak256(
    defaultAbiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [
        keccak256(
          toUtf8Bytes(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
          )
        ),
        keccak256(toUtf8Bytes(name)),
        keccak256(toUtf8Bytes("1")),
        chainId,
        contractAddress,
      ]
    )
  );
}

/**
 * Executes a transaction on the Safe contract.
 * @param wallets - The signers of the transaction.
 * @param safe - The Safe contract instance.
 * @param to - The address to send the transaction to.
 * @param value - The value to send with the transaction.
 * @param data - The data to send with the transaction.
 * @param operation - The operation type (0 for call, 1 for delegate call).
 */
const execTransaction = async function (
  wallets: Signer[],
  safe: Safe,
  to: AddressLike,
  value: BigNumberish,
  data: string,
  operation: number,
): Promise<void> {
  // Get the current nonce of the Safe contract
  const nonce = await safe.nonce();

  // Get the transaction hash for the Safe transaction
  const transactionHash = await safe.getTransactionHash(
    to,
    value,
    data,
    operation,
    0,
    0,
    0,
    ZeroAddress,
    ZeroAddress,
    nonce
  );

  let signatureBytes = "0x";
  const bytesDataHash = ethers.getBytes(transactionHash);

  // Get the addresses of the signers
  const addresses = await Promise.all(wallets.map(wallet => wallet.getAddress()));
  // Sort the signers by their addresses
  const sorted = wallets.sort((a, b) => {
    const addressA = addresses[wallets.indexOf(a)];
    const addressB = addresses[wallets.indexOf(b)];
    return addressA.localeCompare(addressB, "en", { sensitivity: "base" });
  });

  // Sign the transaction hash with each signer
  for (let i = 0; i < sorted.length; i++) {
    const flatSig = (await sorted[i].signMessage(bytesDataHash))
      .replace(/1b$/, "1f")
      .replace(/1c$/, "20");
    signatureBytes += flatSig.slice(2);
  }

  // Execute the transaction on the Safe contract
  await safe.execTransaction(
    to,
    value,
    data,
    operation,
    0,
    0,
    0,
    ZeroAddress,
    ZeroAddress,
    signatureBytes
  );
};

export {
  PERMIT_TYPEHASH,
  execTransaction,
  getDigest,
  getDomainSeparator,
};
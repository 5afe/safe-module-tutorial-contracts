import { ethers } from "hardhat";
import { Signer, Contract, AddressLike, BigNumberish } from "ethers";
import { Safe } from "../../typechain-types";

const { keccak256, toUtf8Bytes } = ethers;

const PERMIT_TYPEHASH = keccak256(
  toUtf8Bytes(
    "TokenTransfer(uint256 amount, address _beneficiary, uint256 nonce, uint256 deadline)"
  )
);

function getDigest(
  name: string,
  address: string,
  chainId: bigint,
  amount: BigInt,
  user: string,
  nonce: BigInt,
  deadline: BigInt
): string {
  const DOMAIN_SEPARATOR = getDomainSeparator(name, address, chainId);
  const defaultAbiCoder = ethers.AbiCoder.defaultAbiCoder();

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

// Gets the EIP712 domain separator
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

const execTransaction = async function (
  wallets: Signer[],
  safe: Safe,
  to: AddressLike,
  value: BigNumberish,
  data: string,
  operation: number,
  message: string
): Promise<void> {
  const ADDRESS_0 = "0x0000000000000000000000000000000000000000";
  const nonce = await safe.nonce();

  const transactionHash = await safe.getTransactionHash(
    to,
    value,
    data,
    operation,
    0,
    0,
    0,
    ADDRESS_0,
    ADDRESS_0,
    nonce
  );
  let signatureBytes = "0x";
  const bytesDataHash = ethers.getBytes(transactionHash);

  const addresses = await Promise.all(wallets.map(wallet => wallet.getAddress()));
  const sorted = wallets.sort((a, b) => {
    const addressA = addresses[wallets.indexOf(a)];
    const addressB = addresses[wallets.indexOf(b)];
    return addressA.localeCompare(addressB, "en", { sensitivity: "base" });
  });

  for (let i = 0; i < sorted.length; i++) {
    const flatSig = (await sorted[i].signMessage(bytesDataHash))
      .replace(/1b$/, "1f")
      .replace(/1c$/, "20");
    signatureBytes += flatSig.slice(2);
  }

  await safe.execTransaction(
    to,
    value,
    data,
    operation,
    0,
    0,
    0,
    ADDRESS_0,
    ADDRESS_0,
    signatureBytes
  );
};

export {
  PERMIT_TYPEHASH,
  execTransaction,
  getDigest,
  getDomainSeparator,
};
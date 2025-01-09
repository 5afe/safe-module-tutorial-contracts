import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer, ZeroAddress } from "ethers";
import { Safe__factory, TestToken, TokenWithdrawModule } from "../typechain-types";
import { SafeTransaction } from "@safe-global/safe-contracts";
import { execTransaction, getDigest } from "./utils/utils";

describe("Example module tests", async function () {
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let charlie: Signer;
  let masterCopy: any;
  let proxyFactory: any;
  let token: TestToken;
  let safeFactory: Safe__factory;
  let chainId: bigint;
  const ADDRESS_0 = "0x0000000000000000000000000000000000000000";

  before(async () => {
    [deployer, alice, bob, charlie] = await ethers.getSigners();

    chainId = (await ethers.provider.getNetwork()).chainId;
    safeFactory = await ethers.getContractFactory("Safe", deployer);
    masterCopy = await safeFactory.deploy();

    proxyFactory = await (
      await ethers.getContractFactory("SafeProxyFactory", deployer)
    ).deploy();
  });

  beforeEach(async () => {
    token = await (
      await ethers.getContractFactory("TestToken", deployer)
    ).deploy("test", "T");
  });

  const setupContracts = async (
    walletOwners: Signer[],
    threshold: number
  ): Promise<{ exampleModule: TokenWithdrawModule }> => {
    const ownerAddresses = await Promise.all(
      walletOwners.map(async (walletOwner) => await walletOwner.getAddress())
    );

    const gnosisSafeData = masterCopy.interface.encodeFunctionData("setup", [
      ownerAddresses,
      threshold,
      ADDRESS_0,
      "0x",
      ADDRESS_0,
      ADDRESS_0,
      0,
      ADDRESS_0,
    ]);


    const safeAddress = await proxyFactory.createProxyWithNonce.staticCall(
      await masterCopy.getAddress(),
      gnosisSafeData,
      0n
    );

    await proxyFactory.createProxyWithNonce(
      await masterCopy.getAddress(),
      gnosisSafeData,
      0n
    );

    if (safeAddress === ZeroAddress) {
      throw new Error("Safe address not found");
    }

    const exampleModule = await (
      await ethers.getContractFactory("TokenWithdrawModule", deployer)
    ).deploy(token.target, safeAddress);

    await token
      .connect(deployer)
      .mint(safeAddress, BigInt(10) ** BigInt(18) * BigInt(100000));

    const safe = await ethers.getContractAt("Safe", safeAddress);

    const enableModuleData = masterCopy.interface.encodeFunctionData(
      "enableModule",
      [exampleModule.target]
    );


    const safeTxEx: SafeTransaction = {
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: ZeroAddress,
      refundReceiver: ZeroAddress,
      nonce: "0",
      to: await safe.getAddress(),
      value: 0,
      data: enableModuleData,
      operation: 0
    };

    await execTransaction(
      walletOwners.slice(0, threshold),
      safe,
      safe.target,
      0,
      enableModuleData,
      0,
      "enable module"
    );
    
    expect(await safe.isModuleEnabled.staticCall(exampleModule.target)).to.be
      .true;

    return { exampleModule };
  };

  it("Should successfully transfer tokens to bob", async function () {
    const wallets = [alice];
    const { exampleModule } = await setupContracts(wallets, 1);

    const amount = BigInt(10) ** BigInt(18) * BigInt(10);

    let signatureBytes = "0x";
    const deadline = 100000000000000n;
    const nonce = await exampleModule.nonces(await bob.getAddress());

    const digest = getDigest(
      "TokenWithdrawModule",
      await exampleModule.getAddress(),
      chainId,
      amount,
      await bob.getAddress(),
      nonce,
      deadline
    );

    const bytesDataHash = ethers.getBytes(digest);

    for (let i = 0; i < wallets.length; i++) {
      const flatSig = (await wallets[i].signMessage(bytesDataHash))
        .replace(/1b$/, "1f")
        .replace(/1c$/, "20");
      signatureBytes += flatSig.slice(2);
    }

    await expect(
      exampleModule
        .connect(charlie)
        .tokenTransfer(amount, await charlie.getAddress(), deadline, signatureBytes)
    ).to.be.revertedWith("GS026");

    await exampleModule
      .connect(bob)
      .tokenTransfer(amount, await bob.getAddress(), deadline, signatureBytes);

    const balanceBob = await token.balanceOf.staticCall(await bob.getAddress());
    expect(balanceBob).to.be.equal(amount);
  });

});
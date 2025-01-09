import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer, ZeroAddress } from "ethers";
import { Safe__factory, TestToken, TokenWithdrawModule } from "../typechain-types";
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

  // Setup signers and deploy contracts before running tests
  before(async () => {
    [deployer, alice, bob, charlie] = await ethers.getSigners();

    chainId = (await ethers.provider.getNetwork()).chainId;
    safeFactory = await ethers.getContractFactory("Safe", deployer);
    masterCopy = await safeFactory.deploy();

    proxyFactory = await (
      await ethers.getContractFactory("SafeProxyFactory", deployer)
    ).deploy();
  });

  // Deploy a new token contract before each test
  beforeEach(async () => {
    token = await (
      await ethers.getContractFactory("TestToken", deployer)
    ).deploy("test", "T");
  });

  // Helper function to setup contracts
  const setupContracts = async (
    walletOwners: Signer[],
    threshold: number
  ): Promise<{ exampleModule: TokenWithdrawModule }> => {
    const ownerAddresses = await Promise.all(
      walletOwners.map(async (walletOwner) => await walletOwner.getAddress())
    );

    const safeData = masterCopy.interface.encodeFunctionData("setup", [
      ownerAddresses,
      threshold,
      ZeroAddress,
      "0x",
      ZeroAddress,
      ZeroAddress,
      0,
      ZeroAddress,
    ]);

    // Read the safe address by executing the static call to createProxyWithNonce function
    const safeAddress = await proxyFactory.createProxyWithNonce.staticCall(
      await masterCopy.getAddress(),
      safeData,
      0n
    );

    // Create the proxy with nonce
    await proxyFactory.createProxyWithNonce(
      await masterCopy.getAddress(),
      safeData,
      0n
    );

    if (safeAddress === ZeroAddress) {
      throw new Error("Safe address not found");
    }

    // Deploy the TokenWithdrawModule contract
    const exampleModule = await (
      await ethers.getContractFactory("TokenWithdrawModule", deployer)
    ).deploy(token.target, safeAddress);

    // Mint tokens to the safe address
    await token
      .connect(deployer)
      .mint(safeAddress, BigInt(10) ** BigInt(18) * BigInt(100000));

    const safe = await ethers.getContractAt("Safe", safeAddress);

    // Enable the module in the safe
    const enableModuleData = masterCopy.interface.encodeFunctionData(
      "enableModule",
      [exampleModule.target]
    );

    // Execute the transaction to enable the module
    await execTransaction(
      walletOwners.slice(0, threshold),
      safe,
      safe.target,
      0,
      enableModuleData,
      0,
      "enable module"
    );

    // Verify that the module is enabled
    expect(await safe.isModuleEnabled.staticCall(exampleModule.target)).to.be
      .true;

    return { exampleModule };
  };

  // Test case to verify token transfer to bob
  it("Should successfully transfer tokens to bob", async function () {
    const wallets = [alice];
    const { exampleModule } = await setupContracts(wallets, 1);

    const amount = BigInt(10) ** BigInt(18) * BigInt(10);

    let signatureBytes = "0x";
    const deadline = 100000000000000n;
    const nonce = await exampleModule.nonces(await bob.getAddress());

    // Generate the digest for the transaction
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

    // Sign the digest with each wallet owner
    for (let i = 0; i < wallets.length; i++) {
      const flatSig = (await wallets[i].signMessage(bytesDataHash))
        .replace(/1b$/, "1f")
        .replace(/1c$/, "20");
      signatureBytes += flatSig.slice(2);
    }

    // Attempt to transfer tokens with an invalid signer (should fail)
    await expect(
      exampleModule
        .connect(charlie)
        .tokenTransfer(amount, await charlie.getAddress(), deadline, signatureBytes)
    ).to.be.revertedWith("GS026");

    // Transfer tokens with a valid signer
    await exampleModule
      .connect(bob)
      .tokenTransfer(amount, await bob.getAddress(), deadline, signatureBytes);

    // Verify the token balance of bob
    const balanceBob = await token.balanceOf.staticCall(await bob.getAddress());
    expect(balanceBob).to.be.equal(amount);
  });

});
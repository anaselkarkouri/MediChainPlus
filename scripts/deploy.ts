import { network } from "hardhat";

const connection = await network.create();
const { ethers } = connection;

async function deployContract(contractName: string, args: unknown[] = []) {
  console.log(`\nDeploying ${contractName}...`);

  const factory = await ethers.getContractFactory(contractName);
  const instance = await factory.deploy(...args);

  await instance.waitForDeployment();

  const address = await instance.getAddress();
  console.log(`${contractName} deployed at: ${address}`);

  return instance;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("MediChain+ contract deployment");
  console.log(`Network: ${connection.networkName}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  const reimbursement = await deployContract("ReimbursementContract");
  const traceability = await deployContract("DrugTraceabilityContract");

  console.log("\nDeployment summary");
  console.log(`REIMBURSEMENT_CONTRACT_ADDRESS=${await reimbursement.getAddress()}`);
  console.log(`DRUG_TRACEABILITY_CONTRACT_ADDRESS=${await traceability.getAddress()}`);
}

main().catch((error) => {
  console.error("Deployment failed:");
  console.error(error);
  process.exit(1);
});

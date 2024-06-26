#!/usr/bin/env node

require('dotenv').config()
const { JsonRpcProvider } = require('@ethersproject/providers')
const { Wallet } = require('@ethersproject/wallet')
const { ContractFactory } = require('@ethersproject/contracts')
const { abi, bytecode } = require('@uniswap/v2-core/build/UniswapV2Factory.json')

async function deployV2CoreFactory() {
  // Load environment variables
  const privateKey = process.env.PRIVATE_KEY
  const rpcUrl = process.env.RPC_URL

  if (!privateKey || !rpcUrl) {
    console.error('Please set PRIVATE_KEY and RPC_URL in your .env file')
    process.exit(1)
  }

  // Create a provider and wallet
  const provider = new JsonRpcProvider(rpcUrl)
  const wallet = new Wallet(privateKey, provider)

  // Deployer address
  const deployerAddress = await wallet.getAddress()

  // Contract Factory
  const UniswapV2Factory = new ContractFactory(abi, bytecode, wallet)

  // Deploy contract with deployer address as _feeToSetter
  const factoryContract = await UniswapV2Factory.deploy(deployerAddress)
  await factoryContract.deployed()

  console.log(`UniswapV2Factory deployed at address: ${factoryContract.address}`)

  // Set feeTo to the same deployer address
  const setFeeToTx = await factoryContract.setFeeTo(deployerAddress)
  await setFeeToTx.wait()

  console.log(`FeeTo set to: ${deployerAddress}`)
}

deployV2CoreFactory().catch((error) => {
  console.error(error)
  process.exit(1)
})

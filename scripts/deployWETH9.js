#!/usr/bin/env node

require('dotenv').config()
const { JsonRpcProvider } = require('@ethersproject/providers')
const { Wallet } = require('@ethersproject/wallet')
const { ContractFactory } = require('@ethersproject/contracts')
const fs = require('fs')
const path = require('path')

const WETH9_ABI = [
  'constructor()',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event Deposit(address indexed dst, uint256 wad)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Withdrawal(address indexed src, uint256 wad)',
  'function allowance(address, address) view returns (uint256)',
  'function approve(address guy, uint256 wad) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function deposit() payable',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function transfer(address dst, uint256 wad) returns (bool)',
  'function transferFrom(address src, address dst, uint256 wad) returns (bool)',
  'function withdraw(uint256 wad)',
]

async function deployWETH9() {
  // Load environment variables
  const privateKey = process.env.PRIVATE_KEY
  const rpcUrl = process.env.RPC_URL

  // Create a provider and wallet
  const provider = new JsonRpcProvider(rpcUrl)
  const wallet = new Wallet(privateKey, provider)

  // Load WETH9 bytecode from file
  const bytecodePath = path.join(__dirname, 'WETH9_bytecode.txt')
  const WETH9_BYTECODE = fs.readFileSync(bytecodePath, 'utf8')

  // Create a contract factory
  const WETH9Factory = new ContractFactory(WETH9_ABI, WETH9_BYTECODE, wallet)

  // Deploy the contract
  console.log('Deploying WETH9 contract...')
  const weth9 = await WETH9Factory.deploy()

  await weth9.deployed()
  console.log(`WETH9 deployed to: ${weth9.address}`)
}

deployWETH9().catch((error) => {
  console.error('Error deploying WETH9 contract:', error)
  process.exit(1)
})

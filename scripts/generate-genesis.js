#!/usr/bin/env node

const fs = require('fs')
const { program } = require('commander')
const { JsonRpcProvider } = require('@ethersproject/providers')
const { isAddress } = require('@ethersproject/address')
const { HashZero } = require('@ethersproject/constants')
const { hexZeroPad, hexlify, concat, arrayify } = require('@ethersproject/bytes')
const { defaultAbiCoder } = require('@ethersproject/abi')
const { Contract } = require('@ethersproject/contracts')
const { keccak256 } = require('@ethersproject/keccak256')
const { toUtf8Bytes } = require('@ethersproject/strings')

const STORAGE_SLOT_LIMIT = 50 // Set your desired storage slot limit here

program
  .requiredOption('-t, --template <path>', 'Path to the template genesis file')
  .requiredOption('-j, --node <uri>', 'JSON RPC HTTP uri of target node')
  .option('-o, --output <path>', 'Path to write the new patched genesis file', 'genesis.json')
  .option('-c, --chainid <id>', 'Chain ID to set in the genesis file')
  .option('-a, --alloc <path>', 'Path to a JSON file containing allocations')
  .option('-u3, --uni3 <path>', 'Path to a JSON file containing uniswap V3 deployed addresses')
  .parse(process.argv)

const options = program.opts()

const provider = new JsonRpcProvider(options.node)

main().catch((error) => {
  console.error(`Unexpected error: ${error.message}`)
  process.exit(1)
})

async function main() {
  const genesisTemplate = readJsonFile(options.template)

  if (options.chainid) {
    genesisTemplate.config.chainId = parseInt(options.chainid)
  }

  if (options.alloc) {
    const customAllocations = readJsonFile(options.alloc)
    genesisTemplate.alloc = { ...genesisTemplate.alloc, ...customAllocations }
  }

  if (options.uni3) {
    const uniswapContracts = readJsonFile(options.uni3)
    const uniswapAllocation = await prepareUniswapAllocations(uniswapContracts)
    genesisTemplate.alloc = { ...genesisTemplate.alloc, ...uniswapAllocation }
  }

  writeGenesisFile(options.output, genesisTemplate)
}

function readJsonFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf-8')
    const json = JSON.parse(data)
    return json
  } catch (error) {
    throw new Error(`Error reading or parsing file: ${filePath}, ${error.message}`)
  }
}

function writeGenesisFile(filePath, output) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(output, null, 2))
    console.log(`Genesis file updated and saved to ${filePath}`)
  } catch (error) {
    console.error(`Error writing output file: ${error.message}`)
    process.exit(1)
  }
}

async function prepareUniswapAllocations(contracts) {
  // fetch balances, runtime bytecode and scan storage slots
  const contractsState = await cloneUniswapContractsState(contracts)
  // inject mainnet addresses (storage, inlined immutable variables in bytecode)
  return transformWithMainnetAddresses(contracts, contractsState)
}

async function cloneUniswapContractsState(contracts) {
  const state = {}

  for (const [name, address] of Object.entries(contracts)) {
    if (!isAddress(address)) {
      throw new Error(`Invalid Ethereum address: ${address}`)
    }
    const [code, balanceWei, storage] = await Promise.all([
      fetchContractCode(address),
      provider.getBalance(address),
      scanContractStorage(name, address)
    ])
    // const code = await fetchContractCode(address)
    // const balanceWei = await provider.getBalance(address)
    // const storage = await scanContractStorage(name, address)

    const balance = balanceWei === 0n ? `0x0` : `${balanceWei}`
    const contractState = {
      balance,
      code: code,
      storage: storage,
    }

    state[address] = contractState
  }

  return state
}

// Fetch the runtime/deployed bytecode
async function fetchContractCode(address) {
  const code = await provider.getCode(address)
  if (code === '0x') {
    throw new Error(`No contract deployed at address ${address}`)
  }
  return code
}

async function scanContractStorage(name, address) {
  const storage = {}
  const promises = []

  // Scan the first STORAGE_SLOT_LIMIT storage slots
  for (let slot = 0; slot < STORAGE_SLOT_LIMIT; slot++) {
    const slotHex = toBeHex64(slot)
    const promise = provider.getStorageAt(address, slotHex).then((value) => {
      console.log(`address ${address} slot ${slot} value ${value}`)
      if (value !== HashZero) {
        storage[slotHex] = value
      }
    })
    promises.push(promise)
  }
  await Promise.all(promises)

  // For some contracts, scan additional storage slots
  const expectedSlotValues = customSlotsToScan(name)
  for (const [slot, expectedValue] of Object.entries(expectedSlotValues)) {
    const value = await fetchStorageSlot(address, slot, expectedValue)
    storage[slot] = value
  }

  return storage
}

async function fetchStorageSlot(address, slot, expectedValue) {
  const value = await provider.getStorageAt(address, slot)
  // verifying that we got the slot calculation right
  if (value !== expectedValue) {
    throw new Error(`Unexpected value at address ${address} slot ${slot}: ${value} (expected: ${expectedValue})`)
  }
  return value
}

// Some contracts populate mapping types as part of init/deployment
// storage slots are calculated using the keys
function customSlotsToScan(name) {
  if (name === 'v3CoreFactoryAddress') {
    const LOWEST_FEE_LEVEL = toBeHex64(100)
    const LOW_FEE_LEVEL = toBeHex64(500)
    const MEDIUM_FEE_LEVEL = toBeHex64(3000)
    const HIGH_FEE_LEVEL = toBeHex64(10000)
    const MAPPING_VARIABLE_SLOT = 4

    // value types such as 'uint256' in Solidity are left-padded
    return {
      [calculateLeftPaddedKeyMappingSlot(LOWEST_FEE_LEVEL, MAPPING_VARIABLE_SLOT)]: toBeHex64(1),
      [calculateLeftPaddedKeyMappingSlot(LOW_FEE_LEVEL, MAPPING_VARIABLE_SLOT)]: toBeHex64(10),
      [calculateLeftPaddedKeyMappingSlot(MEDIUM_FEE_LEVEL, MAPPING_VARIABLE_SLOT)]: toBeHex64(60),
      [calculateLeftPaddedKeyMappingSlot(HIGH_FEE_LEVEL, MAPPING_VARIABLE_SLOT)]: toBeHex64(200),
    }
  } else if (name === 'nonfungibleTokenPositionManagerAddress') {
    const INTERFACE_ID_ERC165 = '0x01ffc9a7'
    const INTERFACE_ID_ERC721 = '0x80ac58cd'
    const INTERFACE_ID_ERC721_METADATA = '0x5b5e139f'
    const INTERFACE_ID_ERC721_ENUMERABLE = '0x780e9d63'
    const MAPPING_VARIABLE_SLOT = 0
    const SUPPORTED_FLAG = toBeHex64(1) // 'true'

    // bytes types such as 'bytes4' in Solidity are right-padded
    return {
      [calculateRightPaddedKeyMappingSlot(INTERFACE_ID_ERC165, MAPPING_VARIABLE_SLOT)]: SUPPORTED_FLAG,
      [calculateRightPaddedKeyMappingSlot(INTERFACE_ID_ERC721, MAPPING_VARIABLE_SLOT)]: SUPPORTED_FLAG,
      [calculateRightPaddedKeyMappingSlot(INTERFACE_ID_ERC721_METADATA, MAPPING_VARIABLE_SLOT)]: SUPPORTED_FLAG,
      [calculateRightPaddedKeyMappingSlot(INTERFACE_ID_ERC721_ENUMERABLE, MAPPING_VARIABLE_SLOT)]: SUPPORTED_FLAG,
    }
  }
  return {}
}

function calculateLeftPaddedKeyMappingSlot(key, slot) {
  return calculateMappingSlot(key, slot, true) // pad left for value type key
}

function calculateRightPaddedKeyMappingSlot(key, slot) {
  return calculateMappingSlot(key, slot, false) // pad right for bytes type key
}

function calculateMappingSlot(key, slot, padLeft) {
  // Convert the key and the storage slot to 32-byte hex strings
  let paddedHexKey;
  if (padLeft) {
    // For left-padding (used for uint256, address, etc.)
    paddedHexKey = hexZeroPad(hexlify(key), 32);
  } else {
    // For right-padding (used for bytes)
    const keyBytes = arrayify(key);
    const paddedBytes = concat([
      keyBytes,
      arrayify(hexZeroPad('0x', 32 - keyBytes.length))
    ]);
    paddedHexKey = hexlify(paddedBytes);
  }
  const paddedHexSlot = toBeHex64(slot)
  // Calculate the keccak256 hash of the concatenated key + storage slot
  return keccak256(concat([paddedHexKey, paddedHexSlot]))
}

function toBeHex64(value) {
  return hexZeroPad(hexlify(value), 32);
}

// https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
const UNISWAP_V3_MAINNET_ADDRESSES = {
  WETH9: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  v2CoreFactoryAddress: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  v3CoreFactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  multicall2Address: '0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696',
  proxyAdminAddress: '0xB753548F6E010e7e680BA186F9Ca1BdAB2E90cf2',
  tickLensAddress: '0xbfd8137f7d1516D3ea5cA83523914859ec47F573',
  nftDescriptorLibraryAddressV1_3_0: '0x42B24A95702b9986e82d421cC3568932790A48Ec',
  nonfungibleTokenPositionDescriptorAddressV1_3_0: '0x91ae842A5Ffd8d12023116943e72A606179294f3',
  descriptorProxyAddress: '0xEe6A57eC80ea46401049E92587E52f5Ec1c24785',
  nonfungibleTokenPositionManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  v3MigratorAddress: '0xA5644E29708357803b5A882D272c41cC0dF92B34',
  v3StakerAddress: '0xe34139463bA50bD61336E0c446Bd8C0867c6fE65',
  quoterV2Address: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  quoterAddress: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
  swapRouter02: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  unsupportedProtocolAddress: '0x76D631990d505E4e5b432EEDB852A60897824D68',
  permit2Address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  universalRouterAddress: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
}

async function transformWithMainnetAddresses(contracts, contractsState) {
  // replacements for deployment addresses based on mainnet deployment
  let replaceMap = toAddressesReplaceMap(contracts, UNISWAP_V3_MAINNET_ADDRESSES)
  // replacement for Permit2's EIP712 immutable '_CACHED_DOMAIN_SEPARATOR' variable (calculation relies on chainid + deployment address)
  // see: https://github.com/Uniswap/permit2/blob/0x000000000022D473030F116dDEE9F6B43aC78BA3/src/EIP712.sol
  replaceMap = [
    ...replaceMap,
    {
      search: await fetchPermit2DomainSeparator(contracts.permit2Address),
      replace: buildReplacementPermit2DomainSeparator(UNISWAP_V3_MAINNET_ADDRESSES.permit2Address),
    },
  ]
  return applyReplacements(contractsState, replaceMap)
}

function toAddressesReplaceMap(contracts) {
  return Object.keys(contracts).flatMap((key) => {
    const search = contracts[key] // current deployment address
    const replace = UNISWAP_V3_MAINNET_ADDRESSES[key] // mainnet address
    return [
      { search, replace }, // mixed-case
      { search: strip0xPrefix(search).toLowerCase(), replace: strip0xPrefix(replace).toLowerCase() }, // low-case
    ]
  })
}

const PUSH32_OPCODE = '7f'

async function fetchPermit2DomainSeparator(address) {
  // Contract ABI - we only need the DOMAIN_SEPARATOR function
  const ABI = [
    {
      inputs: [],
      name: 'DOMAIN_SEPARATOR',
      outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
      stateMutability: 'view',
      type: 'function',
    },
  ]
  const contract = new Contract(address, ABI, provider)
  const domainSeparator = await contract.DOMAIN_SEPARATOR()
  // PUSH32 opcode followed by actual value is how this immutable varaible is inlined in bytecode
  return `${PUSH32_OPCODE}${strip0xPrefix(domainSeparator)}`
}

function buildReplacementPermit2DomainSeparator(address) {
  const CHAIN_ID = 59000 // TODO: where from?
  const TYPE_HASH = keccak256(
    toUtf8Bytes('EIP712Domain(string name,uint256 chainId,address verifyingContract)')
  )
  const HASHED_NAME = keccak256(toUtf8Bytes('Permit2'))
  const domainSeparator = keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'uint256', 'address'],
      [TYPE_HASH, HASHED_NAME, CHAIN_ID, address]
    )
  )
  // PUSH32 opcode followed by actual value is how this immutable varaible is inlined in bytecode
  return `${PUSH32_OPCODE}${strip0xPrefix(domainSeparator)}`
}

function strip0xPrefix(hexString) {
  if (hexString.startsWith('0x')) {
    return hexString.slice(2)
  }
  return hexString
}

function applyReplacements(target, replaceMap) {
  function applyReplacements(str) {
    return replaceMap.reduce((acc, { search, replace }) => acc.split(search).join(replace), str)
  }

  function processObject(obj) {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        applyReplacements(key),
        typeof value === 'object' && value !== null
          ? processObject(value)
          : typeof value === 'string'
          ? applyReplacements(value)
          : value,
      ])
    )
  }

  return processObject(target)
}

import UnsupportedProtocol from '@uniswap/universal-router/artifacts/contracts/deploy/UnsupportedProtocol.sol/UnsupportedProtocol.json'
import createDeployContractStep from './meta/createDeployContractStep'

export const DEPLOY_UNSUPPORTED_PROTOCOL = createDeployContractStep({
    key: 'unsupportedProtocolAddress',
    artifact: UnsupportedProtocol,
  })
  
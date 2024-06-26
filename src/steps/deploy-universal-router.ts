import UniversalRouter from '@uniswap/universal-router/artifacts/contracts/UniversalRouter.sol/UniversalRouter.json'
import createDeployContractStep from './meta/createDeployContractStep'
import { HashZero } from '@ethersproject/constants'

export const DEPLOY_UNIVERSAL_ROUTER = createDeployContractStep({
    key: 'universalRouterAddress',
    artifact: UniversalRouter,
    // @ts-expect-error
    computeArguments(state, config) {
      if (state.permit2Address === undefined) {
        throw new Error('Missing Permit2')
      }
      if (state.unsupportedProtocolAddress === undefined) {
        throw new Error('Missing Unsupported Protocol')
      }
      if (state.v3CoreFactoryAddress === undefined) {
        throw new Error('Missing V3 Core Factory')
      }
  
      return [{
        permit2: state.permit2Address,
        weth9: config.weth9Address,
        seaportV1_5: state.unsupportedProtocolAddress,
        seaportV1_4: state.unsupportedProtocolAddress,
        openseaConduit: state.unsupportedProtocolAddress,
        nftxZap: state.unsupportedProtocolAddress,
        x2y2: state.unsupportedProtocolAddress,
        foundation: state.unsupportedProtocolAddress,
        sudoswap: state.unsupportedProtocolAddress,
        elementMarket: state.unsupportedProtocolAddress,
        nft20Zap: state.unsupportedProtocolAddress,
        cryptopunks: state.unsupportedProtocolAddress,
        looksRareV2: state.unsupportedProtocolAddress,
        routerRewardsDistributor: state.unsupportedProtocolAddress,
        looksRareRewardsDistributor: state.unsupportedProtocolAddress,
        looksRareToken: state.unsupportedProtocolAddress,
        v2Factory: config.v2CoreFactoryAddress ?? state.unsupportedProtocolAddress,
        v3Factory: state.v3CoreFactoryAddress,
        pairInitCodeHash: config.v2CoreFactoryAddress ? '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f' : HashZero,
        poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54'
      }
      ]
    },
  })
  
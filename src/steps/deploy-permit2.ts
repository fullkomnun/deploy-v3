import Permit2 from 'permit2/out/Permit2.sol/Permit2.json'
import createDeployContractStep from './meta/createDeployContractStep'

export const DEPLOY_PERMIT2 = createDeployContractStep({
    key: 'permit2Address',
    artifact: {
      contractName: 'Permit2',
      abi : Permit2.abi,
      bytecode : Permit2.bytecode.object,
      linkReferences: undefined
    },
  })
  
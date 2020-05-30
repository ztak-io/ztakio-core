const bitcoin = require('bitcoinjs-lib')
const bitcoinMessage = require('bitcoinjs-message')

const networks = {
  mainnet: {
    messagePrefix: '\x18Ztak Signed Message:\n',
    bech32: 'zt',
    bip32: {
      public: 0x0488b21e,
      private: 0x0488ade4,
    },
    pubKeyHash: 81,
    scriptHash: 83,
    wif: 0x95,
  }
}

function plainSortedEntries(data) {
  return Object.entries(data)
    .sort((a,b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => key + ':' + value)
    .join('\n')
}

function buildEnvelope(fromKp, data, network) {
  if (!network) network = networks.mainnet

  const { address } = bitcoin.payments.p2pkh({ pubkey: fromKp.publicKey, network })
  const nonce = Date.now()
  const signatureOb = {
    from: address, nonce,
    ...data
  }
  const msg = plainSortedEntries(signatureOb)

  let envelope = {
    from: address,
    sig: bitcoinMessage.sign(msg, fromKp.privateKey, fromKp.compressed).toString('base64'),
    nonce, data
  }

  return envelope
}

function openEnvelope(vn) {
  const { from, sig, nonce, data } = vn

  const signatureOb = { from, nonce, ...data }
  const msg = plainSortedEntries(signatureOb)

  if (bitcoinMessage.verify(msg, from, sig)) {
    return signatureOb
  } else {
    throw new Error('invalid signature')
  }
}

function addressVerifier(network) {
  return (addr) => {
    const {version, hash} = bitcoin.address.fromBase58Check(addr)

    if (version === network.pubKeyHash) {
      return hash
    } else {
      throw new Error(`invalid address version (${version}) expected (${network.pubKeyHash})`)
    }
  }
}

module.exports = {
  networks, buildEnvelope, openEnvelope,
  utils: (network) => {
    return {
      addressVerifier: addressVerifier(network)
    }
  }
}

const bitcoin = require('bitcoinjs-lib')
const bitcoinMessage = require('bitcoinjs-message')
const bs58check = require('bs58check')

let networks = {
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

function uint8buf(v) {
  let b = Buffer.alloc(1)
  b.writeUInt8(v)
  return b
}

function uint32lebuf(v) {
  let b = Buffer.alloc(4)
  b.writeUInt32LE(v)
  return b
}

function uint64lebuf(v) {
  let b = Buffer.alloc(8)
  b.writeBigUint64LE(v)
  return b
}

function varlenBuf(b) {
  let l
  if (b.length < 254) {
    l = Buffer.alloc(1)
    l.writeUInt8(b.length)
  } else {
    l = Buffer.alloc(3)
    l.writeUInt8(255)
    l.writeUInt16LE(b.length, 1)
  }

  return Buffer.concat([l, b])
}

function buildEnvelope(fromKp, data, network) {
  if (!network) network = networks.mainnet

  const { address } = bitcoin.payments.p2pkh({ pubkey: fromKp.publicKey, network })
  const nonce = Date.now() & 0x7FFFFFFF
  const signatureBuf = Buffer.concat([
    varlenBuf(bs58check.decode(address)),
    uint32lebuf(nonce),
    varlenBuf(data)
  ])
  const msg = signatureBuf.toString('hex')
  const sig = bitcoinMessage.sign(msg, fromKp.privateKey, fromKp.compressed)

  let envelope = Buffer.concat([
    uint8buf((fromKp.compressed?128:0) | 1),
    varlenBuf(sig),
    signatureBuf,
  ])

  return envelope
}

function Cursor(b) {
  let p = 0
  return {
    readUInt8: () => {
      return b.readUInt8(p++)
    },

    readUInt32LE: () => {
      let r = b.readUInt32LE(p)
      p += 4
      return r
    },

    readVarlenBuf: () => {
      let l = b.readUInt8(p++)
      if (l === 255) {
        l = b.readUInt16LE(p)
        p += 2
      }

      let ret = b.slice(p, p + l)
      p += l
      return ret
    },

    remainingSlice: () => {
      return b.slice(p)
    }
  }
}

function openEnvelope(vn) {
  const reader = Cursor(vn)

  const envelopeType = reader.readUInt8()
  const compressed = (envelopeType & 0x80) !== 0
  const version = envelopeType & 0x7F

  if (version === 1) {
    const sig = reader.readVarlenBuf()

    const sigBuf = reader.remainingSlice()

    const address = bs58check.encode(reader.readVarlenBuf())
    const nonce = reader.readUInt32LE()
    const data = reader.readVarlenBuf()

    if (bitcoinMessage.verify(sigBuf.toString('hex'), address, sig)) {
      return {from: address, data, nonce}
    } else {
      throw new Error('invalid signature')
    }
  } else {
    throw new Error(`envelope version ${version} not implemented`)
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

function utils(network) {
  return {
    addressVerifier: addressVerifier(network)
  }
}

if ((typeof(process) !== 'undefined') && process.mainModule.path) {
  let fs = require('fs')
  try {
    let path = require('path')
    let fname = process.mainModule.path + path.sep + 'ztak_overrides.json'

    fs.accessSync(fname, fs.constants.R_OK)
    let overrides = JSON.parse(fs.readFileSync(fname, 'utf8'))

    if ('networks' in overrides) {
      networks = overrides.networks
    }

  } catch (e) {
    // ignore
  }
}

module.exports = {
  utils, networks, buildEnvelope, openEnvelope,
  asm: require('./asm')
}

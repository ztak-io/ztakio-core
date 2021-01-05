const bitcoin = require('bitcoinjs-lib')
const bitcoinMessage = require('bitcoinjs-message')
const bs58check = require('bs58check')
const asm = require('./asm')

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

function buildEnvelope(fromKp, data, network, compress) {
  if (!network) network = networks.mainnet

  const { address } = bitcoin.payments.p2pkh({ pubkey: fromKp.publicKey, network })
  const nonce = Date.now() & 0x7FFFFFFF
  const signatureBuf = Buffer.concat([
    varlenBuf(bs58check.decode(address)),
    uint32lebuf(nonce),
    varlenBuf(data)
  ])

  let cmpFlag = 0
  if (compress) {
    cmpFlag = 64
    throw new Error('Compression not yet supported')
  }

  const msg = bitcoin.crypto.sha256(signatureBuf).toString('hex')
  const sig = bitcoinMessage.sign(msg, fromKp.privateKey, fromKp.compressed)

  let envelope = Buffer.concat([
    uint8buf((fromKp.compressed?128:0) | 1 | cmpFlag),
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
    const txid = bitcoin.crypto.sha256(sigBuf).toString('hex')

    if (bitcoinMessage.verify(txid, address, sig)) {
      return {from: address, data, nonce, txid: txid}
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

function decode(envelope) {
  let msg = openEnvelope(Buffer.from(envelope, 'hex'))
  let lines = asm.unpack(msg.data).filter(x => x.opName !== 'NOOP' && x.opName !== 'END' && x.opName !== 'REQUIRE')

  let calls = []
  let params = []
  let entrypoints = []
  for (let i=0; i < lines.length; i++) {
    let item = lines[i]
    if (item.opName.startsWith('PUSH')) {
      params.push(item.params[0])
    } else if (item.opName === 'ECALL') {
      calls.push({ [item.params[0]]: params })
      params = []
    } else if (item.opName === 'ENTRY') {
      entrypoints.push(item.params[0])
    }
  }

  let ob = {from: msg.from}
  if (calls.length > 0) {
    ob.calls = calls
  }

  if (entrypoints.length > 0) {
    ob.entrypoints = entrypoints
  }

  return ob
}

if ((typeof(process) !== 'undefined') && process.mainModule && process.mainModule.path) {
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
  utils, networks, buildEnvelope, openEnvelope, decode,
  asm, tilc: require('./tilc')
}

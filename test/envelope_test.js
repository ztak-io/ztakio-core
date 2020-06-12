const ztak = require('../src/')
const bitcoin = require('bitcoinjs-lib')

const ecpair = bitcoin.ECPair.makeRandom()
const { address } = bitcoin.payments.p2pkh({ pubkey: ecpair.publicKey, network: ztak.networks.mainnet })

const vn = ztak.buildEnvelope(ecpair, Buffer.from('deadbeefcafebabe', 'hex'))
console.log(vn.toString('hex'), vn.length, 'bytes')

console.log(ztak.openEnvelope(vn))

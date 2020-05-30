const ztak = require('../src/')
const bitcoin = require('bitcoinjs-lib')

const ecpair = bitcoin.ECPair.makeRandom()
const { address } = bitcoin.payments.p2pkh({ pubkey: ecpair.publicKey, network: ztak.networks.mainnet })

const vn = ztak.buildEnvelope(ecpair, {
  a: 1, b: 'asd', c: 56767535373573535n
})
console.log(vn)

console.log(ztak.openEnvelope(vn))

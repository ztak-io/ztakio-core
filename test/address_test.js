const ztak = require('../src/')
const bitcoin = require('bitcoinjs-lib')

const ecpair = bitcoin.ECPair.makeRandom()
const { address } = bitcoin.payments.p2pkh({ pubkey: ecpair.publicKey, network: ztak.networks.mainnet })

console.log('Address:', address)
console.log('Wif:', ecpair.toWIF())

const fs = require('fs')
const crypto = require('crypto')
const ztak = require('../src/')
const bitcoin = require('bitcoinjs-lib')
const bitcoinMessage = require('bitcoinjs-message')
const asm = require('../src/asm')
const store = require('./store')

const ztakFederation = fs.readFileSync('./test/data/script_ztak.asm', 'utf8')

const ecpair = bitcoin.ECPair.fromWIF('L59AKx6ghLswcMhd6Zno9HJNkhTfckA5E56fyX7DPKEtWvsSGaRe')
const { address } = bitcoin.payments.p2pkh({ pubkey: ecpair.publicKey, network: ztak.networks.mainnet })

async function test() {
  const context = asm.createContext(ztak.utils(ztak.networks.mainnet), store, 'ZyJFG9AmGqrDLskgHrNMLNUB9n3yi9Vx2C')
  try {
    context.loadProgram(asm.compile(ztakFederation))
    await asm.execute(context)

    const blockhash = '0123456789ABCDEF0123456789ABCDEF'
    const signature = bitcoinMessage.sign(blockhash, ecpair.privateKey, ecpair.compressed, { extraEntropy: crypto.randomBytes(32) }).toString('base64')
    context.loadProgram(asm.compile(`REQUIRE /ztak
      PUSHS "${blockhash}"
      PUSHS "${signature}"
      LOG "Calling federation"
      ECALL federation
      END
      `))
    await asm.execute(context)
  } catch (e) {
    console.log(e)
  }
  console.log(JSON.parse(JSON.stringify(store.values)))
}

test()

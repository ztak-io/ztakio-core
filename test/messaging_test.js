const fs = require('fs')
const ztak = require('../src/')
const bitcoin = require('bitcoinjs-lib')
const asm = require('../src/asm')

const code = fs.readFileSync('./test/data/script1.asm', 'utf8')
const codeCall = fs.readFileSync('./test/data/script1_call.asm', 'utf8')

const ecpair = bitcoin.ECPair.fromWIF('L59AKx6ghLswcMhd6Zno9HJNkhTfckA5E56fyX7DPKEtWvsSGaRe')
const { address } = bitcoin.payments.p2pkh({ pubkey: ecpair.publicKey, network: ztak.networks.mainnet })

const vn = ztak.buildEnvelope(ecpair, { exec: asm.compile(codeCall).toString('hex') })

const msg = ztak.openEnvelope(vn)

const prog = Buffer.from(msg.exec, 'hex')
const store = {
  values: {},
  newValues: null,

  get: (key) => {
    return store.values[key]
  },
  put: (key, value) => {
    if (store.newValues !== null) {
      store.newValues[key] = value
    } else {
      store.values[key] = value
    }
  },
  start: () => {
    store.newValues = {}
  },
  commit: () => {
    if (store.newValues !== null) {
      for (let v in store.newValues) {
        store.values[v] = store.newValues[v]
      }
      store.newValues = null
    }
  },
  rollback: () => {
    store.newValues = null
  }
}

async function test() {
  const context = asm.createContext(ztak.utils(ztak.networks.mainnet), store, 'ZyJFG9AmGqrDLskgHrNMLNUB9n3yi9Vx2C')
  try {
    context.loadProgram(asm.compile('NAMESPACE /ztak\nDEPLOY\nEND\n'))
    await asm.execute(context)

    context.loadProgram(asm.compile(code))
    await asm.execute(context) // Required script

    context.loadProgram(prog)
    await asm.execute(context)
  } catch (e) {
    console.log(e)
  }
  console.log(store.values)
}

test()

const fs = require('fs')
const ztak = require('../src/')
const bitcoin = require('bitcoinjs-lib')
const asm = require('../src/asm')
const store = require('./store')
const util = require('util')

const ztakFederation = fs.readFileSync('./test/data/script_ztak.asm', 'utf8')
const code = fs.readFileSync('./test/data/script1.asm', 'utf8')
const codeCall = fs.readFileSync('./test/data/script1_call.asm', 'utf8')

const ecpair = bitcoin.ECPair.fromWIF('L4Lwnf2cFUp3nzFg7gwnt5ifGJHTimef2hv24cSXbR3bViik7H6s')
const sourceEcpair = bitcoin.ECPair.fromWIF('L59AKx6ghLswcMhd6Zno9HJNkhTfckA5E56fyX7DPKEtWvsSGaRe')

function getAddress(ec) {
  const { address } = bitcoin.payments.p2pkh({ pubkey: ec.publicKey, network: ztak.networks.mainnet })
  return address
}

/*const { address } = bitcoin.payments.p2pkh({ pubkey: ecpair.publicKey, network: ztak.networks.mainnet })

const vn = ztak.buildEnvelope(ecpair, { exec: asm.compile(util.format(codeCall, address)).toString('hex') })
const vntext = JSON.stringify(vn)
console.log('Envelope length:', vntext.length, 'bytes')
const msg = ztak.openEnvelope(vn)*/

async function send(ec, destAddress, amount) {
  //const { address } = bitcoin.payments.p2pkh({ pubkey: ec.publicKey, network: ztak.networks.mainnet })
  const vn = ztak.buildEnvelope(ec, asm.compile(util.format(codeCall, destAddress, amount)))
  console.log(`Sending from ${getAddress(ec)} to ${destAddress} amnt ${amount}, byte length ${vn.length}`)
  return vn.toString('hex')
}

async function parseSend(vn) {
  const msg = ztak.openEnvelope(Buffer.from(vn, 'hex'))

  const prog = Buffer.from(msg.data, 'hex')
  const context = asm.createContext(ztak.utils(ztak.networks.mainnet), store, msg.from)
  try {
    context.loadProgram(prog)
    await asm.execute(context)
    return true
  } catch (e) {
    console.log('ERROR:', e)
    return false
  }
}

async function test() {
  const context = asm.createContext(ztak.utils(ztak.networks.mainnet), store, 'ZyJFG9AmGqrDLskgHrNMLNUB9n3yi9Vx2C')
  try {
    context.loadProgram(asm.compile(ztakFederation))
    await asm.execute(context)

    context.loadProgram(asm.compile(code))
    await asm.execute(context) // Required script
  } catch (e) {
    console.log(e)
  }

  if (!await parseSend(await send(sourceEcpair, getAddress(ecpair), 105))) {
    console.log('Failed send!')
  }

  if (!await parseSend(await send(ecpair, 'burn', 85))) {
    console.log('Failed send!')
  }
  console.log(JSON.parse(JSON.stringify(store.values)))
}

test()

const fs = require('fs')
const mustache = require('mustache')
const deployCode = fs.readFileSync('./test/data/fungible_token.asm', 'utf8')
const issuanceCode = fs.readFileSync('./test/data/fungible_token_issuance.asm', 'utf8')
const sendCode = fs.readFileSync('./test/data/fungible_token_send.asm', 'utf8')
const dexCode = fs.readFileSync('./test/data/dex.asm', 'utf8')
const dexCreateOrderCode = fs.readFileSync('./test/data/dex_create_order.asm', 'utf8')
const ztak = require('../src/')
const zlib = require('zlib')
const util = require('util')

const store = require('./store')

const createToken = (token, decimals, name, version, author) => {
  return ztak.asm.compile(util.format(deployCode, token, decimals, name, version, author))
}

const createIssuance = (token, amount) => {
  return ztak.asm.compile(mustache.render(issuanceCode, {token, amount}))
}

const createSend = (token, address, amount, memo) => {
  return ztak.asm.compile(mustache.render(sendCode, {token, address, amount, memo}))
}

const createDex = (author, top, bottom) => {
  return ztak.asm.compile(mustache.render(dexCode, {top, bottom, author}))
}

const createDexOrder = (get, give, side) => {
  return ztak.asm.compile(mustache.render(dexCreateOrderCode, {get, give, side}))
}

async function test() {
  const ut = ztak.utils(ztak.networks.mainnet)
  const btcToken = '/btc'
  const usdToken = '/usd'
  const contractOwner = 'ZyJFG9AmGqrDLskgHrNMLNUB9n3yi9Vx2C'

  const create = async (owner, token, decimals, name, version) => {
    let context = ztak.asm.createContext(ut, store, owner)
    context.loadProgram(createToken(token, decimals, name, version, owner))
    try {
      await ztak.asm.execute(context)
    } catch (e) {
      console.log(e.message)
    }
  }

  const issuance = async (source, token, num) => {
    let context = ztak.asm.createContext(ut, store, source)
    context.loadProgram(createIssuance(token, num))
    try {
      //console.log(context)
      await ztak.asm.execute(context)
    } catch (e) {
      console.log(e.message)
    }
  }

  const send = async (token, source, destination, num, memo) => {
    let context = ztak.asm.createContext(ut, store, source)
    context.loadProgram(createSend(token, destination, num, memo))
    try {
      await ztak.asm.execute(context)
    } catch (e) {
      console.log(e.message)
    }
  }

  const dex = async (owner, top, bottom) => {
    let context = ztak.asm.createContext(ut, store, owner)
    context.loadProgram(createDex(owner, top, bottom))
    try {
      await ztak.asm.execute(context)
    } catch (e) {
      console.log(e.message)
    }
  }

  const dexAskOrder = async (owner, get, give, txid) => {
    let context = ztak.asm.createContext(ut, store, owner, txid)
    context.loadProgram(createDexOrder(get, give, 'ask'))
    try {
      await ztak.asm.execute(context)
    } catch (e) {
      console.log(e.message)
    }
  }

  const dexBidOrder = async (owner, get, give, txid) => {
    let context = ztak.asm.createContext(ut, store, owner, txid)
    context.loadProgram(createDexOrder(get, give, 'bid'))
    try {
      await ztak.asm.execute(context)
    } catch (e) {
      console.log(e.message)
    }
  }

  const testDex = async (owner, txid) => {
    const cl = `REQUIRE /dex
    ECALL /dex:test
    VERIFY
    END
    `

    let context = ztak.asm.createContext(ut, store, owner, txid)
    context.loadProgram(ztak.asm.compile(cl))
    try {
      await ztak.asm.execute(context)
    } catch (e) {
      console.log(e.message)
    }
  }

  const recipient1 = 'Hp4z6MBCt9fBZjNdLEeKoDtLYJvPRPKxds'
  const recipient2 = 'HjnjkuNQzsGaxg873dKmaiciEhs3fdyWCh'
  const recipient3 = 'HXHENtz7j69jhsv2ayKaADwg9Pfy6N18CY'

  await create(contractOwner, btcToken, 8, 'BTC Token', '0.0.1')
  await create(contractOwner, usdToken, 2, 'USD Token', '0.0.1')
  await issuance(contractOwner, btcToken, 100000000)
  await issuance(contractOwner, usdToken, 10000000)
  await send(btcToken, contractOwner, recipient1, 50000000, '')
  await send(btcToken, recipient1, recipient2, 100, '')
  await send(usdToken, contractOwner, recipient1, 10000, '')
  await send(usdToken, contractOwner, recipient2, 5000000, '')

  await dex(contractOwner, btcToken, usdToken)
  await dexAskOrder(recipient2, 2, 1, 'asd')
  await dexAskOrder(recipient2, 3, 2, 'afd')
  await dexBidOrder(recipient1, 1, 2, 'qwe')
  //await dexBidOrder(recipient1, 2, 3, 'hee')

  //store.verbose = true
  //await testDex(contractOwner, 2)

  console.log(
    Object.fromEntries(
      Object.entries(store.values).filter(([k,v]) => k.match(/\/.*\//))
    )
  )
}

test()

const fs = require('fs')
const code = fs.readFileSync('./test/data/script1.asm', 'utf8')
const asm = require('../src/asm')
const zlib = require('zlib')

const prog = asm.compile(code)
const store = {
  values: {},

  get: (key) => {
    return store.values[key]
  },
  put: (key, value) => {
    store.values[key] = value
  }
}

async function test() {
  const context = asm.createContext(prog, store, 'ZyJFG9AmGqrDLskgHrNMLNUB9n3yi9Vx2C')
  try {
    await asm.execute(context)
  } catch (e) {
    console.log(e.message)
  }
  console.log(store.values)
}

test()

const Grammars = require('ebnf').Grammars
const grammar = require('./lang_spec.js')
const buffers = require('./buffers')

const { ops, codeToOp, safeToString } = require('./ops')

function buildOp(elem, context) {
  if (elem.children[0].type === 'identifier') {
    const opName = elem.children[0].text.toUpperCase()

    if (opName in ops) {
      const {validate, build} = ops[opName]
      const argList = elem.children.slice(1)

      try {
        const validatedArgList = validate(argList)

        return build(...validatedArgList, context)
      } catch (e) {
        throw new Error(`on ${opName}: ${e.message}`)
      }
    } else {
      throw new Error(`opcode ${opName} not found`)
    }
  } else {
    throw new SyntaxError('expected identifier as first element in line')
  }
}

function buildLine(elem, context) {
  if (elem.type === 'op') {
    return buildOp(elem, context)
  } else {
    return ops.NOOP.build()
  }
}

function compile(code, debug) {
  const parser = new Grammars.W3C.Parser(grammar)
  const ast = parser.getAST(code)
  if (debug) {
    console.log(ast)
  }
  let builds = []
  let labels = {}

  // Collect all the labels for further reference
  for (let i=0; i < ast.children.length; i++) {
    const elem = ast.children[i]
    if (elem.type === 'label') {
      if (elem.children[0].type === 'alphanumeric') {
        labels[elem.children[0].text] = {line: i, referenced: false}
      } else {
        throw new Error(`Line ${i+1}: expected alphanumeric label`)
      }
    }
  }

  const context = {
    findLabel: (name) => {
      if (name in labels) {
        labels[name].referenced = true

        return labels[name].line
      } else {
        throw new Error(`label "${name}" not found`)
      }
    }
  }

  for (let i=0; i < ast.children.length; i++) {
    try {
      const elem = buildLine(ast.children[i], context)

      if (elem) {
        builds.push(elem)
      }
    } catch (e) {
      //console.log(ast.children[i])
      console.log(e)
      throw new Error(`Line ${i + 1}: ${e.message}`)
    }
  }

  Object.entries(labels).forEach(([name, entry]) => {
    if (!entry.referenced) {
      throw new Error(`Line ${entry.line + 1}: label "${name}" not referenced`)
    }
  })

  /*builds = builds.map(x => {
    let p = 0
    while (p < x.length) {
      let v = x.readUInt8(p)
      if (v === 0) {
        p++
      } else {
        break
      }
    }
    return x.slice(p)
  })*/
  return Buffer.concat(builds)
}

function printAst(elem, lvl, line) {
  let ws = new Array(lvl).fill(" ").join("")

  if (lvl > 0) {
    if (line) {
      console.log(line + ': ' + ws + elem.type + ': \t\t' + elem.text)
    } else {
      console.log(ws + elem.type + ': \t\t' + elem.text)
    }
  }

  for (let i=0; i < elem.children.length; i++) {
    if (lvl === 0) {
      print(elem.children[i], lvl + 1, i + 1)
    } else {
      print(elem.children[i], lvl + 1)
    }
  }
}

function unpack(buf) {
  let cursor = 0

  let lines = []
  while (cursor < buf.length) {
    const opCode = buf.readUInt8(cursor++)
    const opName = codeToOp[opCode]
    const op = ops[opName]
    const params = []

    try {
      for (let i=0; i < op.unpackParams.length; i++) {
        const paramType = op.unpackParams[i]

        if (paramType === 'string') {
          const strSz = buf.readUInt16LE(cursor)
          cursor += 2
          params.push(buf.slice(cursor, cursor + strSz).toString('utf8'))
          cursor += strSz
        } else if (paramType === 'uint8') {
          params.push(buf.readUInt8(cursor))
          cursor += 1
        } else if (paramType === 'uint16') {
          params.push(buf.readUInt16LE(cursor))
          cursor += 2
        } else if (paramType === 'integer') {
          let type = buf.readUInt8(cursor++)
          let len = buf.readUInt8(cursor++)
          let data = buf.slice(cursor, cursor + len)
          params.push(buffers.Buf2BigInt(data))
          cursor += len
          /*params.push(buf.readBigInt64LE(cursor))
          cursor += 8*/
        }
      }

      lines.push({opName, params})
    } catch(e) {
      console.log(`at line ${lines.length}`, e)
    }
  }

  return lines
}

function createContext(utils, store, callerAddress, currentTxid) {
  let ob = {
    program: null,
    code: null,
    line: 0,
    meta: null,
    entrypoints: {},
    registers: {},
    stack: [],
    successfulVerificationEvents: [],
    executing: false,
    callingNamespace: '',
    pendingBranchEnum: null,
    debug: false,
    executionContexts: {},
    assertExists: {},
    constants: {},
    callerAddress, store, utils, currentTxid,

    stackPush: (itm) => {
      ob.stack.push(itm)
    },

    stackPop: () => {
      return ob.stack.pop()
    },

    stackSlice: (a, b) => {
      if (a === -0 && typeof(b) === "undefined") {
        return []
      } else {
        return ob.stack.slice(a, b)
      }
    },

    stackShift: () => {
      return ob.stack.shift()
    },

    stackMap: (f) => {
      return ob.stack.map(f)
    },

    findLabel: (name) => {
      if (name in ob.entrypoints) {
        return ob.entrypoints[name]
      } else {
        console.log(`While looking for "${name}" in`, ob.entrypoints)
        throw new Error(`label ${name} not found`)
      }
    },

    loadProgram: (buf) => {
      ob.code = buf
      ob.program = unpack(buf).map(x => {
        x.owner = callerAddress
        return x
      })
      ob.line = 0
      ob.stack = []
      ob.executing = true
      ob.assertExists = {}
      ob.entrypoints = {}
      ob.meta = {}
      ob.registers = {}
      ob.constants = {}
    },

    appendProgram: (namespace, buf, entrypoints, meta) => {
      if (namespace in ob.executionContexts) return // Don't require already required namespaces

      ob.executionContexts[namespace] = false

      let unpacked = unpack(buf).map(x => {
        x.overrideNamespace = namespace
        return x
      })

      if ('Address' in meta) {
        unpacked = unpacked.map(x => {
          x.owner = meta.Address
          return x
        })
      }

      let move = ob.program.length
      unpacked = unpacked.map(line => {
        const op = ops[line.opName]

        if ('relocateStrategy' in op) {
          if (op.relocateStrategy === 'move') {
            for (let i=0; i < line.params.length; i++) {
              if (typeof(line.params[i]) === 'number') {
                line.params[i] += move
              }
            }
          } else if (op.relocateStrategy === 'noop') {
            line.opName = 'NOOP'
          }
        }

        return line
      })

      ob.program = ob.program.concat(unpacked)
      for (let entry in entrypoints) {
        let relocEntry = namespace + ':' + entry
        if (relocEntry in ob.entrypoints) {
          throw new Error(`tried to require a contract with a duplicate label ${entry}`)
        } else {
          ob.entrypoints[relocEntry] = entrypoints[entry] + move
        }
      }
    }
  }
  return ob
}

const verificationCallbacks = []
async function execute(context, entrypoint, dontCommitReturnState) {
  await context.store.start()
  try {
    while (context.executing) {
      if (context.line < 0 || context.line >= context.program.length) {
        context.executing = false
        throw new Error(`Execution out of bounds: line ${context.line + 1}`)
      }

      const currentLine = context.program[context.line]
      const op = ops[currentLine.opName]

      context.currentLineOwner = currentLine.owner || context.callerAddress
      context.currentLineContext = currentLine.overrideNamespace || context.namespace
      //console.log('--->',  context.currentLineContext, ' ', context.line, '/', context.program.length, currentLine.opName, ...currentLine.params, context.registers)
      //console.log('--->', context.line, '/', context.program.length, context.stack, currentLine.opName, ...currentLine.params)
      //console.log('--->', context.line, '/', context.program.length, currentLine.opName, ...currentLine.params)
      await op.run(...currentLine.params, context)
      //console.log('<---', context.stack,'\n')

      context.line++
    }

    let canCommit = true
    let invalidContexts = []
    for (let x in context.executionContexts) {
      canCommit &= context.executionContexts[x]
      if (!context.executionContexts[x]) {
        invalidContexts.push(x)
      }
    }

    if (canCommit) {
      if (dontCommitReturnState) {
        let commitState = await context.store.rollback(true)
        return {
          ...context.executionContexts,
          [context.namespace]: true,
          commitState
        }
      } else {
        await context.store.commit()
        if (context.successfulVerificationEvents.length > 0) {
          context.successfulVerificationEvents.forEach(x => {
            verificationCallbacks.forEach(cb => cb({...x, caller: context.callerAddress, txid: context.currentTxid}))
          })
        }
        return true
      }
    } else {
      await context.store.rollback()
      throw new Error(`Couldn't VERIFY transaction on contexts: ${invalidContexts.join(',')}`)
    }
  } catch (e) {
    console.log(e)
    await context.store.rollback()
    throw new Error(`Line ${context.line + 1} ` + e.message)
  }
}

function registerVerificationCallback(cb) {
  verificationCallbacks.push(cb)
}

module.exports = {
  compile, unpack, createContext, execute, ops, safeToString, registerVerificationCallback
}

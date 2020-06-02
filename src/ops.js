const { crypto } = require('bitcoinjs-lib')
const {UInt8Buf, StringBuf, LineOfCodeBuf, Int64Buf, UInt64Buf, UInt16Buf} = require('./buffers')

function forceArgs(list, types) {
  let results = []

  for (let i=0; i < list.length; i++) {
    const type = types[i]

    if (list[i].type === type) {
      let val = list[i].text
      if (type === 'string') {
        val = val.slice(1, -1)
      } else if (type === 'number') {
        val = BigInt(val)
      }
      results.push(val)
    } else {
      throw new TypeError(`argument ${i + 1} must be of type ${type}`)
    }
  }

  return results
}

const ops = {
  NOOP: {
    comment: 'No operation',
    code: 0x00,
    validate: (elems) => [],
    build: () => UInt8Buf(ops.NOOP.code),
    unpackParams: [],
    run: () => {}
  },

  END: {
    comment: 'Ends contract execution',
    code: 0xFF,
    validate: (elems) => [],
    build: () => UInt8Buf(ops.END.code),
    unpackParams: [],
    run: (context) => {
      context.executing = false
    }
  },

  META: {
    comment: 'Adds metadata values to the contract storage',
    code: 0x01,
    validate: (elems) => forceArgs(elems, ['string', 'string']),
    relocateStrategy: 'noop',
    build: (key, value) => Buffer.concat([
      UInt8Buf(ops.META.code),
      StringBuf(key),
      StringBuf(value)
    ]),
    unpackParams: ['string', 'string'],
    run: (key, value, context) => {
      const verifyAddress = (val) => {
        try {
          context.utils.addressVerifier(val)
          return
        } catch(e) {
          throw new Error(`when setting META for ${key}: error parsing address "${value}": ${e.message}`)
        }
      }

      if (key === 'Address') {
        verifyAddress(value)
        console.log('WARNING: META setting Address in scripts is a NOOP and serves only for aestethic purposes')
        return
      } else if (key === 'Author') {
        verifyAddress(value)
      }

      context.meta[key] = value
    }
  },

  ENTRY: {
    comment: 'Defines a contract entrypoint',
    code: 0x02,
    validate: (elems) => forceArgs(elems, ['string', 'identifier']),
    relocateStrategy: 'noop',
    build: (eventName, label, context) => Buffer.concat([
      UInt8Buf(ops.ENTRY.code),
      StringBuf(eventName),
      LineOfCodeBuf(context.findLabel(label))
    ]),
    unpackParams: ['string', 'uint16'],
    run: (label, line, context) => context.entrypoints[label] = line
  },

  NAMESPACE: {
    comment: 'Defines a contract namespace',
    code: 0x03,
    validate: (elems) => forceArgs(elems, ['path']),
    relocateStrategy: 'noop',
    build: (namespace, context) => Buffer.concat([
      UInt8Buf(ops.NAMESPACE.code),
      StringBuf(namespace)
    ]),
    unpackParams: ['string'],
    run: async (namespace, context) => {
      const existing = await context.store.get(context.namespace)
      if (existing) {
        const existingMeta = await context.store.get(context.namespace + '.meta')
        if (!existingMeta.Address === context.callerAddress) {
          throw new Error('contract namespace owned by a different address, not executing')
        }
      } else {
        let spls = namespace.split('/')

        if (spls.length > 1) {
          let parentNamespace = spls.slice(0, -1).join('/')
          if (parentNamespace.length > 0) {
            let parentMeta = await context.store.get(parentNamespace + '.meta')

            if (parentMeta) {
              if (!(parentMeta.Address === context.callerAddress)) {
                throw new Error('parent namespace not owned by the deployer address, not executing')
              }
            } else {
              throw new Error('parent namespace doesn\'t exists, not deploying')
            }
          }
        }
      }

      context.namespace = namespace
    }
  },

  NPR: {
    comment: 'Makes the current execution fail if this op with the same identifier is executed more than number times (up to 65535 times)',
    code: 0x04,
    validate: (elems) => forceArgs(elems, ['identifier', 'number']),
    build: (label, num, context) => Buffer.concat([
      UInt8Buf(ops.NPR.code),
      StringBuf(label),
      UInt16Buf(Number(num)),
    ]),
    unpackParams: ['string', 'uint16'],
    run: (label, num, context) => {
      if (context.assertExists[label] && context.assertExists[label] >= num) {
        throw new Error(`executed more than ${num} times the tag ${label}`)
      }

      if (!context.assertExists[label]) {
        context.assertExists[label] = 1
      } else {
        context.assertExists[label] += 1
      }
    }
  },

  OWNER: {
    comment: 'Makes the current execution fail if this op isn\'t executed by the owner of the contract',
    code: 0x05,
    validate: (elems) => [],
    build: (context) => UInt8Buf(ops.OWNER.code),
    unpackParams: [],
    run: (context) => {
      if (context.callerAddress !== context.currentLineOwner) {
        throw new Error(`execution only allowed by owner`)
      }
    }
  },

  DEPLOY: {
    comment: 'Deploys the current contract, calls the apporpiate \'deploy\' entrypoint if the contract didn\'t exist',
    code: 0x06,
    validate: (elems) => forceArgs(elems, ['identifier']),
    relocateStrategy: 'noop',
    build: (label, context) => Buffer.concat([
      UInt8Buf(ops.DEPLOY.code),
      LineOfCodeBuf(context.findLabel(label))
    ]),
    unpackParams: ['uint16'],
    run: async (deployLabelLine, context) => {
      const existing = await context.store.get(context.namespace)
      if (existing) {
        const existingMeta = await context.store.get(context.namespace + '.meta')
        if (existingMeta.Address === context.callerAddress) {
          console.trace('WARNING: need to compare hashes of the script and update deployment if needed')
        } else {
          throw new Error('contract namespace owned by a different address, not deploying')
        }
      } else {
        let spls = context.namespace.split('/')

        if (spls.length > 1) {
          let parentNamespace = spls.slice(0, -1).join('/')
          if (parentNamespace.length > 0) {
            let parentMeta = await context.store.get(parentNamespace + '.meta')

            if (parentMeta) {
              if (!(parentMeta.Address === context.callerAddress)) {
                throw new Error('parent namespace not owned by the deployer address, not deploying')
              }
            } else {
              throw new Error('parent namespace doesn\'t exists, not deploying')
            }
          }
        }
      }

      context.meta.Address = context.callerAddress // Force the owner to be the deployer, regardless of whatever the cotnract says

      await context.store.put(context.namespace, context.code)
      await context.store.put(context.namespace + '.entrypoints', context.entrypoints)
      await context.store.put(context.namespace + '.meta', context.meta)

      for (let loc in context.entrypoints) {
        if (context.entrypoints[loc] === deployLabelLine) {
          throw new Error(`cannot deploy on the same label as entrypoint ${loc}`)
        }
      }

      await ops.CALL.run(deployLabelLine, context)
    }
  },

  REQUIRE: {
    comment: 'Requires another contract to be loaded, relocating the code at the end of the currently loaded contract',
    code: 0x07,
    validate: (elems) => forceArgs(elems, ['path']),
    build: (path, context) => Buffer.concat([
      UInt8Buf(ops.REQUIRE.code),
      StringBuf(path)
    ]),
    unpackParams: ['string'],
    run: async (path, context) => {
      const code = await context.store.get(path)
      const entrypoints = await context.store.get(path + '.entrypoints')
      const meta = await context.store.get(path + '.meta')
      if (!code) {
        throw new Error(`contract on namespace ${path} not found`)
      } else if (!entrypoints) {
        throw new Error(`contract entrypoints on namespace ${path} not found`)
      } else if (!meta) {
        throw new Error(`contract metainformation on namespace ${path} not found`)
      } else {
        context.appendProgram(code, entrypoints, meta)
      }
    }
  },

  CALL: {
    comment: 'Calls a label, pushing current execution state at the bottom of the stack',
    code: 0x10,
    validate: (elems) => forceArgs(elems, ['identifier']),
    relocateStrategy: 'move',
    build: (label, context) => Buffer.concat([
      UInt8Buf(ops.CALL.code),
      LineOfCodeBuf(context.findLabel(label))
    ]),
    unpackParams: ['uint16'],
    run: (line, context) => {
      if (line <= context.line) {
        throw new Error(`cannot call line ${line} from line ${context.line}`)
      }

      const savedContext = {
        line: context.line,
        registers: context.registers,
        stack: context.stack.map(x => x)
      }
      context.stack = [savedContext].concat(context.stack)
      context.registers = {}
      context.line = line
    }
  },

  JNZ: {
    comment: 'Jumps to a given label if the top value of the stack is nonzero',
    code: 0x11,
    validate: (elems) => forceArgs(elems, ['identifier']),
    relocateStrategy: 'move',
    build: (label, context) => Buffer.concat([
      UInt8Buf(ops.JNZ.code),
      LineOfCodeBuf(context.findLabel(label))
    ]),
    unpackParams: ['uint16'],
    run: (line, context) => {
      if (line <= context.line) {
        throw new Error(`cannot call line ${line} from line ${context.line}`)
      }

      if (context.stack.length > 0) {
        if (context.stack[context.stack.length - 1] !== 0n) {
          context.line = line - 1
        }
      } else {
        throw new Error(`invalid empty stack on JNZ operator`)
      }
    }
  },

  JZ: {
    comment: 'Jumps to a given label if the top value of the stack is zero',
    code: 0x12,
    validate: (elems) => forceArgs(elems, ['identifier']),
    relocateStrategy: 'move',
    build: (label, context) => Buffer.concat([
      UInt8Buf(ops.JZ.code),
      LineOfCodeBuf(context.findLabel(label))
    ]),
    unpackParams: ['uint16'],
    run: (line, context) => {
      if (line <= context.line) {
        throw new Error(`cannot call line ${line} from line ${context.line}`)
      }

      if (context.stack.length > 0) {
        if (context.stack[context.stack.length - 1] === 0n) {
          context.line = line - 1
        }
      } else {
        throw new Error(`invalid empty stack on JZ operator`)
      }
    }
  },

  JEQ: {
    comment: 'Jumps to a given label if the top value of the stack is equal to the second value of the stack',
    code: 0x13,
    validate: (elems) => forceArgs(elems, ['identifier']),
    relocateStrategy: 'move',
    build: (label, context) => Buffer.concat([
      UInt8Buf(ops.JEQ.code),
      LineOfCodeBuf(context.findLabel(label))
    ]),
    unpackParams: ['uint16'],
    run: (line, context) => {
      if (line <= context.line) {
        throw new Error(`cannot call line ${line} from line ${context.line}`)
      }

      if (context.stack.length > 1) {
        if (context.stack[context.stack.length - 1] === context.stack[context.stack.length - 2]) {
          context.line = line - 1
        }
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on JEQ operator`)
      }
    }
  },

  JNEQ: {
    comment: 'Jumps to a given label if the top value of the stack is not equal to the second value of the stack',
    code: 0x14,
    validate: (elems) => forceArgs(elems, ['identifier']),
    relocateStrategy: 'move',
    build: (label, context) => Buffer.concat([
      UInt8Buf(ops.JNEQ.code),
      LineOfCodeBuf(context.findLabel(label))
    ]),
    unpackParams: ['uint16'],
    run: (line, context) => {
      if (line <= context.line) {
        throw new Error(`cannot call line ${line} from line ${context.line}`)
      }

      if (context.stack.length > 1) {
        if (context.stack[context.stack.length - 1] !== context.stack[context.stack.length - 2]) {
          context.line = line - 1
        }
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on JNEQ operator`)
      }
    }
  },

  JLZ: {
    comment: 'Jumps to a given label if the top value of the stack is less than zero',
    code: 0x15,
    validate: (elems) => forceArgs(elems, ['identifier']),
    relocateStrategy: 'move',
    build: (label, context) => Buffer.concat([
      UInt8Buf(ops.JLZ.code),
      LineOfCodeBuf(context.findLabel(label))
    ]),
    unpackParams: ['uint16'],
    run: (line, context) => {
      if (line <= context.line) {
        throw new Error(`cannot call line ${line} from line ${context.line}`)
      }

      if (context.stack.length > 0) {
        if (context.stack[context.stack.length - 1] < 0n) {
          context.line = line - 1
        }
      } else {
        throw new Error(`invalid empty stack on JLZ operator`)
      }
    }
  },

  JGZ: {
    comment: 'Jumps to a given label if the top value of the stack is greater than zero',
    code: 0x16,
    validate: (elems) => forceArgs(elems, ['identifier']),
    relocateStrategy: 'move',
    build: (label, context) => Buffer.concat([
      UInt8Buf(ops.JLZ.code),
      LineOfCodeBuf(context.findLabel(label))
    ]),
    unpackParams: ['uint16'],
    run: (line, context) => {
      if (line <= context.line) {
        throw new Error(`cannot call line ${line} from line ${context.line}`)
      }

      if (context.stack.length > 0) {
        if (context.stack[context.stack.length - 1] > 0n) {
          context.line = line - 1
        }
      } else {
        throw new Error(`invalid empty stack on JGZ operator`)
      }
    }
  },

  RET: {
    comment: 'Returns to the previous caller, putting the top N elements of stack in top of the previous one',
    code: 0x17,
    validate: (elems) => forceArgs(elems, ['number']),
    build: (amount) => Buffer.concat([
      UInt8Buf(ops.RET.code),
      UInt8Buf(Number(amount))
    ]),
    unpackParams: ['uint8'],
    run: (num, context) => {
      if (context.stack.length > num) {
        const previousContext = context.stack.shift()

        context.line = previousContext.line
        context.registers = previousContext.registers
        context.stack = previousContext.stack.concat(context.stack.slice(-num))
      } else {
        throw new Error(`invalid empty or less than ${num} stack on RET operator`)
      }
    }
  },

  ECALL: {
    comment: 'Calls a label, pushing current execution state at the bottom of the stack. Resolves the label at runtime.',
    code: 0x18,
    validate: (elems) => forceArgs(elems, ['identifier']),
    build: (label, context) => Buffer.concat([
      UInt8Buf(ops.ECALL.code),
      StringBuf(label)
    ]),
    unpackParams: ['string'],
    run: (label, context) => {
      let line = context.findLabel(label)

      if (line <= context.line) {
        throw new Error(`cannot call line ${line} from line ${context.line}`)
      }

      const savedContext = {
        line: context.line,
        registers: context.registers,
        stack: context.stack.map(x => x)
      }
      context.stack = [savedContext].concat(context.stack)
      context.registers = {}
      context.line = line
    }
  },

  VERIFY: {
    comment: 'Pops stack, if different than 1 or empty, throws an error.',
    code: 0x19,
    validate: (elems) => [],
    build: (context) => UInt8Buf(ops.VERIFY.code),
    unpackParams: [],
    run: (context) => {
      if (context.stack.length > 0) {
        const top = context.stack.pop()
        if (!(top === 1 || top === 1n)) {
          throw new Error(`invalid stack on VERIFY op (top != 1)`)
        }
      } else {
        throw new Error(`empty stack on VERIFY op`)
      }
    }
  },

  POP: {
    comment: 'Pop value from the stack to a given register on the context',
    code: 0x20,
    validate: (elems) => forceArgs(elems, ['identifier']),
    build: (identifier) => Buffer.concat([
      UInt8Buf(ops.POP.code),
      StringBuf(identifier)
    ]),
    unpackParams: ['string'],
    run: (identifier, context) => {
      context.registers[identifier] = context.stack.pop()
    }
  },

  PUSHS: {
    comment: 'Push string literal into the stack',
    code: 0x21,
    validate: (elems) => forceArgs(elems, ['string']),
    build: (str) => Buffer.concat([
      UInt8Buf(ops.PUSHS.code),
      StringBuf(str)
    ]),
    unpackParams: ['string'],
    run: (str, context) => {
      context.stack.push(str)
    }
  },

  PUSHI: {
    comment: 'Push integer literal into the stack',
    code: 0x22,
    validate: (elems) => forceArgs(elems, ['number']),
    build: (val) => Buffer.concat([
      UInt8Buf(ops.PUSHI.code),
      Int64Buf(val)
    ]),
    unpackParams: ['integer'],
    run: (val, context) => {
      context.stack.push(val)
    }
  },

  PUSHU: {
    comment: 'Push unsigned integer literal into the stack',
    code: 0x23,
    validate: (elems) => forceArgs(elems, ['number']),
    build: (val) => Buffer.concat([
      UInt8Buf(ops.PUSHU.code),
      UInt64Buf(val)
    ]),
    unpackParams: ['integer'],
    run: (val, context) => {
      context.stack.push(val)
    }
  },

  PUSHR: {
    comment: 'Push register value into the stack',
    code: 0x24,
    validate: (elems) => forceArgs(elems, ['identifier']),
    build: (ident) => Buffer.concat([
      UInt8Buf(ops.PUSHR.code),
      StringBuf(ident)
    ]),
    unpackParams: ['string'],
    run: (ident, context) => {
      context.stack.push(context.registers[ident])
    }
  },

  PUSHV: {
    comment: 'Push special value into the stack',
    code: 0x25,
    validate: (elems) => forceArgs(elems, ['identifier']),
    build: (ident) => Buffer.concat([
      UInt8Buf(ops.PUSHV.code),
      StringBuf(ident)
    ]),
    unpackParams: ['string'],
    run: (ident, context) => {
      if (ident === 'caller') {
        context.stack.push(context.callerAddress)
      } else if (ident === 'owner') {
        context.stack.push(context.currentLineOwner)
      } else if (ident === 'height') {
        context.stack.push(context.currentHeight)
      } else {
        throw new Error(`invalid special value ${ident}`)
      }
    }
  },

  SWAP: {
    comment: 'Swaps the top 2 elements of the stack',
    code: 0x26,
    validate: (elems) => [],
    build: (ident) => UInt8Buf(ops.SWAP.code),
    unpackParams: [],
    run: (context) => {
      if (context.stack.length > 1) {
        let first = context.stack[context.stack.length - 1]
        let second = context.stack[context.stack.length - 2]

        context.stack[context.stack.length - 1] = second
        context.stack[context.stack.length - 2] = first
      } else {
        throw new Error(`invalid stack size ${context.stack.length}`)
      }
    }
  },

  DROP: {
    comment: 'Pop top of the stack',
    code: 0x27,
    validate: (elems) => [],
    build: (identifier) => UInt8Buf(ops.DROP.code),
    unpackParams: [],
    run: (context) => {
      context.stack.pop()
    }
  },

  POPM: {
    comment: 'Pop value from the stack to a given meta on the contract, save the metadata on successful execution.',
    code: 0x28,
    validate: (elems) => forceArgs(elems, ['string']),
    build: (metaIdent) => Buffer.concat([
      UInt8Buf(ops.POPM.code),
      StringBuf(metaIdent)
    ]),
    unpackParams: ['string'],
    run: async (metaIdent, context) => {
      const metaName = context.namespace + '.meta'
      let metaInfo = await context.store.get(metaName)
      const newval = context.stack.pop()
      if (metaIdent === 'Address') {
        // Value must be valid
        try {
          context.utils.addressVerifier(newval)
        } catch(e) {
          throw new Error(`error parsing address "${newval}": ${e.message}`)
        }
      }
      metaInfo[metaIdent] = newval
      await context.store.put(metaName, metaInfo)
    }
  },

  SINK: {
    comment: 'Swaps the top 2 elements of the stack, removes the resulting top',
    code: 0x29,
    validate: (elems) => [],
    build: (ident) => UInt8Buf(ops.SINK.code),
    unpackParams: [],
    run: (context) => {
      if (context.stack.length > 1) {
        let first = context.stack[context.stack.length - 1]
        context.stack.pop()
        context.stack[context.stack.length - 1] = first
      } else {
        throw new Error(`invalid stack size ${context.stack.length}`)
      }
    }
  },

  DROP2: {
    comment: 'Pop top of the stack two times',
    code: 0x2A,
    validate: (elems) => [],
    build: (identifier) => UInt8Buf(ops.DROP2.code),
    unpackParams: [],
    run: (context) => {
      context.stack.pop()
      context.stack.pop()
    }
  },

  PLUS: {
    comment: 'Sums the two values on top of the stack as signed integers, pushes the result back into the stack',
    code: 0x40,
    validate: (elems) => [],
    build: (context) => UInt8Buf(ops.PLUS.code),
    unpackParams: [],
    run: (context) => {
      if (context.stack.length > 1) {
        context.stack.push(context.stack[context.stack.length - 1] + context.stack[context.stack.length - 2])
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on PLUS operator`)
      }
    }
  },

  MINUS: {
    comment: 'Subtracts the second value on the stack from the first value as signed integers, pushes the result back into the stack',
    code: 0x41,
    validate: (elems) => [],
    build: (context) => UInt8Buf(ops.MINUS.code),
    unpackParams: [],
    run: (context) => {
      if (context.stack.length > 1) {
        context.stack.push(context.stack[context.stack.length - 1] - context.stack[context.stack.length - 2])
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on MINUS operator`)
      }
    }
  },

  MUL: {
    comment: 'Multiplies the two values on top of the stack as signed integers, pushes the result back into the stack',
    code: 0x42,
    validate: (elems) => [],
    build: (context) => UInt8Buf(ops.MUL.code),
    unpackParams: [],
    run: (context) => {
      if (context.stack.length > 1) {
        context.stack.push(context.stack[context.stack.length - 1] * context.stack[context.stack.length - 2])
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on MUL operator`)
      }
    }
  },

  DIV: {
    comment: 'Divides the value on top of the stack by the second value on teh stack as signed integers, pushes the result back into the stack',
    code: 0x43,
    validate: (elems) => [],
    build: (context) => UInt8Buf(ops.DIV.code),
    unpackParams: [],
    run: (context) => {
      if (context.stack.length > 1) {
        context.stack.push(context.stack[context.stack.length - 1] / context.stack[context.stack.length - 2])
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on DIV operator`)
      }
    }
  },

  NEG: {
    comment: 'Negates the value on top of the stack, pushes the result back into the stack',
    code: 0x44,
    validate: (elems) => [],
    build: (context) => UInt8Buf(ops.NEG.code),
    unpackParams: [],
    run: (context) => {
      if (context.stack.length > 0) {
        context.stack.push(-context.stack[context.stack.length - 1])
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on NEG operator`)
      }
    }
  },

  AND: {
    comment: 'Bitwise ANDs the top 2 values of the stack. Pushes the result into the stack.',
    code: 0x45,
    validate: (elems) => [],
    build: (context) => UInt8Buf(ops.AND.code),
    unpackParams: [],
    run: (context) => {
      if (context.stack.length > 1) {
        context.stack.push(context.stack[context.stack.length - 2] & context.stack[context.stack.length - 1])
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on AND operator`)
      }
    }
  },

  OR: {
    comment: 'Bitwise ORs the top 2 values of the stack. Pushes the result into the stack.',
    code: 0x46,
    validate: (elems) => [],
    build: (context) => UInt8Buf(ops.OR.code),
    unpackParams: [],
    run: (context) => {
      if (context.stack.length > 1) {
        context.stack.push(context.stack[context.stack.length - 2] | context.stack[context.stack.length - 1])
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on OR operator`)
      }
    }
  },

  XOR: {
    comment: 'Bitwise XORs the top 2 values of the stack. Pushes the result into the stack.',
    code: 0x47,
    validate: (elems) => [],
    build: (context) => UInt8Buf(ops.XOR.code),
    unpackParams: [],
    run: (context) => {
      if (context.stack.length > 1) {
        context.stack.push(context.stack[context.stack.length - 2] ^ context.stack[context.stack.length - 1])
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on XOR operator`)
      }
    }
  },

  SHA256: {
    comment: 'Calculates the SHA256 hash of the current top of the stack item',
    code: 0x60,
    validate: (elems) => [],
    build: (context) => UInt8Buf(ops.SHA256.code),
    unpackParams: [],
    run: (context) => {
      if (context.stack.length > 0) {
        let val = context.stack[context.stack.length - 1]
        if (typeof(val) === 'string') {
          val = Buffer.from(val, 'utf8')
        } else if (!Buffer.isBuffer(val)) {
          throw new Error(`cannot do SHA256 over ${typeof(val)}`)
        }
        context.stack.push(crypto.sha256(val))
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on SHA256 operator`)
      }
    }
  },

  RIPEMD160: {
    comment: 'Calculates the RIPEMD160 hash of the current top of the stack item',
    code: 0x61,
    validate: (elems) => [],
    build: (context) => UInt8Buf(ops.RIPEMD160.code),
    unpackParams: [],
    run: (context) => {
      if (context.stack.length > 0) {
        let val = context.stack[context.stack.length - 1]
        if (typeof(val) === 'string') {
          val = Buffer.from(val, 'utf8')
        } else if (!Buffer.isBuffer(val)) {
          throw new Error(`cannot do RIPEMD160 over ${typeof(val)}`)
        }
        context.stack.push(crypto.ripemd160(val))
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on RIPEMD160 operator`)
      }
    }
  },

  GET: {
    comment: 'Gets a value from the store with its key being the top value of the stack, pushes the value onto the stack',
    code: 0x70,
    validate: (elems) => [],
    build: (context) => UInt8Buf(ops.GET.code),
    unpackParams: [],
    run: async (context) => {
      if (context.stack.length > 0) {
        await context.stack.push(context.store.get(context.namespace + '/' + context.stack[context.stack.length - 1]))
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on GET operator`)
      }
    }
  },

  PUT: {
    comment: 'Puts a value from the store with its value being the top value of the stack and the key being the second value on the stack',
    code: 0x71,
    validate: (elems) => [],
    build: (context) => UInt8Buf(ops.PUT.code),
    unpackParams: [],
    run: async (context) => {
      if (context.stack.length > 1) {
        await context.store.put(context.namespace + '/' + context.stack[context.stack.length - 2], context.stack[context.stack.length - 1])
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on PUT operator`)
      }
    }
  },

  GETI: {
    comment: 'Gets a value from the store as an integer with its key being the top value of the stack, pushes the value onto the stack. If undefined, pushes the given integer',
    code: 0x72,
    validate: (elems) => forceArgs(elems, ['number']),
    build: (def, context) => Buffer.concat([
      UInt8Buf(ops.GETI.code),
      Int64Buf(def)
    ]),
    unpackParams: ['integer'],
    run: async (def, context) => {
      if (context.stack.length > 0) {
        let val = await context.store.get(context.namespace + '/' + context.stack[context.stack.length - 1])

        if (typeof(val) === 'undefined') {
          val = def
        }

        context.stack.push(val)
      } else {
        throw new Error(`invalid stack (size ${context.stack.length}) on GET operator`)
      }
    }
  },

  LOG: {
    comment: 'Prunable log',
    code: 0xFE,
    validate: (elems) => forceArgs(elems, ['string']),
    build: (text) => Buffer.concat([
      UInt8Buf(ops.LOG.code),
      StringBuf(text)
    ]),
    unpackParams: ['string'],
    run: (text) => {
      console.log('LOG:', text)
    }
  }
}

const codeToOp = {}
function _unpackCodes() {
  for (let opName in ops) {
    const op = ops[opName]
    codeToOp[op.code] = opName
  }
}
_unpackCodes()

function help() {
  const opEntries = Object.entries(ops)
  for (let i=0; i < opEntries.length; i++) {
    const [key, value] = opEntries[i]

    console.log(key, '\t-\t', value.comment, '-', value.unpackParams)
  }
  console.log(`Total opcodes: ${opEntries.length}`)
}

module.exports = {
  ops, codeToOp, help
}

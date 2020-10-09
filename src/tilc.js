const fs = require('fs')
const Grammars = require('ebnf').Grammars
//const grammar = fs.readFileSync(require.resolve('./til_lang_spec.ebnf'), 'utf8')
const grammar = require('./til_lang_spec.ebnf')
const util = require('util')

function parse(code) {
  const parser = new Grammars.W3C.Parser(grammar)
  const compiled = parser.getAST(code)

  if (compiled) {
    return compiled
  } else {
    console.log('Couldn\'t compile')
  }
}

const printables = {
  'identifier': true,
  'number': true,
  'string': true,
  'path': true,
  'operator': true,
  'func_qualification': true,
  'namespace_op': true,
  'declaration_qualification': true
}
function printAst(elem, lvl, prevWs) {
  let ws

  if (lvl > 0) {
    ws = new Array(lvl).fill("  ").join("")
  } else {
    ws = ''
  }

  let txt = ws + elem.type
  if (elem.type in printables) {
    txt += ': ' + elem.text
  }
  console.log(txt)

  for (let i=0; i < elem.children.length; i++) {
    printAst(elem.children[i], lvl + 1)
  }
}

function $(node, path, dumpNode, skip) {
  if (typeof(skip) === "undefined") {
    skip = 0
  }
  let spl = path.split('/')
  let inspectNode = node

  while (step = spl.shift()) {
    let found = false
    for (let i=0; i < inspectNode.children.length; i++) {
      let child = inspectNode.children[i]

      if (child.type === step) {
        if (spl.length > 0) {
          inspectNode = child
          found = true
          break
        } else {
          if (skip == 0) {
            if (dumpNode) {
              return child
            } else {
              return child.text
            }
          } else {
            skip--
          }
        }
      }
    }

    if (!found) {
      //console.log(`Invalid path ${path} on node ${node.type}`)
      return null
    }
  }
}

function operatorToAsm(op, gen) {
  const simpleOps = {
    '**': 'POW',
    '*': 'MUL',
    '/': 'DIV',
    '%': 'MOD',
    '+': 'PLUS',
    '_': 'CONCAT',
    '-': 'MINUS',
    '<<': 'SHL',
    '>>': 'SHR',

    '&': 'AND',
    '|': 'OR',
    '^': 'XOR',

    '&&': 'ANDL',
    '||': 'ORL',

    '==': 'EQ',
    '!=': 'NEQ',
    '<': 'LT',
    '<=': 'LTE',
    '>': 'GT',
    '>=': 'GTE',
  }

  if (op in simpleOps) {
    gen(simpleOps[op])
  } else {
    console.log('Not simple op:', op)
  }
}

const precedence = {
  operator: [
    ['**'],
    ['*', '/', '%', '_'],
    ['+', '-'],
    ['<<', '>>'],
    ['<', '<=', '>', '>='],
    ['==', '!='],
    ['&'],
    ['^'],
    ['|'],
    ['&&'],
    ['^^'],
    ['||']
  ]
}
function findPrecedence(op, arr) {
  for (let i=0; i < arr.length; i++) {
    if (arr[i].indexOf(op) >= 0) {
      return i
    }
  }
  throw Error(`Invalid operator "${op}"`)
}
function flattenBsp(arr) {
  if (!Array.isArray(arr)) {
    arr = [arr]
  }
  let result = []
  for (let i=0; i < arr.length; i++) {
    let node = arr[i]
    if (node.left && node.left.length > 0) {
      result = result.concat(flattenBsp(node.left))
    }

    if (node.right && node.right.length > 0) {
      result = result.concat(flattenBsp(node.right))
    }

    result.push({type: node.type, value: node.value})
  }

  return result
}
function bspOps(ops) {
  if (ops.length < 2) {
    return ops
  }

  let maxPrecedence = -1
  let pivotIndex = -1
  for (let i=0; i < ops.length; i++) {
    let item = ops[i]
    if (!('p' in item) && item.type in precedence) {
      item.p = findPrecedence(item.value, precedence[item.type])
    }

    if (item.p > maxPrecedence) {
      pivotIndex = i
      maxPrecedence = item.p
    }
  }

  let result = ops[pivotIndex]
  if (pivotIndex >= 0) {
    result.left = bspOps(ops.slice(0, pivotIndex))
    result.right = bspOps(ops.slice(pivotIndex + 1))
  }

  return flattenBsp(result)
}

const reservedIdentifiers = {
  caller: true, owner: true, height: true, txid: true, callingnamespace: true, currentnamespace: true,
  return: true, search: true, require: true, const: true, nil: true, timestamp: true
}
let firstFuncdefParsed = false
let currentFuncContext = null
let currentLine = 0

const pushIdent = (type, value) => {
  if (type === 'number') {
    return `PUSHI ${value}`
  } else if (type === 'string') {
    return `PUSHS ${value}`
  } else if (type === 'object') {
    throw new Error('Bad identifier generation path (this is a tilc library error, not your fault)')
  } else if (value in reservedIdentifiers) {
    return `PUSHV ${value}`
  } else if (value in currentFuncContext.regs) {
    return `PUSHR ${value}`
  } else if (value in currentFuncContext.consts) {
    return `PUSHCI ${value}`
  } else {
    return `PUSHPR ${value}`
  }
}

const funcCall = (gen, callMember) => {
  const path = $(callMember, 'path')
  const identifier = $(callMember, 'identifier')
  const params = $(callMember, 'params', true)

  let specialVal
  let specialValType
  if (identifier === 'geti' || identifier === 'verify' || identifier === 'get') {
    // These two functions pass the last parameter as a special value
    let sv = params.children.pop()
    if (sv.type === 'basevalue') {
      specialValType = sv.children[0].type
    } else {
      specialValType = sv.type
    }
    specialVal = sv.text
  }

  if (params) {
    for (let i=0; i < params.children.length; i++) {
      let item = params.children[i]
      if (item.type === 'basevalue') {
        item = item.children[0]
        if (item.type === 'call_member') {
          funcCall(gen, item)
        } else if (item.type === 'object') {
          genObject(item, gen)
        } else {
          gen(pushIdent(item.type, item.text))
        }
      } else {
        gen(pushIdent(item.type, item.text))
      }
    }
  }

  if (path) {
    gen(`ECALL ${path}.${identifier}`)
  } else {
    if (identifier === 'del') {
      gen(`DEL`)
    } else if (identifier === 'put') {
      gen(`PUT`)
    } else if (identifier === 'geti') {
      gen(`GETI ${specialVal}`)
    } else if (identifier === 'get') {
      if (specialValType === 'identifier') {
        gen(`PUSHR ${specialVal}`)
      } else if (specialValType === 'string') {
        gen(`PUSHS ${specialVal}`)
      } else {
        gen(`PUSHI ${specialVal}`)
      }
      gen(`GET`)
    } else if (identifier === 'verify') {
      gen(`VERIFY ${specialVal}`)
    } else if (identifier === 'sha256') {
      gen(`SHA256`)
    } else if (identifier === 'ripemd160') {
      gen(`RIPEMD160`)
    } else if (identifier === 'base58') {
      gen(`BASE58`)
    } else if (identifier === 'logp') {
      gen(`LOGP`)
    } else {
      gen(`CALL ${identifier}`)
    }
  }
}

const getSetObj = (path, gen, isSet) => {
  let [base, ...spl] = path.split('.')
  gen(pushIdent('', base))
  let first = true
  while (item = spl.shift()) {
    if (isSet && !first) {
      gen(`SINK`)
    }
    gen(`PUSHS "${item}"`)
    if (!((spl.length === 0) && isSet)) {
      gen(`GETO`)
    }
    first = false
  }

  if (!isSet) {
    gen(`SINK`)
  }
}

const genOps = (ops, gen) => {
  ops = bspOps(ops)
  for (let i=0; i < ops.length; i++) {
    let item = ops[i]

    if (item.type === 'operator') {
      operatorToAsm(item.value, gen)
    } else if (item.type === 'identifier' || item.type === 'number' || item.type === 'string') {
      gen(pushIdent(item.type, item.value))
    } else if (item.type === 'object_ref') {
      getSetObj(item.value, gen, false)
    } else if (item.type === 'null') {
      gen('PUSHV nil')
    } else {
      throw Error(`Unknown item type in operation "${item.type}"`)
    }
  }
}

const genPureObject = (evalNode) => {
  let ob = {}
  let props = evalNode.children.map(x => x.children[0])
  for (let i=0; i < props.length; i++) {
    const item = props[i]
    const itemIdent = $(item, 'identifier')
    const itemValueValue = $(item, 'value', true)
    const itemValueIdentifier = $(item, 'identifier', false, 1)

    if (itemValueValue) {
      if (/^-?[0-9]+$/.test(itemValueValue.text)) {
        ob[itemIdent] = parseInt(itemValueValue.text)
      } else {
        ob[itemIdent] = itemValueValue.text
      }
    }
  }
  return ob
}

const genObject = (evalNode, gen) => {
  if (evalNode.children.filter(x => x.children[0].type !== 'value_member').length === 0) {
    // It's a pure object
    // TODO change this to use the above genPureObject call
    gen(`NEW`)
    let props = evalNode.children.map(x => x.children[0])
    for (let i=0; i < props.length; i++) {
      const item = props[i]
      const itemIdent = $(item, 'identifier')
      const itemValueValue = $(item, 'value', true)
      const itemValueIdentifier = $(item, 'identifier', false, 1)

      gen(`PUSHS "${itemIdent}"`)
      if (itemValueValue) {
        const valType = itemValueValue.children[0].type
        gen(pushIdent(valType, itemValueValue.text))
      } else if (itemValueIdentifier) {
        gen(pushIdent('identifier', itemValueIdentifier))
      }
      gen(`SETO`)
    }
  } else {
    return decoders.object(evalNode)
  }
}

const decoders = {
  namespace: (node, gen) => {
    let op = $(node, 'namespace_op')
    let path = $(node, 'path')

    if (op === 'define') {
      gen(`NAMESPACE ${path}`)
      return {tail: [$(node, 'object', true)]}
    } else if (op === 'using') {
      gen(`REQUIRE ${path}`)
      currentFuncContext = { name: '_root_', regs: {}, consts: {} }
      return {tail: [$(node, 'object', true)]}
    }
  },

  object: (node) => ({head: node.children}),
  member: (node) => ({head: node.children}),
  value_member: (node, gen) => {
    let identifier = $(node, 'identifier')
    let path = $(node, 'path')

    if (identifier) {
      if (identifier === 'meta') {
        let value = $(node, 'value/object', true)
        let stringified

        for (let i=0; i < value.children.length; i++) {
          let child = value.children[i]
          let raw = $(child, 'value_member/value', true).children[0]

          if (raw.type === 'object') {
            raw = genPureObject(raw)
            stringified = JSON.stringify(JSON.stringify(raw))
          } else {
            raw = raw.text
            let parsed = JSON.parse(raw)
            stringified = JSON.stringify(parsed)
          }
          gen(`META "${$(child, 'value_member/identifier')}" ${stringified}`)
        }
      }
    } else if (path) {
      console.trace('/path = value not implemented!')
    }
  },

  funcdef: (node, gen) => {
    const qual = $(node, 'func_qualification')

    if (qual === 'entry' || qual === 'owner') {
      const name = $(node, 'identifier')
      gen(`ENTRY "${name}" ${name}_label`)
    }

    if (qual === 'deploy') {
      const name = $(node, 'identifier')
      gen(`DEPLOY ${name}_label`)
    }

    node.type = 'funcdef_declared'
    let result = [node]

    if (!firstFuncdefParsed) {
      firstFuncdefParsed = true
      result = [{type: 'end_preamble'}].concat(result)
    }
    return {tail: result}
  },

  end_preamble: (node, gen) => {
    gen('END # end_preamble')
  },

  funcdef_declared: (node, gen) => {
    const name = $(node, 'identifier')
    const params = $(node, 'func_params', true)
    const qualification = $(node, 'func_qualification')
    if (qualification === 'func' || qualification === 'enum') {
      gen(`:${name}`)
    } else {
      gen(`:${name}_label`)
    }

    if (qualification === 'owner') {
      gen(`OWNER`)
    } else if (qualification === 'enum') {
      if (params.children.length !== 2) {
        throw new Error('Enum functions must have two parameters for the key and value being enumerated')
      }
    }
    currentFuncContext = { name, regs: {}, consts: {} }
    if (params) {
      for (let i=params.children.length-1; i >= 0; i--) {
        let reg = params.children[i].text
        if (reg in reservedIdentifiers) {
          throw new Error(`Trying to used reserved identifier "${reg}" as parameter on function "${name}"`)
        }

        gen(`POP ${reg}`)
        currentFuncContext.regs[reg] = reg
      }
    }

    return {head: node.children.filter(x => x.type === 'member').concat({type: 'null_ret'})}
  },

  null_ret: (node, gen) => {
    if (currentFuncContext && !currentFuncContext.returned) {
      gen('RET 0')
      currentFuncContext = null
    }
  },

  require_member: (node, gen) => {
    gen(`REQUIRE ${$(node, 'path')}`)
  },

  declaration_member: (node, gen) => {
    if (!currentFuncContext) {
      throw new Error('Declaration outside of a function context is not valid')
    }

    const qual = $(node, 'declaration_qualification')
    let ident = $(node, 'identifier')
    const identParams = $(node, 'identifier_list', true)
    const declValue = $(node, 'declared_value', true)
    const objectAssignRef = $(node, 'object_ref')

    if (objectAssignRef) {
      getSetObj(objectAssignRef, gen, true)
    }

    if (!qual) {
      if (declValue.children[0].type === 'basevalue') {
        // it's a basic value
        const evalNode = declValue.children[0].children[0]
        const { type, text } = evalNode

        if (type === 'number' || type === 'string') {
          gen(pushIdent(type, text))
        } else if (type === 'object') {
          genObject(evalNode, gen)
        } else if (type === 'op') {
          genOps(declValue.children[0].children[0].children.map(x => ({type: x.type, value: x.text})), gen)
        } else if (type === 'object_ref') {
          getSetObj(text, gen, false)
        } else if (type === 'call_member') {
          const callMember = declValue.children[0].children[0]
          funcCall(gen, callMember)
        }
      } else if (declValue.children[0].type === 'identifier') {
        // It's a registry, special value or constant
        const { type, text } = declValue.children[0]
        gen(pushIdent(type, text))
      }
    } else if (qual === 'const') {
      const { type, text } = declValue.children[0].children[0]
      if (type === 'number') {
        gen(`CONSTI ${ident} ${text}`)
        currentFuncContext.consts[ident] = text
        ident = null
      } else {
        throw new Error(`Constants of type ${type} not supported`)
      }
    } else {
      throw new Error(`Declaration qualifier ${qual} not recognized`)
    }

    if (ident) {
      gen(`POP ${ident}`)
      currentFuncContext.regs[ident] = true
    } else if (identParams) {
      for (let i=identParams.children.length - 1; i >= 0; i--) {
        let item = identParams.children[i]

        if (item.type === 'identifier') {
          gen(`POP ${item.text}`)
        } else {
          throw new Error('Left side must be only identifiers in an assignation')
        }
      }
    } else if (objectAssignRef) {
      gen(`SETO`)
    }
  },

  call_member: (node, gen) => {
    funcCall(gen, node)
  },

  if_member: (node, gen) => {
    let head = []
    const genLabel = (concept) => `${currentFuncContext.name}_ifjmp_${currentLine}_${concept}`

    const endLabel = genLabel('end')
    const jumpBlocks = node.children.filter(x => x.type === 'if_block').map((x, idx) => {
      return {
        type: 'labeled_block',
        label: genLabel(idx),
        endLabel,
        content: $(x, 'object', true)
      }
    })

    const conditions = node.children.filter(x => x.type === 'if_block').map(x => $(x, 'if_condition', true))
    for (let i=0; i < conditions.length; i++) {
      const jmpLabel = genLabel(i)
      const op = $(conditions[i], 'op', true)
      const opMap = op.children.map(x => ({type: x.type, value: x.text}))
      genOps(opMap, gen)
      gen(`JCND ${genLabel(i)}`)
    }

    const elseBlock = $(node, 'else_block', true)

    if (elseBlock) {
      head.push({
        type: 'labeled_block',
        //label: genLabel('else'),
        label: null,
        endLabel: endLabel,
        content: $(elseBlock, 'object', true)
      })
    } else {
      head.push({ type: 'code', value: `JMP ${endLabel}` })
    }

    head = head.concat(jumpBlocks)

    head.push({ type: 'if_end_block', label: endLabel })
    return { head }
  },

  code: (node, gen) => {
    gen(node.value)
  },

  if_end_block: (node, gen) => {
    gen(`:${node.label}`, true)
  },

  labeled_block: (node, gen) => {
    if (node.label) {
      gen(`:${node.label}`, true)
    }
    return { head: node.content.children.concat([{ type: 'code', value: `JMP ${node.endLabel}` }]) }
  },

  enum_member: (node, gen) => {
    const ident = $(node, "identifier")
    const regex = $(node, "string")
    const order = {"+": "asc", "-": "desc"}[$(node, "enum_order")]
    const field = $(node, "identifier", false, 1)

    gen(`PUSHS ${regex}`)
    gen(`ENUMORD ${ident} "${field}" "${order}"`)
  },

  return_member: (node, gen) => {
    const returnValues = $(node, 'basevalue_list', true)

    if (returnValues) {
      const values = returnValues.children.map(x => {
        let child = x.children[0]
        if (child.type === 'basevalue') {
          child = child.children[0]
        }
        return child
      })

      for (let i=0; i < values.length; i++) {
        let item = values[i]
        if (item.type === 'call_member') {
          funcCall(gen, item)
          const funcParams = $(item, "params", true)

          if (funcParams) {
            gen(`POP _ret_tmp_`)
            for (let i=0; i < funcParams.children.length; i++) {
              gen(`POP _`)
            }
            gen(`PUSHR _ret_tmp_`)
          }
        } else {
          gen(pushIdent(item.type, item.text))
        }
      }
      gen(`RET ${values.length}`)
    } else {
      gen(`RET 0`)
      currentFuncContext.returned = true
    }
  }
}

function decodeAst(node, gen) {
  let tail = [node]

  if (typeof(gen) === "undefined") {
    gen = (line, noIndent) => {
      if (!noIndent && currentFuncContext !== null) {
        line = '  ' + line
      }
      console.log(line)
    }
  }

  let l = 1
  while (step = tail.shift()) {
    currentLine = l
    if (step.type in decoders) {
      let result
      try {
        result = decoders[step.type](step, gen)
      } catch(e) {
        //throw new Error(`At line ${l}: ${e.message}`)
        console.log(`At op ${l}:`, e)
      }

      if (result) {
        if (result.head) {
          tail = result.head.concat(tail)
        }

        if (result.tail) {
          tail = tail.concat(result.tail)
        }
      }
    } else {
      console.log(`Unknown AST type ${step.type} on node ${node.type}`)
    }
    l++
  }
}

function test() {
  const fname = './test/data/fungible_token.til'
  const fs = require('fs')
  const code = fs.readFileSync(fname, 'utf8')
  const mustache = require('mustache')
  const testDefines = {
    rate_precision: 1000000,
    bottom: '/usd',
    top: '/btc'
  }
  const replacedCode = mustache.render(code, testDefines)
  console.log(replacedCode)
  const ast = parse(replacedCode)
  if (ast) {
    //printAst(ast, 0, 0)
    decodeAst(ast)
    //fs.writeFileSync('output.json', JSON.stringify(program))
  } else {
    console.log('Parse error')
  }
}

if (require.main === module) {
  test()
} else {
  module.exports = (code) => {
    firstFuncdefParsed = false
    let asm = ''
    const gen = (line) => {
      asm += line + '\n'
    }
    const ast = parse(code)
    decodeAst(ast, gen)
    return asm
  }
}

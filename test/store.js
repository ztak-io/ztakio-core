const store = {
  values: {},
  newValues: null,

  get: (key) => {
    if (store.verbose) {
      console.log('GET:', key, store.values)
    }
    let r

    if (key in store.newValues) {
      r = store.newValues[key]
    } else {
      r = store.values[key]
    }

    if (typeof(r) === 'object') {
      if ('_t' in r && '_v' in r) {
        /*if (r._t === 'uint64le') {
          r = Buffer.from(r._v, 'hex').readBigUInt64LE()*/
        if (r._t === 'uint64') {
            r = BigInt(r._v)
        } else if (r._t === 'buffer') {
          r = Buffer.from(r._v, 'hex')
        }
      }
    }

    return r
  },
  put: (key, value) => {
    if (typeof(value) === 'bigint') {
      /*let b = Buffer.alloc(8)
      b.writeBigUInt64LE(value)
      value = {_t: 'uint64le', _v: b.toString('hex')}*/
      value = {_t: 'uint64', _v: value.toString()}
    } else if (Buffer.isBuffer(value)) {
      value = {_t: 'buffer', _v: value.toString('hex')}
    }

    if (store.newValues !== null) {
      store.newValues[key] = value
    } else {
      store.values[key] = value
    }
  },
  del: (key) => {
    if (key in store.newValues) {
      delete store.newValues[key]
    }

    if (key in store.values) {
      delete store.values[key]
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
  },

  iterator: function* (opts) {
    for (let x in store.values) {
      let haveToYield = false
      if ('gt' in opts && x.startsWith(opts.gt) && opts.gt < x) {
        haveToYield = true
      }

      if (haveToYield) {
        yield {key: x, value: store.get(x)}
      }
    }
  }
}

module.exports = store

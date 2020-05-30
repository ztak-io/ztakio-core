function UInt8Buf(v) {
  const b = Buffer.alloc(1)
  b.writeUInt8(v)
  return b
}

function UInt16Buf(v) {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(v)
  return b
}

function Int64Buf(v) {
  const b = Buffer.alloc(8)
  b.writeBigInt64LE(v)
  return b
}

function UInt64Buf(v) {
  const b = Buffer.alloc(8)
  b.writeBigUInt64LE(v)
  return b
}

const LineOfCodeBuf = UInt16Buf

function StringBuf(s) {
  const sbuf = Buffer.from(s, 'utf8')
  const sz = UInt16Buf(sbuf.length)
  return Buffer.concat([sz, sbuf])
}

module.exports = {
  UInt8Buf, UInt16Buf, Int64Buf, UInt64Buf, LineOfCodeBuf, StringBuf
}

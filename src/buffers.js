const JSBI = require('jsbi')

// From https://coolaj86.com/articles/convert-decimal-to-hex-with-js-bigints/ //
function bnToHex(bn) {
  var pos = true;
  bn = JSBI.BigInt(bn);

  if (bn < 0) {
    pos = false;
    bn = bitnot(bn);
  }

  var base = 16;
  var hex = bn.toString(base);
  if (hex.length % 2) {
    hex = '0' + hex;
  }

  var highbyte = parseInt(hex.slice(0, 2), 16);
  var highbit = (0x80 & highbyte);

  if (pos && highbit) {
    hex = '00' + hex;
  }

  return hex;
}

function bitnot(bn) {
  bn = -bn;
  var bin = (bn).toString(2)
  var prefix = '';
  while (bin.length % 8) {
    bin = '0' + bin;
  }
  if ('1' === bin[0] && -1 !== bin.slice(1).indexOf('1')) {
    prefix = '11111111';
  }
  bin = bin.split('').map(function (i) {
    return '0' === i ? '1' : '0';
  }).join('');
  return JSBI.BigInt('0b' + prefix + bin) + JSBI.BigInt(1);
}

function hexToBn(hex) {
  if (hex.length % 2) {
    hex = '0' + hex;
  }

  var highbyte = parseInt(hex.slice(0, 2), 16)
  var bn = JSBI.BigInt('0x' + hex);

  if (0x80 & highbyte) {
    bn = JSBI.BigInt('0b' + bn.toString(2).split('').map(function (i) {
      return '0' === i ? 1 : 0
    }).join('')) + JSBI.BigInt(1);
    bn = -bn;
  }

  return bn;
}
// End of coolaj86 snippets

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
  const data = BigInt2Buf(v)
  const pre = Buffer.alloc(2)
  pre.writeUInt8(0x51, 0)
  pre.writeUInt8(data.length, 1)
  return Buffer.concat([pre, data])

  /*const b = Buffer.alloc(8) // Old, incompatible with react
  b.writeBigInt64LE(v)
  return b*/
}

function UInt64Buf(v) {
  const data = BigInt2Buf(v)
  const pre = Buffer.alloc(2)
  pre.writeUInt8(0x52, 0)
  pre.writeUInt8(data.length, 1)
  return Buffer.concat([pre, data])

  /*const b = Buffer.alloc(8)
  b.writeBigUInt64LE(v)
  return b*/
}

function BigInt2Buf(v) {
  return Buffer.from(bnToHex(v), 'hex')
}

function Buf2BigInt(b) {
  return hexToBn(b.toString('hex'))
}

const LineOfCodeBuf = UInt16Buf

function StringBuf(s) {
  const sbuf = Buffer.from(s, 'utf8')
  const sz = UInt16Buf(sbuf.length)
  return Buffer.concat([sz, sbuf])
}

module.exports = {
  UInt8Buf, UInt16Buf, Int64Buf, UInt64Buf, LineOfCodeBuf, StringBuf,
  BigInt2Buf, Buf2BigInt
}

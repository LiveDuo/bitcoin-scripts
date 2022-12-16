
const crypto = require('crypto')

const base58 = require('bs58')
const secp256k1 = require('secp256k1')

const OPS = { OP_DUP: 0x76, OP_EQUALVERIFY: 0x88, OP_HASH160: 0xa9, OP_CHECKSIG: 0xac, OP_PUSHDATA1: 0x4c, }

const sha256 = (data) => crypto.createHash('sha256').update(data).digest()
const ripemd160 = (data) => crypto.createHash('ripemd160').update(data).digest()

const padStart = (data, length) => reverse(Number(data).toString(16).padStart(length, '0'))
const reverse = (d) => d.match(/../g).reverse().join('')

const withVarEncoding = (b) => Buffer.concat([Buffer.from(padStart(b.length, 2), 'hex'), b]) // simplified
const base58Check = (data) => Buffer.from(base58.decode(data).slice(0, -4)).subarray(1)
const bip66Encode = (r, s) => Buffer.concat([Buffer.from([0x30, r.length + s.length + 4, 0x02, r.length]), r, Buffer.from([0x02, s.length]), s])
const toDER = (x) => { const i = x.indexOf('0', 0, 'hex'); const slice = x.slice(i); return (slice[0] & 0x80) ? Buffer.concat([Buffer.alloc(1), slice]) : slice }

const compileScript = (buffer) => Buffer.concat(buffer.map(c => Buffer.isBuffer(c) ? Buffer.concat([Buffer.from([c.length]), c]) : Buffer.from([c])))
const p2pkhScript = (pubKey) => compileScript([OPS.OP_DUP, OPS.OP_HASH160, pubKey, OPS.OP_EQUALVERIFY, OPS.OP_CHECKSIG])

const privKey = '-- ENTER PRIVATE KEY --'
const addressSendTo = '-- ENTER ADDRESS KEY --'

const prevTxHash = '-- ENTER TX ID --'
const prevTxIndex = '-- ENTER TX INDEX --'
const prevTxAmount = '-- ENTER TX AMOUNT --'

; (async () => {

	// version
	const version = Buffer.from(padStart(2, 8), 'hex')

	// inputs
	const pubKey = secp256k1.publicKeyCreate(Buffer.from(privKey, 'hex'))
	const script = p2pkhScript(ripemd160(sha256(pubKey)))
	const inputsArray = ['01', reverse(prevTxHash), padStart(prevTxIndex, 8), withVarEncoding(script).toString('hex'), 'ffffffff']
	const inputs = Buffer.from(inputsArray.join(''), 'hex')

	// outputs
	const outputsArray = ['02', padStart(1000, 16), withVarEncoding(p2pkhScript(base58Check(addressSendTo))).toString('hex'), padStart(prevTxAmount - 1000 - 500, 16), withVarEncoding(p2pkhScript(ripemd160(sha256(pubKey)))).toString('hex')]
	const outputs = Buffer.from(outputsArray.join(''), 'hex')

	// locktime
	const lockTime = Buffer.from(padStart(0, 8), 'hex')

	// signed inputs
	const txType = Buffer.from(padStart(1, 8), 'hex')
	const txHexBefore = Buffer.concat([version, inputs, outputs, lockTime, txType])
	const txHash = sha256(sha256(txHexBefore))
	const txSignature = secp256k1.sign(txHash, Buffer.from(privKey, 'hex')).signature
	const sigEncoded = bip66Encode(toDER(txSignature.slice(0, 32)), toDER(txSignature.slice(32, 64)))
	const scriptSig = compileScript([Buffer.concat([sigEncoded, Buffer.from([0x01])]), pubKey])
	const inputsSigned = Buffer.from(inputsArray.map((o, i) => i === 3 ? withVarEncoding(scriptSig).toString('hex') : o).join(''), 'hex')

	// tx hex
	const txHex = Buffer.concat([version, inputsSigned, outputs, lockTime]).toString('hex')
	console.log('Tx Hex:', txHex)
	console.log()

	// tx id
	const txId = reverse(sha256(sha256(Buffer.from(txHex, 'hex'))).toString('hex'))
	console.log('Tx Id:', txId)
	console.log()

})()


const net = require('net')
const crypto = require('crypto')
const dns = require('dns/promises')

const client = new net.Socket()

const currentNetwork = 'testnet'

const dnsSeeds = {
	mainnet: ['seed.bitcoin.sipa.be', 'dnsseed.bluematt.me', 'dnsseed.bitcoin.dashjr.org', 'seed.bitcoinstats.com',
		'seed.bitnodes.io', 'bitseed.xf2.org', 'seed.bitcoin.jonasschnelli.ch'],
	testnet: ['testnet-seed.bitcoin.jonasschnelli.ch', 'seed.tbtc.petertodd.org',
		'testnet-seed.bluematt.me', 'testnet-seed.bitcoin.schildbach.de']
}

const service_bitfield = { 0: 'NETWORK', 1: 'GETUTXO', 2: 'BLOOM', 3: 'WITNESS', 4: 'XTHIN', 6: 'COMPACT_FILTERS', 10: 'NETWORK_LIMITED' }

// https://en.bitcoin.it/wiki/Protocol_documentation
const networks = {
	regtest: { magic: 'd9b4bef9', port: 18444 },
	testnet: { magic: '0709110b', port: 18333, dnsSeeds: dnsSeeds.testnet },
	mainnet: { magic: 'dab5bffa', port: 8333, dnsSeeds: dnsSeeds.mainnet }
}

const reverse = (d) => Buffer.from(d.toString('hex'), 'hex').reverse()
const sha256 = (data) => crypto.createHash('sha256').update(data).digest()
const getTxFromHex = (txHex) => reverse(sha256(sha256(Buffer.from(txHex, 'hex'))).toString('hex'))
const splitBuffer = (b, n) => Array.from({ length: b.length / n }).map((_, i) => b.subarray(n * i, n * (i + 1)))

const varUintSize = (buffer) => {
	if (buffer.subarray(0, 1) === 0xff) return 9
	else if (buffer.subarray(0, 1) === 0xfe) return 5
	else if (buffer.subarray(0, 1) === 0xfd) return 3
	else return 1
}

const getVersionPayload = () => {
	const version = reverse(Buffer.from(Number(31900).toString(16).padStart(8, '0'), 'hex'))
	const services = Buffer.from('0'.repeat(16), 'hex')
	const timestamp = Buffer.from('0'.repeat(16), 'hex')
	const addrRecv = Buffer.from('0'.repeat(52), 'hex')
	const addrFrom = Buffer.from('0'.repeat(52), 'hex')
	const nonce = crypto.randomBytes(8)
	const userAgent = Buffer.from('\x0f/Satoshi:0.7.2', 'utf-8')
	const startHeight = Buffer.from('0'.repeat(8), 'hex')
	const relay = Buffer.from('0'.repeat(2), 'hex')
	const payload = Buffer.concat([version, services, timestamp, addrRecv, addrFrom, nonce, userAgent, startHeight, relay])
	return payload
}

const getMessage = (type, payload) => {
	const magic = reverse(Buffer.from(networks[currentNetwork].magic, 'hex'))
	const command = Buffer.from(Buffer.from(type, 'utf-8').toString('hex').padEnd(24, '0'), 'hex')
	const length = Buffer.from(Number(payload.length).toString(16).padEnd(8, '0'), 'hex')
	const checksum = sha256(sha256(payload)).subarray(0, 4)
	return Buffer.concat([magic, command, length, checksum, payload])
}

const handleHeader = async (index, data) => {
	const magic = reverse(data.subarray(index, index + 4)).toString('hex')
	const command = data.subarray(index + 4, index + 16).toString()
	const length = parseInt(reverse(data.subarray(index + 16, index + 20)).toString('hex'), 16)
	const checksum = data.subarray(index + 20, index + 24)
	const payload = data.subarray(index + 24, index + 24 + length)
	return { magic, length, checksum, payload, command }
}

const handleMessage = async (command, payload, params) => {

	if (command?.startsWith('version')) {
		const version = parseInt(payload.subarray(0, 4).reverse().toString('hex'), 16)
		const timestamp = parseInt(payload.subarray(12, 20).reverse().toString('hex'), 16)
		const bitfield = parseInt(payload.subarray(4, 12).reverse().toString('hex'), 16).toString(2)
		const services = [...bitfield].reverse().map((b, i) => b === '1' ? service_bitfield[i] : false).filter(b => !!b)
		console.log(version, services, new Date(timestamp * 1000))

		client.write(getMessage('verack', Buffer.alloc(0)))
	} else if (command?.startsWith('ping')) {
		client.write(getMessage('pong', payload))
	} else if (command?.startsWith('verack')) {

		await new Promise(r => setTimeout(r, 1000))

		const txId = getTxFromHex(params.txHex)

		const count = reverse(Buffer.from('01', 'hex'))
		const type = reverse(Buffer.from('1'.padStart(8, '0'), 'hex'))
		const hash = reverse(txId)
		const txPayload = Buffer.concat([count, type, hash])

		client.write(getMessage('inv', txPayload))
		console.log('Sent:', 'Inv')

	} else if (command?.startsWith('getdata')) {
		const array = splitBuffer(payload.subarray(varUintSize(payload)), 36)
		const inv = array.map(b => ({ type: parseInt(reverse(b.subarray(0, 4)).toString('hex')), hash: reverse(b.subarray(4)).toString('hex') }))
		console.log(inv.map(i => `${i.type === 1 ? 'tx' : 'block'} ${i.hash}`))

		client.write(getMessage('tx', Buffer.from(params.txHex, 'hex')))

		const txId = getTxFromHex(params.txHex)
		console.log('Sent:', 'Tx', `https://blockstream.info/testnet/tx/${txId}`)

	} else if (command?.startsWith('inv')) {
		const array = splitBuffer(payload.subarray(varUintSize(payload)), 36)
		const inv = array.map(b => ({ type: parseInt(reverse(b.subarray(0, 4)).toString('hex')), hash: reverse(b.subarray(4)).toString('hex') }))
		console.log(inv.map(i => `${i.type === 1 ? 'tx' : 'block'} ${i.hash}`))

		client.write(getMessage('getdata', payload))

		console.log('Sent:', 'Get Data')
	}
}

const startAndBroadcast = async (txHex) => {

	// resolve the ip addresses from the seed dns list
	const addresses = await dns.resolve(networks[currentNetwork].dnsSeeds[1]).catch(() => null)
	console.log('Number of Peers:', addresses.length)
	if (!addresses) return

	// connect to peer
	const peer = { ip: addresses[1], port: networks[currentNetwork].port }
	client.connect(peer.port, peer.ip, () => {
		console.log(`Sending message to peer: ${peer.ip}`)
		client.write(getMessage('version', getVersionPayload()))
	})

	let savedData = Buffer.alloc(0)

	// handle response
	client.on('data', async (data) => {

		let index = 0

		const newData = Buffer.concat([savedData, data])
		const magic = reverse(newData.subarray(0, 4)).toString('hex')
		const length = parseInt(reverse(newData.subarray(16, 20)).toString('hex'), 16)

		if (magic === networks[currentNetwork].magic && newData.length > length) {

			while (index < newData.length) {
				const { length, command, checksum, payload } = await handleHeader(index, newData)
				if (magic !== networks[currentNetwork].magic) return
				if (!checksum.equals(sha256(sha256(payload)).subarray(0, 4))) return
				console.log('Received:', command)

				await handleMessage(command, payload, { txHex })
				index += 24 + length
			}
		}

		savedData = newData.subarray(index)
	})
}

const txHex = '-- ENTER TX HEX --'

; (async () => {

	await startAndBroadcast(txHex)

})()

const net = require('net')
const crypto = require('crypto')

const client = new net.Socket()

const currentNetwork = 'testnet'

const networks = {
	regtest: { magic: 'd9b4bef9', port: 18444 },
	testnet: { magic: '0709110b', port: 18333, dnsSeeds: dnsSeeds.testnet },
	mainnet: { magic: 'dab5bffa', port: 8333, dnsSeeds: dnsSeeds.mainnet }
}

const reverse = (d) => Buffer.from(d.toString('hex'), 'hex').reverse()
const sha256 = (data) => crypto.createHash('sha256').update(data).digest()

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

const handleMessage = async (command, payload) => {
	if (command?.startsWith('version')) {
		console.log('Sent: verack')
		client.write(getMessage('verack', Buffer.alloc(0)))
	} else if (command?.startsWith('ping')) {
		console.log('Sent: pong')
		client.write(getMessage('pong', payload))
	}
}

const nodeIpAddress = '-- ENTER NODE IP --'

; (async () => {

	// connect to peer
	const peer = { ip: nodeIpAddress, port: networks[currentNetwork].port }
	client.connect(peer.port, peer.ip, () => {
		console.log(`Connected to ${peer.ip}`)
		client.write(getMessage('version', getVersionPayload()))
	})

	// handle response
	let savedData = Buffer.alloc(0)
	client.on('data', async (data) => {

		let index = 0

		// process data chunk
		const newData = Buffer.concat([savedData, data])
		while (index < newData.length) {
			const { length, command, payload } = await handleHeader(index, newData)
			console.log('Received:', command)

			await handleMessage(command, payload)
			index += 24 + length
		}

		// store pending data
		savedData = newData.subarray(index)

	})

})()


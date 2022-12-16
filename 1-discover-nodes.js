const dns = require('dns/promises')
const net = require('net')
const client = new net.Socket()

const currentNetwork = 'testnet'

const dnsSeeds = {
	mainnet: ['seed.bitcoin.sipa.be', 'dnsseed.bluematt.me', 'dnsseed.bitcoin.dashjr.org', 'seed.bitcoinstats.com', 'seed.bitnodes.io', 'bitseed.xf2.org'],
	testnet: ['testnet-seed.bitcoin.jonasschnelli.ch', 'seed.tbtc.petertodd.org', 'testnet-seed.bluematt.me', 'testnet-seed.bitcoin.schildbach.de']
}

const networks = {
	regtest: { port: 18444 },
	testnet: { port: 18333, dnsSeeds: dnsSeeds.testnet },
	mainnet: { port: 8333, dnsSeeds: dnsSeeds.mainnet }
}

; (async () => {

	// resolve nodes from seeds
	const dnsServers = dnsSeeds[currentNetwork]
	const dnsServer = dnsServers[~~(Math.random() * dnsServers.length)]
	const addresses = await dns.resolve(dnsServer).catch(() => null)
	console.log(`Discovered ${addresses.length} nodes`)

	// connect to peer
	const address = addresses[~~(Math.random() * addresses.length)]
	const peer = { ip: address, port: networks[currentNetwork].port }
	client.connect(peer.port, peer.ip, () => {
		console.log(`Connected to ${address}`)
	})

})()

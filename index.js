const pino = require('pino')
const qrcode = require('qrcode-terminal')
const fs = require('fs')
const { Boom } = require('@hapi/boom')
const {
   default: makeWASocket,
   delay,
   makeInMemoryStore,
   useMultiFileAuthState,
   makeCacheableSignalKeyStore,
   DisconnectReason,
   msgRetryCounterMap
} = require('baileys')
const filename = extension => {
   return `${Math.floor(Math.random() * 10000)}.${extension}`
}
const sessionFile = 'session.json' // filename('json')
const logger = pino().child({
   level: 'silent'
})

const connect = async () => {
   const { state } = await useMultiFileAuthState('session', logger)
   const client = makeWASocket({
      logger: pino({
          level: 'silent'
      }),
      printQRInTerminal: true,
      auth: {
         creds: state.creds,
         /** caching makes the store faster to send/recv messages */
         keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      version: [2, 2234, 13],
      msgRetryCounterMap,
      generateHighQualityLinkPreview: true,
      getMessage: async (key) => {
         return await store.loadMessage(client.decodeJid(key.remoteJid), key.id)
      }
   })
   
   client.store = makeInMemoryStore({ logger })
   client.store.bind(client.ev)

   client.ev.on('connection.update', async up => {
      const { lastDisconnect, connection } = up
      if (connection === 'open') {
         console.log('Connected!')
         fs.writeFileSync(sessionFile, JSON.stringify(state, null, 3), 'utf-8')
         await delay(1000 * 5)
         client.sendMessage(client.user.id, {
            document: {
               url: `./${sessionFile}`
            },
            fileName: 'session.json',
            mimetype: 'application/json'
         }).then(async () => {
            fs.unlinkSync(`./${sessionFile}`)
            await delay(1000 * 10)
            process.exit(0)
         })
      }

      if (connection === 'close') {
         let reason = new Boom(lastDisconnect.error).output.statusCode
         if (reason === DisconnectReason.loggedOut) {
            console.log('Device logout')
            client.logout()
         } else if (reason === DisconnectReason.connectionClosed) {
            console.log('Connection closed, wait to reconnecting')
            connect()
         } else if (reason === DisconnectReason.restartRequired) {
            connect()
         } else if (reason === DisconnectReason.timedOut) {
            console.log('Connection Timeout')
            connect()
         } else {
            client.end(`Unknown DisconnectReason: ${reason}|${lastDisconnect.error}`)
         }
      }
   })
}

connect().catch(() => connect())
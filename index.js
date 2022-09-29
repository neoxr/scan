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

global.store = makeInMemoryStore({ logger })
store.readFromFile(sessionFile)

const connect = async () => {
   const { state } = await useMultiFileAuthState('session')
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
   
   client.store.bind(client.ev)

   client.ev.on('connection.update', async update => {
      
      const { connection, lastDisconnect } = update
      console.log(update)
    if (connection === 'connecting') console.log('sabar ngab lagi nyoba menghubungkan!')
    if (connection === 'close') {
      let reason = new Boom(lastDisconnect.error).output.statusCode
      if (reason === DisconnectReason.badSession) { console.log(`Bad Session, reconnecting...`) connect() }
      else if (reason === DisconnectReason.connectionClosed) { console.log("Connection closed, reconnecting....") connect() }
      else if (reason === DisconnectReason.connectionLost) { console.log("Connection Lost from Server, reconnecting...") connect() }
      else if (reason === DisconnectReason.connectionReplaced) { console.log("Connection Replaced, Another New Session Opened, Please Close Current Session First") client.logout() }
      else if (reason === DisconnectReason.loggedOut) { console.log(`Device Logged Out, Please Scan Again And Run.`) client.logout() }
      else if (reason === DisconnectReason.restartRequired) { console.log("Restart Required, Restarting...") connect() }
      else if (reason === DisconnectReason.timedOut) { console.log("Connection TimedOut, Reconnecting...") connect() }
      else if (reason === DisconnectReason.multideviceMismatch) { console.log("Multi device mismatch, please scan again") client.logout() }
      else client.end(`Unknown DisconnectReason: ${reason}|${connection}`)
    }
    
    if (update.isOnline) {
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
    
    
      }
   })
}

connect().catch(() => connect())
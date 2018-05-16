// Convenience-first, later globals to be slowly reduced.

// system
assert = require('assert')
fs = require('fs')
http = require('http')
os = require('os')
ws = require('ws')
opn = require('../lib/opn')

var chalk = require('chalk') // pretty logs?
highlight = (text) => `"${chalk.bold(text)}"`
link = (text) => `${chalk.underline.white.bold(text)}`
errmsg = (text) => `${chalk.red('   [Error]')} ${text}`
note = (text) => `${chalk.gray(`  ⠟ ${text}`)}`

// crypto TODO: native version
crypto = require('crypto')
// scrypt = require('scrypt') // require('./scrypt_'+os.platform())
base58 = require('base-x')(
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
)

keccak = require('keccak')

nacl = require('../lib/nacl')
ec = (a, b) => bin(nacl.sign.detached(a, b))
ec.verify = nacl.sign.detached.verify

// encoders
BN = require('bn.js')
stringify = require('../lib/stringify')
rlp = require('../lib/rlp') // patched rlp for signed-integer

Sequelize = require('sequelize')
Op = Sequelize.Op

Me = require('./me').Me

// globals
K = false
me = false
Members = false
// Private Key value
PK = {}

RPC = {
  internal_rpc: require('./internal_rpc'),
  external_rpc: require('./external_rpc')
}

// it's just handier when Buffer is stringified into hex vs Type: Buffer..
Buffer.prototype.toJSON = function() {
  return this.toString('hex')
}

prettyState = (state) => {
  if (!state[1]) return false
  state[1][2] = readInt(state[1][2])
  state[1][3] = readInt(state[1][3])
  state[1][4] = readInt(state[1][4])

  // amount and exp, except the hash
  state[2].map((h) => {
    h[0] = readInt(h[0])
    h[2] = readInt(h[2])
  })

  state[3].map((h) => {
    h[0] = readInt(h[0])
    h[2] = readInt(h[2])
  })
}

trim = (ad) => toHex(ad).substr(0, 4)

logstates = (a, b, c, d) => {
  l('Our state', ascii_state(a))
  l('Our signed state', ascii_state(b))
  l('Their state', ascii_state(c))
  l('Their signed state', ascii_state(d))
}
ascii_state = (state) => {
  if (!state[1]) return false
  let hash = toHex(sha3(r(state)))

  return `Hash ${trim(hash)} | ${trim(state[1][0])} | ${trim(state[1][1])} | #${
    state[1][2]
  } | ${state[1][3]} | ${state[1][4]}
------
| ${state[2].map((h) => h[0] + '/' + trim(h[1]) + '/' + h[2]).join(', ')} 
------
| ${state[3].map((h) => h[0] + '/' + trim(h[1]) + '/' + h[2]).join(', ')}
`
}

ascii_tr = (transitions) => {
  try {
    for (var t of transitions) {
      var m = methodMap(readInt(t[0]))

      if (m == 'add') {
        var info = `add ${readInt(t[1][0])} ${trim(t[1][1])} ${readInt(
          t[1][2]
        )} ${trim(t[1][3])}`
      } else {
        var info = `${m} ${trim(t[1][1])}`
      }
      l(`${info}`)
    }
  } catch (e) {}
}

l = (...args) => {
  console.log(...args)
}

// offchain logs
loff = (text) => l(`${chalk.green(`       ⠟ ${text}`)}`)

fatal = (reason) => {
  global.repl = null
  l(errmsg(reason))
  process.exit(1)
}

gracefulExit = (comment) => {
  global.repl = null
  l(note(comment))
  process.exit(0)
}

child_process = require('child_process')

// Amazing lib to forget about binary encoding: https://github.com/ethereum/wiki/wiki/RLP
r = function(a) {
  if (a instanceof Buffer) {
    return rlp.decode(a)
  } else {
    return rlp.encode(a)
  }
}

// for testnet handicaps
sleep = async function(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// critical section for "key"
q = async function(key, job) {
  return new Promise(async (resolve) => {
    key = 'key_' + JSON.stringify(key)

    if (q.q[key]) {
      q.q[key].push([job, resolve])
    } else {
      q.q[key] = [[job, resolve]]

      while (q.q[key].length > 0) {
        try {
          let [got_job, got_resolve] = q.q[key].shift()
          got_resolve(await got_job())
        } catch (e) {
          l(e)
        }
      }
      delete q.q[key]
    }
  })
}
q.q = {}

/*

q("hi", async ()=>{
  await sleep(1000)
  console.log(1)
  await sleep(1000)
}).then(()=>{console.log(11)})

q("hi", async ()=>{
  await sleep(1000)
  console.log(2)
  await sleep(1000)
})

q("hi", async ()=>{
  await sleep(1000)
  console.log(3)
  await sleep(1000)
})

*/
current_db_hash = () => {
  return Buffer.alloc(1)
  /* TODO: fix. may cause race condition and lock db for reading breaking other operations
  .from(
    child_process
      .execSync('shasum -a 256 datadir+/onchain/db.sqlite')
      .toString()
      .split(' ')[0],
    'hex'
  )*/
}

localhost = '127.0.0.1'

readInt = (i) => {
  // reads signed integer from RLP encoded buffer

  if (i.length > 0) {
    var num = i.readUIntBE(0, i.length)
    return num % 2 == 1 ? -(num - 1) / 2 : num / 2
  } else {
    return 0
  }
}

// source changing version
readInts = () => {
  Object.values(arguments).map((arg) => (arg = readInt(arg)))
}

toHex = (inp) => Buffer.from(inp).toString('hex')
fromHex = (inp) => Buffer.from(inp, 'hex')
bin = (data) => Buffer.from(typeof data == 'number' ? [data] : data)
sha3 = (a) =>
  keccak('keccak256')
    .update(bin(a))
    .digest()

// TODO: not proper alg
kmac = (key, msg) =>
  keccak('keccak256')
    .update(key)
    .update(bin(msg))
    .digest()

ts = () => Math.round(new Date() / 1000)

/*
TODO: Add to test spec - arbitrary number of hops with random fee policy, 
must always correctly guess amount to send for the recipient to get exact invoice amount

fees = [0.0000001, 0.000002, Math.random(), Math.random()]

for(var i = 0; i< 9999999;i++){
  var am = i
  var after = afterFees(beforeFees(i, fees), fees.reverse())

  if (i != after){
    console.log(i, after)
  }

}
*/
beforeFees = (amount, fees) => {
  for (var fee of fees) {
    new_amount = Math.round(amount * (1 + fee))
    if (new_amount == amount) new_amount = amount + K.min_fee
    if (new_amount > amount + K.max_fee) new_amount = amount + K.max_fee
    amount = new_amount
  }

  return new_amount
}
afterFees = (amount, fees) => {
  if (!(fees instanceof Array)) fees = [fees]
  for (var fee of fees) {
    var fee = Math.round(amount / (1 + fee) * fee)
    if (fee == 0) fee = K.min_fee
    if (fee > K.max_fee) fee = K.max_fee
    amount = amount - fee
  }
  return amount
}

parse = (json) => {
  try {
    var o = JSON.parse(json)
    if (o && typeof o === 'object') {
      return o
    }
  } catch (e) {
    return {}
  }
}

commy = (b, dot = true) => {
  let prefix = b < 0 ? '-' : ''

  b = Math.abs(b).toString()
  if (dot) {
    if (b.length == 1) {
      b = '0.0' + b
    } else if (b.length == 2) {
      b = '0.' + b
    } else {
      var insert_dot_at = b.length - 2
      b = b.slice(0, insert_dot_at) + '.' + b.slice(insert_dot_at)
    }
  }
  return prefix + b.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

concat = function() {
  return Buffer.concat(Object.values(arguments))
}

process.title = 'Failsafe'

usage = () => {
  return Object.assign(process.cpuUsage(), process.memoryUsage(), {
    uptime: process.uptime()
  })
}

// enumerator of all methods and tx types in the system
methodMap = (i) => {
  let map = [
    'placeholder',

    // consensus
    'propose', // same word used to propose amendments
    'prevote',
    'precommit',

    // onchain transactions
    'batch', // all transactions are batched one by one

    // methods below are per-assets (ie should have setAsset directive beforehand)
    'setAsset',
    'disputeWith', // defines signed state (balance proof). Used only as last resort!
    'withdrawFrom', // mutual *instant* withdrawal proof. Used during normal cooperation.
    'depositTo', // send money to some channel or user
    'sellFor',
    'cancelOrder',
    'createAsset',
    'createHub',

    'revealSecrets', // reveal secrets if partner has not acked our settle
    'vote',

    // offchain
    'update', // gives ack and 0 or more transitions on top

    'setLimits', // define credit limits to partner

    'add', // we add hashlock transfer to state.
    'settle', // we've got the secret so please unlock and apply to base offdelta
    'fail', // couldn't get secret for <reason>, delete hashlock

    // same, but off-the-canonical-state and risky (intermediary may not pass forward)
    'addrisk',
    'settlerisk',
    'failrisk',

    // offchain inputs
    'auth', // any kind of offchain auth signatures between peers
    'tx', // propose array of tx to add to block
    'sync', // i want to sync since this prev_hash
    'chain', // return X blocks since given prev_hash
    'requestWithdrawFrom',
    'ack',
    'testnet'
  ]

  if (typeof i === 'string') {
    i = i.trim()
    if (map.indexOf(i) == -1) throw `No such method: "${i}"`
    return map.indexOf(i)
  } else {
    return map[i]
  }
}

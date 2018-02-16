module.exports = () => {
  var now = ts()

  var currentIndex = Math.floor(now / K.blocktime) % K.total_shares

  var searchIndex = 0
  for (var i in Members) {
    searchIndex += Members[i].shares
    
    if (currentIndex < searchIndex) {
      me.current = Members[i]

      var increment = (K.blocktime - (now % K.blocktime)) < 10 ? 2 : 1

      if (currentIndex + increment >= searchIndex) {
        // take next member or rewind back to 0
        me.next_member = Members[(i + increment) % K.members.length]
      } else {
        // next slot is still theirs
        me.next_member = me.current
      }
      break
    }
  }

  //d(`Status ${me.status} at ${now} Current: ${me.current.id}, next: ${me.next_member.id}.`)

  if (me.my_member == me.current) {
      // do we have enough sig or it's time?
    var sigs = []
    var total_shares = 0
    Members.map((c, index) => {
      if (c.sig) {
        sigs[index] = bin(c.sig)
        total_shares += c.shares
      } else {
        sigs[index] = Buffer.alloc(64)
      }
    })

    if (me.status == 'precommit' && (now % K.blocktime > K.blocktime - 10)) {
      if (total_shares < K.majority) {
        d(`Only have ${total_shares} shares, cannot build a block!`)
      } else {
        d('Lets process the finalblock we just built')

        me.processBlock(concat(
            Buffer.concat(sigs),
            me.precommit
          ))
      }
        // flush sigs
      Members.map(c => c.sig = null)

      me.status = 'await'
    } else if (me.status == 'await' && (now % K.blocktime < K.blocktime - 10)) {
      me.status = 'precommit'
      me.processMempool()
    }
  } else {
    me.status = 'await'
  }
}
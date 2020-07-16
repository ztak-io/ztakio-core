NAMESPACE /dex
META "Info" '{}'
META "Name" "DEX"
META "Version" "0.0.1"
#META "Author" "{{author}}"

ENTRY "ask" ask
ENTRY "bid" bid

DEPLOY deploy
END

:deploy
  OWNER
  RET 0

:bid
  REQUIRE {{{tokenA}}}
  REQUIRE {{{tokenB}}}
  POP get
  POP give
  PUSHV caller
  PUSHV txid
  CONCAT
  SHA256
  BASE58
  POP orderid
  PUSHR orderid
  PUSHR give
  ECALL {{{tokenB}}}:escrow
  VERIFY # Escrow was successful here
  PUSHR orderid
  PUSHS "{{{tokenA}}}"
  CONCAT
  PUSHR get
  PUT

  PUSHS "(.+){{{tokenA}}}"
  ENUM bid_enum

  PUSHI 1
  RET 1

:bid_enum
  POP getamnt
  POP orderid
  PUSHS "DEX {{{tokenA}}}{{{tokenB}}} Order: "
  PUSHR orderid
  CONCAT
  LOGP
  PUSHR orderid
  ECALL {{{tokenA}}}:balance
  JZ end_bid_enum # If there's no escrowed balance, skip
  PUSHS "Give value: "
  SWAP
  CONCAT
  LOGP
  PUSHS "Get value: "
  PUSHR getamnt
  CONCAT
:end_bid_enum
  LOGP
  PUSHI 1
  RET 1

:ask
  REQUIRE {{{tokenA}}}
  REQUIRE {{{tokenB}}}
  POP get
  POP give
  PUSHV caller
  PUSHV txid
  CONCAT
  SHA256
  BASE58
  POP orderid
  PUSHR orderid
  PUSHR give
  ECALL {{{tokenA}}}:escrow
  VERIFY # Escrow was successful here
  PUSHR orderid
  PUSHS "{{{tokenB}}}"
  CONCAT
  PUSHR get
  PUT

  PUSHI 1
  RET 1

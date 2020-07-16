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
  ECALL {{{tokenB}}}:escrow
  VERIFY # Escrow was successful here
  PUSHR orderid
  PUSHS "{{{tokenA}}}"
  CONCAT
  PUSHR get
  PUT

  #PUSHR orderid
  #PUSHS ".owner"
  #CONCAT
  #PUSHV caller
  #PUT

  PUSHI 1
  RET 1

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
  ECALL {{{tokenA}}}:escrow
  VERIFY # Escrow was successful here
  PUSHR orderid
  PUSHS "{{{tokenB}}}"
  CONCAT
  PUSHR get
  PUT

  #PUSHR orderid
  #PUSHS ".owner"
  #CONCAT
  #PUSHV caller
  #PUT

  PUSHI 1
  RET 1

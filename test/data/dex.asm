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
  REQUIRE {{{top}}}
  REQUIRE {{{bottom}}}
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
  ECALL {{{bottom}}}:escrow
  VERIFY # Escrow was successful here
  PUSHR orderid
  PUSHS "{{{bottom}}}"
  CONCAT
  NEW
  PUSHS "get"
  PUSHR get
  SETO
  PUSHS "give"
  PUSHR give
  SETO
  PUSHS "owner"
  PUSHV caller
  SETO
  PUSHS "get_contract"
  PUSHS "{{{bottom}}}"
  SETO
  PUSHS "give_contract"
  PUSHS "{{{top}}}"
  SETO
  PUSHR get
  PUSHI 1000000
  MUL
  PUSHR give
  DIV
  POP rate
  PUSHR rate
  PUSHS "rate"
  SWAP
  SETO
  PUT

  PUSHS "(.+){{{top}}}"
  ENUMORD bid_enum "rate" "asc"

  PUSHI 1
  RET 1

:bid_enum
  POP getamnt
  POP orderid
  PUSHR orderid
  ECALL {{{top}}}:balance
  JZ end_bid_enum # If there's no escrowed balance, skip
  POP escrowed
  PUSHR getamnt
  PUSHS "rate"
  GETO
  #PUSHS "Rate: "
  #SWAP
  PUSHS " <----"
  CONCAT
  LOGP
:end_bid_enum
  PUSHI 1
  RET 1

:ask
  REQUIRE {{{top}}}
  REQUIRE {{{bottom}}}
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
  ECALL {{{top}}}:escrow
  VERIFY # Escrow was successful here
  PUSHR orderid
  PUSHS "{{{top}}}"
  CONCAT
  NEW
  PUSHS "get"
  PUSHR get
  SETO
  PUSHS "give"
  PUSHR give
  SETO
  PUSHS "owner"
  PUSHV caller
  SETO
  PUSHS "get_contract"
  PUSHS "{{{bottom}}}"
  SETO
  PUSHS "give_contract"
  PUSHS "{{{top}}}"
  SETO
  PUSHR get
  PUSHI 1000000
  MUL
  PUSHR give
  DIV
  POP rate
  PUSHR rate
  PUSHS "rate"
  SWAP
  SETO
  PUT

  PUSHI 1
  RET 1

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
  SET
  PUSHS "give"
  PUSHR give
  SET
  PUSHS "owner"
  PUSHV caller
  SET
  PUT

  PUSHS "(.+){{{top}}}"
  ENUMORD bid_enum "rate" "desc"

  PUSHI 1
  RET 1

:bid_enum
  POP getamnt
  POP orderid
  PUSHS "DEX {{{top}}}{{{bottom}}} Order: "
  PUSHR orderid
  CONCAT
  LOGP
  PUSHR orderid
  ECALL {{{top}}}:balance
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
  SET
  PUSHS "give"
  PUSHR give
  SET
  PUSHS "owner"
  PUSHV caller
  SET
  PUSHS "get_contract"
  PUSHS "{{{bottom}}}"
  SET
  PUSHS "give_contract"
  PUSHS "{{{top}}}"
  SET
  PUSHR get
  PUSHI 100000000
  MUL
  PUSHR give
  DIV
  PUSHS "rate"
  SWAP
  SET
  PUT

  PUSHI 1
  RET 1

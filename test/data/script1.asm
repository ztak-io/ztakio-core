META "Name" "Dabomb Token"
META "Version" "0.0.1" # Test comment
META "Author" "ZyJFG9AmGqrDLskgHrNMLNUB9n3yi9Vx2C"
META "Info" '{"icon": "https://ztak.io/icons/dabomb.png", "website": "https://ztak.io", "decimals": 2}'
NAMESPACE /ztak/dabomb

ENTRY "send" send
ENTRY "transfer" transfer
ENTRY "coinbase" coinbase

DEPLOY firstdeploy
END

:firstdeploy
  OWNER
  PUSHV caller
  PUSHI 1000
  PUT
  LOG "Deployed contract"
  RET 0

:transfer
  OWNER
  POPM "Address"
  END

:coinbase
  PUSHV height
  JNEQ coinbase_invalid
  DROP2
  GETI 0
  PUSHI 100
  PLUS
  SINK
  SINK
  PUT
  PUSHI 1
  RET 1
:coinbase_invalid
  PUSHI 0
  RET 1

:send
  POP memo
  POP amount
  POP destination
  PUSHV caller
  GETI 0 # Gets sender amount as integer, default to 0 if not available
  PUSHR amount
  SWAP
  MINUS
  JLZ send_invalid_amount # If remaining is less than 0, send is invalid
  PUSHV caller
  SWAP
  PUT
  DROP2
  PUSHR destination
  GETI 0 # Gets current destination balance
  SINK # Removes the destination address
  SINK
  PLUS
  PUSHR destination
  SWAP
  PUT # sets the new destination amount
  PUSHI 1
  RET 1
:send_invalid_amount
  PUSHI 0
  RET 1

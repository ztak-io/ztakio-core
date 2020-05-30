META "Name" "Test script number 1"
META "Version" "0.0.1" # Test comment
META "Author" "ZyJFG9AmGqrDLskgHrNMLNUB9n3yi9Vx2C"

NAMESPACE /ztak/dabomb

ENTRY "deploy" ondeploy
ENTRY "send" send
ENTRY "transfer" transfer

DEPLOY
END

:ondeploy
  OWNER
  PUSHV caller
  PUSHI 1000
  PUT
  LOG "Deployed contract"
  END

:transfer
  OWNER
  POPM "Address"
  END

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
  POPZ
  POPZ
  PUSHR destination
  GETI 0 # Gets current destination balance
  SWAP
  POPZ # Removes the destination address
  SWAP
  POPZ
  PLUS
  PUSHR destination
  SWAP
  PUT # sets the new destination amount
  PUSHI 1
  RET 1
:send_invalid_amount
  PUSHI 0
  RET 1

NAMESPACE /ztak

DEPLOY root
END

:root
  META "Name" "ZTak.io Namespace"
  META "Version" "1"
  META "Author" "ZyJFG9AmGqrDLskgHrNMLNUB9n3yi9Vx2C"
  META "Info" '{"icon": "https://ztak.io/icons/ztak.png", "website": "https://ztak.io"}'
  ENTRY "federation" poa

  PUSHI 0
  PUSHS "ZqTWBdmcYYVgx8y29dZBakoYQvt4GXGuqm"
  PUT
  DROP2
  PUSHI 1
  PUSHS "ZyJFG9AmGqrDLskgHrNMLNUB9n3yi9Vx2C"
  PUT
  DROP2
  RET 0

:poa
  LOG "Ztak poa"
  POP signature
  POP blockhash
  PUSHI 0
  PUSHI 10 # Up to 10 federation participants
  PUSHI 1 # Iterate one by one
  PUSHI 0
  ITER poaverify
  VERIFY
  END

:poaverify
  GET
  JNIL poaexit
  PUSHPR blockhash
  PUSHPR signature
  CHECKSIG
  RET 1
:poaexit
  PUSHI -1
  RET 1

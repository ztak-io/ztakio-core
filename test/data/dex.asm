# Template for DEX contracts
# This template receives 3 parameters:
# tradeRatePrecision: The multiplier at which trading rates are calculated
# bottom: The bottom asset of this dex
# top: The top asset of this dex
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
  CONSTI rateprecision {{tradeRatePrecision}}
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
  PUSHS "get_remaining"
  PUSHR get
  SETO
  PUSHS "give"
  PUSHR give
  SETO
  PUSHS "give_remaining"
  PUSHR give
  SETO
  PUSHS "owner"
  PUSHV caller
  SETO
  PUSHS "get_contract"
  PUSHS "{{{top}}}"
  SETO
  PUSHS "give_contract"
  PUSHS "{{{bottom}}}"
  SETO
  PUSHR give
  PUSHCI rateprecision
  MUL
  PUSHR get
  DIV
  POP rate
  PUSHR rate
  PUSHS "rate"
  SWAP
  SETO
  PUT

  PUSHS "([a-zA-Z0-9]+){{{top}}}$"
  ENUMORD bid_enum "rate" "asc"
  PUSHI 1
  RET 1

:bid_enum
  POP makerDesc
  POP makerOrderid

  PUSHR makerDesc # Verify that this offer's rate is below or equal than the bid's rate
  PUSHS "rate"
  GETO
  POP makerRate # Keep that maker rate jsut in case
  PUSHR makerRate
  PUSHPR rate
  MINUS
  JLZ end_bid_enum_rate_too_high # If offer rate is greater than bid, bail out

  PUSHR makerOrderid # Get the current escrowed maker balance
  ECALL {{{top}}}:balance
  JZ end_bid_enum_zero_maker_escrow # If there's no escrowed balance, skip
  POP escrowedMaker

  PUSHPR orderid # Get the current escrowed taker balance
  PUSHS "{{{bottom}}}"
  CONCAT
  POP takerOrderid
  PUSHR takerOrderid
  GET
  POP takerDesc

  PUSHPR orderid # Get the current escrowed taker balance
  ECALL {{{bottom}}}:balance
  JZ end_bid_enum_zero_taker_escrow # If there's no escrowed balance, skip
  POP escrowedTaker
  PUSHR takerDesc
  PUSHS "get_remaining"
  GETO
  POP getRemainTaker

  PUSHR makerDesc
  PUSHS "owner"
  GETO
  POP makerAddress # the maker address
  PUSHR makerDesc
  PUSHS "get_remaining"
  GETO
  POP getRemainMaker

  # Log stuff
  PUSHS "Match rate: "
  PUSHR makerRate
  CONCAT
  LOGP
  PUSHS "Maker: "
  PUSHR makerAddress
  CONCAT
  PUSHS " - Order id: "
  CONCAT
  PUSHR makerOrderid
  CONCAT
  PUSHS " - escrowed: "
  CONCAT
  PUSHR escrowedMaker
  CONCAT
  PUSHS " - getRemaining: "
  CONCAT
  PUSHR getRemainMaker
  CONCAT
  LOGP

  PUSHS "Taker: "
  PUSHV caller
  CONCAT
  PUSHS " - Order id: "
  CONCAT
  PUSHPR orderid
  CONCAT
  PUSHS " - escrowed: "
  CONCAT
  PUSHR escrowedTaker
  CONCAT
  PUSHS " - getRemaining: "
  CONCAT
  PUSHR getRemainTaker
  CONCAT
  LOGP

  PUSHR getRemainTaker
  PUSHR escrowedMaker
  MINUS
  JLZ bid_enum_maker_less_than_taker
  JZ bid_enum_maker_equal_to_taker

#:bid_enum_maker_greater_than_taker
  LOG "Bid maker greater than taker"

  PUSHR escrowedTaker
  PUSHR escrowedMaker
  MUL
  PUSHR getRemainMaker
  DIV
  POP matchedTaker

  # Send matched amount to maker
  PUSHPR orderid
  PUSHR makerAddress
  PUSHR escrowedTaker
  ECALL {{{bottom}}}:sendfrom

  # Send matched amount to taker
  PUSHR makerOrderid
  PUSHV caller
  PUSHR matchedTaker
  ECALL {{{top}}}:sendfrom

  # Update maker order
  PUSHR makerDesc
  PUSHS "give_remaining"
  GETO
  PUSHR matchedTaker
  SWAP
  MINUS
  PUSHS "give_remaining"
  SWAP
  SETO
  PUSHS "get_remaining"
  GETO
  PUSHR escrowedTaker
  SWAP
  MINUS
  PUSHS "get_remaining"
  SWAP
  SETO
  PUSHR makerOrderid
  PUSHS "{{{top}}}"
  CONCAT
  SWAP
  PUT

  # Update taker order
  PUSHR takerDesc
  PUSHS "give_remaining"
  PUSHI 0
  SETO
  PUSHS "get_remaining"
  PUSHI 0
  SETO
  PUSHR takerOrderid
  SWAP
  PUT
  PUSHR takerOrderid
  CALL archive_order

  JMP bid_enum_end

:bid_enum_maker_equal_to_taker
  # Send matched amount to taker
  PUSHR makerOrderid
  PUSHV caller
  PUSHR escrowedMaker
  ECALL {{{top}}}:sendfrom

  # Send matched amount to maker
  PUSHPR orderid
  PUSHR makerAddress
  PUSHR takerDesc
  PUSHS "give_remaining"
  GETO
  SINK
  ECALL {{{bottom}}}:sendfrom

  # Update maker order
  PUSHR makerDesc
  PUSHS "give_remaining"
  PUSHI 0
  SETO
  PUSHS "get_remaining"
  PUSHI 0
  SETO
  PUSHR makerOrderid
  PUSHS "{{{top}}}"
  CONCAT
  SWAP
  PUT
  PUSHR makerOrderid
  PUSHS "{{{top}}}"
  CONCAT
  CALL archive_order

  # Update taker order
  PUSHR takerDesc
  PUSHS "give_remaining"
  PUSHI 0
  SETO
  PUSHS "get_remaining"
  PUSHI 0
  SETO
  PUSHR takerOrderid
  SWAP
  PUT
  PUSHR takerOrderid
  CALL archive_order

  JMP bid_enum_no_return_to_maker

:bid_enum_maker_less_than_taker
  LOG "Bid maker less than taker"
  LOGP

  PUSHR getRemainMaker
  PUSHCI rateprecision
  MUL
  PUSHR makerRate
  DIV
  POP fromTakerToMaker

  PUSHR fromTakerToMaker
  JGZ bid_enum_maker_less_than_taker_can_pay
  # At this point, the maker order can't fill any order, so cancel it
  LOG "Maker order cannot fill anymore at this rate, archiving"
  PUSHR getRemainMaker
  POP returnToMaker
  PUSHI 0
  POP fromTakerToMaker
  JMP bid_enum_maker_less_than_taker_store_orders

:bid_enum_maker_less_than_taker_can_pay
  PUSHR fromTakerToMaker
  PUSHR makerRate
  MUL
  PUSHCI rateprecision
  DIV
  POP fromMakerToTaker
  PUSHR fromMakerToTaker
  PUSHR getRemainMaker
  MINUS
  POP returnToMaker

  # Send matched amount to taker
  PUSHR makerOrderid
  PUSHV caller
  PUSHR fromMakerToTaker
  ECALL {{{top}}}:sendfrom

  # Send matched amount to maker
  PUSHPR orderid
  PUSHR makerAddress
  PUSHR fromTakerToMaker
  ECALL {{{bottom}}}:sendfrom

  # Send remaining unmatcheable amount to maker
:bid_enum_maker_less_than_taker_store_orders
  PUSHR makerOrderid
  PUSHR makerAddress
  PUSHR returnToMaker
  JZ bid_enum_no_return_to_maker
  ECALL {{{top}}}:sendfrom

  # Update maker order
  PUSHR makerDesc
  PUSHS "give_remaining"
  PUSHI 0
  SETO
  PUSHS "get_remaining"
  PUSHI 0
  SETO
  PUSHR makerOrderid
  PUSHS "{{{top}}}"
  CONCAT
  SWAP
  PUT
  PUSHR makerOrderid
  PUSHS "{{{top}}}"
  CONCAT
  CALL archive_order

  # Update taker order
  PUSHR takerDesc
  PUSHS "give_remaining"
  GETO
  PUSHR fromTakerToMaker
  JLZ bid_enum_no_return_to_maker
  JZ bid_enum_no_return_to_maker
  SWAP
  MINUS
  PUSHS "give_remaining"
  SWAP
  SETO
  PUSHS "get_remaining"
  GETO
  PUSHR fromMakerToTaker
  SWAP
  MINUS
  PUSHS "get_remaining"
  SWAP
  SETO
  PUSHR takerOrderid
  SWAP
  PUT

:bid_enum_no_return_to_maker
  JMP bid_enum_end

:bid_enum_end
  PUSHI 1
  RET 1
:end_bid_enum_zero_taker_escrow
  LOG "Zero balance on taker escrow"
  PUSHI 0
  RET 1
:end_bid_enum_zero_maker_escrow
  LOG "Zero balance on maker escrow"
  PUSHI 0
  RET 1
:end_bid_enum_rate_too_high
  PUSHI 0
  RET 1


########################################################################

:ask
  CONSTI rateprecision {{tradeRatePrecision}}
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
  PUSHS "get_remaining"
  PUSHR get
  SETO
  PUSHS "give"
  PUSHR give
  SETO
  PUSHS "give_remaining"
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
  PUSHR give
  PUSHCI rateprecision
  MUL
  PUSHR get
  DIV
  POP rate
  PUSHR rate
  PUSHS "rate"
  SWAP
  SETO
  PUT

  PUSHS "([a-zA-Z0-9]+){{{bottom}}}$"
  ENUMORD ask_enum "rate" "desc"
  PUSHI 1
  RET 1

:ask_enum
  POP makerDesc
  POP makerOrderid

  PUSHR makerDesc # Verify that this offer's rate is below or equal than the bid's rate
  PUSHS "rate"
  GETO
  POP makerRate # Keep that maker rate just in case
  PUSHR makerRate
  PUSHPR rate
  MINUS

  POP temp

  PUSHS "Ask Maker Order id: "
  PUSHR makerOrderid
  CONCAT
  PUSHS " - Rate diff: "
  CONCAT
  PUSHR temp
  CONCAT

  LOG "sushi"
  PUSHR makerDesc
  PUSHS "sushi"
  GETO

  LOGP

  PUSHR temp

  JGZ end_ask_enum_rate_too_low # If offer rate is lower than ask, bail out
  LOG "Here!"

  PUSHR makerOrderid # Get the current escrowed maker balance
  ECALL {{{bottom}}}:balance
  JZ end_ask_enum_zero_maker_escrow # If there's no escrowed balance, skip
  POP escrowedMaker

  PUSHPR orderid # Get the current escrowed taker balance
  PUSHS "{{{top}}}"
  CONCAT
  POP takerOrderid
  PUSHR takerOrderid
  GET
  POP takerDesc

  PUSHPR orderid # Get the current escrowed taker balance
  ECALL {{{top}}}:balance
  JZ end_ask_enum_zero_taker_escrow # If there's no escrowed balance, skip
  POP escrowedTaker
  PUSHR takerDesc
  PUSHS "get_remaining"
  GETO
  POP getRemainTaker

  PUSHR makerDesc
  PUSHS "owner"
  GETO
  POP makerAddress # the maker address
  PUSHR makerDesc
  PUSHS "get_remaining"
  GETO
  POP getRemainMaker

  # Log stuff
  PUSHS "Match rate: "
  PUSHR makerRate
  CONCAT
  LOGP
  PUSHS "Maker: "
  PUSHR makerAddress
  CONCAT
  PUSHS " - Order id: "
  CONCAT
  PUSHR makerOrderid
  CONCAT
  PUSHS " - escrowed: "
  CONCAT
  PUSHR escrowedMaker
  CONCAT
  PUSHS " - getRemaining: "
  CONCAT
  PUSHR getRemainMaker
  CONCAT
  LOGP

  PUSHS "Taker: "
  PUSHV caller
  CONCAT
  PUSHS " - Order id: "
  CONCAT
  PUSHPR orderid
  CONCAT
  PUSHS " - escrowed: "
  CONCAT
  PUSHR escrowedTaker
  CONCAT
  PUSHS " - getRemaining: "
  CONCAT
  PUSHR getRemainTaker
  CONCAT
  LOGP

  PUSHR getRemainTaker
  PUSHR escrowedMaker
  MINUS
  JLZ ask_enum_maker_less_than_taker
  JZ ask_enum_maker_equal_to_taker

#:ask_enum_maker_greater_than_taker
  LOG "Ask maker greater than taker"

  PUSHR escrowedTaker
  PUSHR escrowedMaker
  MUL
  PUSHR getRemainMaker
  DIV
  POP matchedTaker

  # Send matched amount to maker
  PUSHPR orderid
  PUSHR makerAddress
  PUSHR escrowedTaker
  ECALL {{{top}}}:sendfrom

  # Send matched amount to taker
  PUSHR makerOrderid
  PUSHV caller
  PUSHR matchedTaker
  ECALL {{{bottom}}}:sendfrom

  # Update maker order
  PUSHR makerDesc
  PUSHS "give_remaining"
  GETO
  PUSHR matchedTaker
  SWAP
  MINUS
  PUSHS "give_remaining"
  SWAP
  SETO
  PUSHS "get_remaining"
  GETO
  PUSHR escrowedTaker
  SWAP
  MINUS
  PUSHS "get_remaining"
  SWAP
  SETO
  PUSHR makerOrderid
  PUSHS "{{{bottom}}}"
  CONCAT
  SWAP
  PUT

  # Update taker order
  PUSHR takerDesc
  PUSHS "give_remaining"
  PUSHI 0
  SETO
  PUSHS "get_remaining"
  PUSHI 0
  SETO
  PUSHR takerOrderid
  SWAP
  PUT
  PUSHR takerOrderid
  CALL archive_order

  JMP ask_enum_end

:ask_enum_maker_equal_to_taker
  # Send matched amount to taker
  PUSHR makerOrderid
  PUSHV caller
  PUSHR escrowedMaker
  ECALL {{{bottom}}}:sendfrom

  # Send matched amount to maker
  PUSHPR orderid
  PUSHR makerAddress
  PUSHR takerDesc
  PUSHS "give_remaining"
  GETO
  SINK
  ECALL {{{top}}}:sendfrom

  # Update maker order
  PUSHR makerDesc
  PUSHS "give_remaining"
  PUSHI 0
  SETO
  PUSHS "get_remaining"
  PUSHI 0
  SETO
  PUSHR makerOrderid
  PUSHS "{{{bottom}}}"
  CONCAT
  SWAP
  PUT
  PUSHR makerOrderid
  PUSHS "{{{bottom}}}"
  CONCAT
  CALL archive_order

  # Update taker order
  PUSHR takerDesc
  PUSHS "give_remaining"
  PUSHI 0
  SETO
  PUSHS "get_remaining"
  PUSHI 0
  SETO
  PUSHR takerOrderid
  SWAP
  PUT
  PUSHR takerOrderid
  CALL archive_order

  JMP ask_enum_no_return_to_maker

:ask_enum_maker_less_than_taker
  LOG "Ask maker less than taker"
  LOGP

  PUSHR getRemainMaker
  PUSHCI rateprecision
  MUL
  PUSHR makerRate
  DIV
  POP fromTakerToMaker

  PUSHR fromTakerToMaker
  JGZ ask_enum_maker_less_than_taker_can_pay
  # At this point, the maker order can't fill any order, so cancel it
  LOG "Maker order cannot fill anymore at this rate, archiving"
  PUSHR getRemainMaker
  POP returnToMaker
  PUSHI 0
  POP fromTakerToMaker
  JMP ask_enum_maker_less_than_taker_store_orders

:ask_enum_maker_less_than_taker_can_pay
  PUSHR fromTakerToMaker
  PUSHR makerRate
  MUL
  PUSHCI rateprecision
  DIV
  POP fromMakerToTaker
  PUSHR fromMakerToTaker
  PUSHR getRemainMaker
  MINUS
  POP returnToMaker

  # Send matched amount to taker
  PUSHR makerOrderid
  PUSHV caller
  PUSHR fromMakerToTaker
  ECALL {{{bottom}}}:sendfrom

  # Send matched amount to maker
  PUSHPR orderid
  PUSHR makerAddress
  PUSHR fromTakerToMaker
  ECALL {{{top}}}:sendfrom

  # Send remaining unmatcheable amount to maker
:ask_enum_maker_less_than_taker_store_orders
  PUSHR makerOrderid
  PUSHR makerAddress
  PUSHR returnToMaker
  JZ ask_enum_no_return_to_maker
  ECALL {{{bottom}}}:sendfrom

  # Update maker order
  PUSHR makerDesc
  PUSHS "give_remaining"
  PUSHI 0
  SETO
  PUSHS "get_remaining"
  PUSHI 0
  SETO
  PUSHR makerOrderid
  PUSHS "{{{bottom}}}"
  CONCAT
  SWAP
  PUT
  PUSHR makerOrderid
  PUSHS "{{{bottom}}}"
  CONCAT
  CALL archive_order

  # Update taker order
  PUSHR takerDesc
  PUSHS "give_remaining"
  GETO
  PUSHR fromTakerToMaker
  JLZ ask_enum_no_return_to_maker
  JZ ask_enum_no_return_to_maker
  SWAP
  MINUS
  PUSHS "give_remaining"
  SWAP
  SETO
  PUSHS "get_remaining"
  GETO
  PUSHR fromMakerToTaker
  SWAP
  MINUS
  PUSHS "get_remaining"
  SWAP
  SETO
  PUSHR takerOrderid
  SWAP
  PUT

:ask_enum_no_return_to_maker
  JMP ask_enum_end

:ask_enum_end
  PUSHI 1
  RET 1
:end_ask_enum_zero_taker_escrow
  LOG "Zero balance on taker escrow"
  PUSHI 0
  RET 1
:end_ask_enum_zero_maker_escrow
  LOG "Zero balance on maker escrow"
  PUSHI 0
  RET 1
:end_ask_enum_rate_too_low
  PUSHI 0
  RET 1

########################################################################




:archive_order
  POP originalid
  POP order
  PUSHS "archived/"
  PUSHR originalid
  CONCAT
  PUSHR order
  PUT
  PUSHR originalid
  DEL
  RET 0

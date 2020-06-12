REQUIRE /ztak/dabomb

# Send
PUSHS "%s"
PUSHI %i
PUSHS "Payment for digital coffee"
ECALL send
VERIFY

END

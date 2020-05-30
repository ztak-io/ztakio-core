REQUIRE /ztak/dabomb

# Send
PUSHS "ZjeCjK5XQ5ftncfLE3Y3hExsuMhuUUG1R8"
PUSHI 105
PUSHS "Payment for digital coffee"
ECALL send
VERIFY

# Transfer
PUSHS "ZjeCjK5XQ5ftncfLE3Y3hExsuMhuUUG1R8"
ECALL transfer

END

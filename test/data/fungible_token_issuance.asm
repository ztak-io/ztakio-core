# This is a contract template to issue more tokens
# It receives 2 parameters
# 1) Token path
# 2) Amount of the token to issue
# The called token must have an "issuance" entrypoint
# The issuance function must return 1 on success
REQUIRE {{{token}}}

# Issuance
PUSHI {{{amount}}}
ECALL {{{token}}}:issuance
VERIFY

END

module.exports = `
CODE ::= ((comment | label | op)? (WS comment)? NL)*

comment ::= "#" WS? alphanumeric
label ::= ":" alphanumeric
op ::= WS? identifier (WS (path | identifier | number | string))*

identifier ::= IDENTLETTER (IDENTLETTER | NUMBER)*
LETTER ::= ([#x41-#x5a] | [#x61-#x7a])
IDENTLETTER ::= ("_" | [#x41-#x5a] | [#x61-#x7a])

path ::= (SLASH (LETTER | NUMBER)+)+
SLASH ::= #x2F

NUMBER ::= [0-9]

number ::= "-"? ("0" | [1-9] [0-9]*) ("." [0-9]+)? (("e" | "E") ( "-" | "+" )? ("0" | [1-9] [0-9]*))?
alphanumeric ::= [#x20-#xFFFF]*
string ::= (STRINGDOUBLE | STRINGSINGLE)
STRINGDOUBLE ::= '"' (([#x20-#x21] | [#x23-#x5B] | [#x5D-#xFFFF]) | #x5C (#x22 | #x5C | #x2F | #x62 | #x66 | #x6E | #x72 | #x74 | #x75 HEXDIG HEXDIG HEXDIG HEXDIG))* '"'
STRINGSINGLE ::= #x27 (([#x20-#x26] |[#x28-#x5B] | [#x5D-#xFFFF]) | #x5C (#x27 | #x5C | #x2F | #x62 | #x66 | #x6E | #x72 | #x74 | #x75 HEXDIG HEXDIG HEXDIG HEXDIG))* #x27

HEXDIG ::= [a-fA-F0-9]
WS ::= [#x20#x09]+
NL ::= #x0A
`

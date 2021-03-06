module.exports = `namespace ::= namespace_op WS+ path object
namespace_op ::= ("define" | "using")
value                ::= (op | false | null | true | object | object_ref | number | string | member)
basevalue ::= (op | false | null | true | object | object_ref | number | string | call_member )
BEGIN_OBJECT         ::= WS* #x7B WS*  /* { left curly bracket */
END_OBJECT           ::= WS* #x7D WS*  /* } right curly bracket */
BEGIN_CALL         ::= WS* "(" WS*
END_CALL           ::= WS* ")" WS*
NAME_SEPARATOR       ::= WS* #x3A WS*  /* : colon */
VALUE_SEPARATOR      ::= WS* (#x2C | WS | NL)* WS*

ASSIGN_SEPARATOR       ::= WS* "=" WS*
NL ::= [#x0A#x0D]+
WS                   ::= [#x20#x09#x0A#x0D]+   /* Space | Tab | \n | \r */
NWS                   ::= [#x20#x09]+   /* Space | Tab | \n | \r */
false                ::= "false"
null                 ::= "null"
true                 ::= "true"
temp_object               ::= BEGIN_OBJECT (member (VALUE_SEPARATOR member)*)? END_OBJECT
object               ::= BEGIN_OBJECT member* END_OBJECT
member               ::= WS* (return_member | if_member | enum_member | require_member | call_member | funcdef | value_member | declaration_member) WS*
number                ::= "-"? ("0" | [1-9] [0-9]*) ("." [0-9]+)? (("e" | "E") ( "-" | "+" )? ("0" | [1-9] [0-9]*))?

op ::= (false | null | true | object | object_ref | number | string | identifier | call_member) (NWS* operator NWS* (false | null | true | object | object_ref | number | string | identifier | call_member))+
operator ::= (#x2B | #x2D | #x2A #x2A | #x2A | #x2F | #x7C | #x26 | #x5E | #x5F | #x25 | #x3E #x3E | #x3C #x3C | #x5E #x5E | #x7C #x7C | #x26 #x26 | #x3D #x3D | #x3C #x3D | #x3E #x3D | #x21 #x3D | #x3C | #x3E)

params ::= WS* (basevalue | identifier) WS* ("," WS* (basevalue | identifier) WS*)*
func_params ::= WS* identifier WS* ("," WS* identifier WS*)*

value_member ::= (identifier | path) NAME_SEPARATOR (value | identifier)
declaration_member ::= (declaration_qualification WS+)? (identifier_list | object_ref | identifier) ASSIGN_SEPARATOR declared_value

identifier_list ::= WS* identifier (WS* "," WS* identifier)+

declared_value ::= (basevalue | identifier)
declaration_qualification ::= ("const")

require_member ::= "require" WS* path

if_member ::= if_block ("else" WS+ if_block)* else_block?
if_block ::= "if" if_condition object
if_condition ::= BEGIN_CALL op END_CALL
else_block ::= "else" WS* object

returnvalue ::= (basevalue | identifier)
basevalue_list ::= returnvalue (WS* "," WS* returnvalue)*
return_member ::= "return"  WS* basevalue_list

call_member ::= (path ".")? identifier BEGIN_CALL params? END_CALL

funcdef ::= (func_qualification WS+)* identifier BEGIN_CALL func_params? END_CALL BEGIN_OBJECT (WS* member WS*)* END_OBJECT
func_qualification ::= ("entry" | "func" | "enum" | "owner" | "deploy")

object_ref ::= identifier ("." identifier)+

enum_member ::= identifier "@" string enum_order identifier
enum_order ::= ("+" | "-")

identifier ::= LETTER (PLAINNUMBER | LETTER)*
path ::= (#x2F identifier)+
LETTER ::= ("_" | [#x41-#x5A] | [#x61-#x7A])
PLAINNUMBER ::= [#x30-#x39]

string                ::= '"' (([#x20-#x21] | [#x23-#x5B] | [#x5D-#xFFFF]) | #x5C (#x22 | #x5C | #x2F | #x62 | #x66 | #x6E | #x72 | #x74 | #x75 HEXDIG HEXDIG HEXDIG HEXDIG))* '"'
HEXDIG                ::= [a-fA-F0-9]
`

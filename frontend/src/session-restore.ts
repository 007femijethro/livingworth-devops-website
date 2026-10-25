/** Temporary connectivity/server failures must not erase an otherwise saved session. */
export function sessionRestoreAction(error:unknown):'sign-in'|'retry'{
 const status=error&&typeof error==='object'&&'status'in error?Number(error.status):0;
 return status===401||status===403?'sign-in':'retry';
}

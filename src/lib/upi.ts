/**
 * Shape of a valid UPI VPA ("virtual payment address"), e.g. `name@okhdfcbank`
 * or `9876543210@ybl`: exactly one `@`, and only URL-safe characters on each
 * side. Used to validate the admin-set UPI ID before it's shown to customers.
 */
export const UPI_VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;

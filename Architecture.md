Architecture
============

This document lists the current architecture of this module, and
what should be expected from the current implementation.

Leader & leader election
------------------------

Leaders are responsible for:

  1. Orchestrating rebalance operations: emits
    - start event
    - orders (move vnode x to y)
    - completion event
  2. Propagating ring state changes (when nodes go up and down; happens after rebalances)

When nodes appear/disappear, wait for a little while for other changes,
then elect a new leader.

Todo: if a node keeps flipping on and off, we ignore said node until it
comes back "permanently"?

Should a leadership change be needed while a rebalancing is occuring, the
new leader node holds back from taking leadership until the rebalance is completed;

Should a leader crash during a rebalance, the new leader will take charge and
complete the rebalance

Traffic shaping
---------------

Requests are forwarded to the correct server through msgStream, and responses
will be sent back through it as well; should a destination server
go down midway, requests will return an error to the remote client automatically

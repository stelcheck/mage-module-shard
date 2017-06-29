mage-module-shard
=================

Module to help you implement modules that act as shards
within a MAGE cluster; that is, requests to those modules 
will always be routed to the same module instance within
a cluster, given a given shard key, sharding method, and topology.

This module takes care of:

  1. Routing requests within a MAGE cluster
  2. Re-balancing events, when scaling up or down the cluster; that is,
     transfering your in-memory objects whenever adding or 
     removing MAGE server nodes

Installation
-------------

```shell
npm install --save mage-module-shard
```

Usage
-----

### Default sharding behavior

> lib/modules/sharded/index.ts

```typescript
import {
  Shard,
  AbstractShardedModule
} from 'mage-module-shard'

class ShardedModule extends AbstractShardedModule {
  @Shard()
  public someMethod(state: mage.core.IState) {
    // Your code goes here
  }

  public notSharded(state: mage.core.IState) {
    // This will always be executed locally
  }
}

export default new ShardedModule()
```

By default, methods decorated with the `@Shard` decorator
will be sharded based on the state's actorId value.

### Custom sharding behavior

> lib/modules/anotherSharded/index.ts

```typescript
import {
  Shard,
  AbstractShardedModule
} from 'mage-module-shard'

/**
 * Custom sharding logic
 */
function byGameId(state: mage.core.IState, gameId: string) {
  // tbd
}

class AnotherShardedModule extends AbstractShardedModule {
  @Shard(byGameId)
  public someMethod(state: mage.core.IState, gameId: string) {
    // Your code goes here
  }
}

export default new AnotherShardedModule()
```

Here, we can see an example of a custom sharding logic being implemented.
The `@Shard()` decorator can take a shard function as a parameter; this shard
function must have the same method signature as the module method it 
will decorate (you may ignore trailing parameters).

### Scaling & rebalancing

```typescript
```

License
-------

MIT

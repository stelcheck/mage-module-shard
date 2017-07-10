mage-module-shard
=================

Module to help you implement modules that act as shards
within a MAGE cluster. Requests to those modules' method 
will always be routed to a specific MAGE node in a cluster 
(given a fixed given shard key, sharding method, and topology).

This module takes care of:

  1. Routing requests within a MAGE cluster
  2. Re-balancing events, when scaling up or down the cluster;
     we will transfer your in-memory to a new MAGE node 
     whenever needed when adding or removing servers.

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
 *
 * Return a string which will be fed to the
 * hashing algorithm; this will determine which
 * server we should forward requests to
 */
function ByGameId(state: mage.core.IState, gameId: string) {
  return gameId 
}

class AnotherShardedModule extends AbstractShardedModule {
  @Shard(ByGameId)
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

Most modules you will build with `mage-module-shard` will include some
in-memory state; after all, this is the whole point of this module, to allow
application-level sharding for stateful applications (games, in MAGE's case).

This means that whenever you will be adding or removing server nodes, you will
need to move some of that data between servers; this is what is called rebalancing
in most distributed systems.

> lib/modules/stateful/index.ts

```typescript
import {
  State
} from 'mage-module-shard'

class Match {
  // Put your match data and methods in here
}

class MatchState extends State {
  public matches: Map<string, Match>
}

class StatefulModule extends AbstractShardedModule {
  public state: MatchState

  public rebalance() {
    
  }
}

export default new StatefulModule()
```

`mage-module-shard`

### Custom execution behaviors

In some cases, you might want to only use one or a limited set of MAGE
servers to execute certain modules; this may be required in cases such as
scheduling or queuing.

> lib/modules/singleInstance/index.ts

```typescript
import {
  Shard
} from 'mage-module-shard'

class SingleInstanceModule extends AbstractShardedModule {
  public state: MatchState

  public elect(nodes: Array): number {
    return -1 // Not active
  }
}

export default new SingleInstanceModule()
```

Here, we tell our MAGE cluster to only start 1 instance of
the module throughout the cluster; therefore, all traffic
for this module will always be routed to the same MAGE node 
instance in the cluster. 

Should the running instance crash, another one will be started
to replace it. 

Our `elect` method returns an instance ID to help
uniquely identify it within the cluster; 
whenever we scale the cluster, `elect` will be called,
and this ID will be used to identify which data needs to be moved
where.

License
-------

MIT

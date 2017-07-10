import * as mage from 'mage'
const {
  msgServer,
  serviceDiscovery
} = mage.core

type MmrpEnvelopeMessage = string | Buffer

/**
 * IShardedRequestMeta
 *
 * IShardedRequestMeta are used as keys to access ShardedRequest
 * instances stored in a map; they contain the information required to identify
 * the related request, and a timestamp used to determine whether a request
 * has timed out or not.
 *
 * @export
 * @interface IShardedRequestMeta
 */
export interface IShardedRequestMeta {
  id: string
  timestamp: number
}

/**
 * ShardedRequests
 *
 * @export
 * @class ShardedRequest
 */
export class ShardedRequest {
  /**
   * The event name
   *
   * Should normally be `AbstractShardedModule.REQUEST_EVENT_NAME`
   * for the class which will instanciate it
   *
   * @type {string}
   * @memberof ShardedRequest
   */
  public eventName: string

  /**
   * Target MAGE node
   *
   * @type {string[]}
   * @memberof ShardedRequest
   */
  public target: string[]

  /**
   * Method to be executed
   *
   * @type {string}
   * @memberof ShardedRequest
   */
  public method: string

  /**
   * Arguments to feed to the method
   *
   * @type {any[]}
   * @memberof ShardedRequest
   */
  public args: any[]

  /**
   * Resolve function (see `send`)
   *
   * @memberof ShardedRequest
   */
  public resolve: (data: any) => void

  /**
   * Reject function (see `send`)
   *
   * @memberof ShardedRequest
   */
  public reject: (error: Error) => void

  constructor(eventName: string, target: string[], method: string, args: any[]) {
    this.eventName = eventName
    this.target = target
    this.method = method
    this.args = args
  }

  /**
   * Send the request
   *
   * Note that the sending module is responsible for listening for the
   * response, and passing it to this request through `resolve` or
   * `reject`.
   *
   * The sending module may also call `reject` should it judge a request
   * has timed out.
   *
   * @returns
   * @memberof ShardedRequest
   */
  public async send() {
    const Envelope = msgServer.mmrp.Envelope
    const requestEnvelope = new Envelope(this.eventName, [this.method, ...this.args], this.target)

    return new Promise((resolve, reject) => {
      msgServer.getMmrpNode().send(requestEnvelope, 1, (error?: Error) => {
        if (error) {
          return reject(error)
        }

        this.resolve = resolve
        this.reject = reject
      })
    })
  }
}

/**
 * ShardFunction type
 */
export type ShardFunction = (...args: any[]) => string

/**
 * Default sharding function for the @Shard() decorator
 *
 * @export
 * @param {mage.core.IState} state
 * @returns
 */
export function ByStateActorId(state: mage.core.IState) {
  return state.actorId // Todo: if not set, run locally
}

/**
 * @Shard() decorator
 *
 * If a sharding function is not specified, the ByStateActorId
 * sharding function will be used by default.
 *
 * @export
 * @param {ShardFunction} [shardFunction=ByStateActorId]
 * @returns
 */
export function Shard(shardFunction: ShardFunction = ByStateActorId) {
  /* tslint:disable-next-line:ban-types */
  return function <T extends AbstractShardedModule> (target: T, methodName: string, descriptor: TypedPropertyDescriptor<Function>) {
    const method = descriptor.value

    if (!method) {
      throw new Error('Using the Shard decorator on an undefined method')
    }

    // Re-assign the sharded method's code - we will call this
    // directly whenever receiving remote execution requests
    // or when we detect that the request should be executed locally
    target.shardedMethods[methodName] = method

    descriptor.value = function (...args: any[]) {
      // shard
      const key = shardFunction(...args)

      // Get service node
      // if is local, run locally
      // If executed remotely, send the request, and
      // wait for a reply
    }
  }
}

export abstract class AbstractShardedModule {
  /**
   * Service name
   *
   * By default, the service name will be the name of the class
   *
   * @type {string}
   * @memberof AbstractShardedModule
   */
  public name: string

  /**
   * Request event label
   *
   * Request messages follow the following format:
   *
   * [requestId, method, ...args]
   *
   * @type {string}
   * @memberof AbstractShardedModule
   */
  public REQUEST_EVENT_NAME: string

  /**
   * Response event label
   *
   * Response messages follow the following format:
   *
   * [requestId, response, error]
   *
   * @type {string}
   * @memberof AbstractShardedModule
   */
  public RESPONSE_EVENT_NAME: string

  /**
   * Service instance
   *
   * @type {mage.core.IService}
   * @memberof AbstractShardedModule
   */
  public service: mage.core.IService

  /**
   * Sharded methods
   *
   * This will contain the executable code for sharded method,
   * while the original methods wrapped by the @Shard() decorator
   * will be responsible of deciding which MAGE node in the cluster
   * should run the code instead.
   *
   * @type {{ [name: string]: Function }}
   * @memberof AbstractShardedModule
   */
  /* tslint:disable-next-line:ban-types */
  public shardedMethods: { [name: string]: Function }

  /**
   * Pendng requests that are being executed on a remote MAGE node
   *
   * When requests are forwarded to a remote MAGE node, a reference to
   * the original request will be placed here; upon reception of
   * the response (an error or a value), the code execution
   * will then continue locally.
   *
   * Requests will timeout after a certain amount of time
   *
   * @type {Map<IShardedRequestMeta, ShardedRequest>}
   * @memberof AbstractShardedModule
   */
  public pendingRequests: Map<IShardedRequestMeta, ShardedRequest>

  /**
   * Key-value for fetching the pendingRequests
   * map key
   *
   * This is used to allow quick by-reference access to
   * pending requests stored in this.pendingRequests
   *
   * ```typescript
   * const key = this.pendingRequestsKeyMap['some-id']
   * const request = this.pendingRequests(key)
   * ```
   *
   * @memberof AbstractShardedModule
   */
  private pendingRequestsKeyMap: {
    [id: string]: IShardedRequestMeta
  }

  /**
   * Garbage collection timer reference for dealing with stalled requests
   *
   * Should requests not be replied to within a certain amount of time,
   * an error will be returned instead.
   *
   * @private
   * @type {number}
   * @memberof AbstractShardedModule
   */
  private gcTimer: NodeJS.Timer | null

  /**
   * Creates an instance of AbstractShardedModul
   *
   * @param {string} [name]
   * @memberof AbstractShardedModule
   */
  constructor(name?: string, gcTimeoutTime: number = 5 * 1000) {
    if (!name) {
      name = this.getClassName()
    }

    this.name = name
    this.REQUEST_EVENT_NAME = `sharded.${name}.request`
    this.RESPONSE_EVENT_NAME = `sharded.${name}.response`

    // Stalled requests garbage collection
    this.scheduleGarbageCollection(gcTimeoutTime)
  }

  /**
   * Setup method called by MAGE during initialization
   *
   * @param {mage.core.IState} _state
   * @param {(error?: Error) => void} callback
   * @memberof AbstractShardedModule
   */
  public async setup(_state: mage.core.IState, callback: (error?: Error) => void) {
    const {
      name,
      REQUEST_EVENT_NAME,
      RESPONSE_EVENT_NAME
    } = this

    const mmrpNode = msgServer.getMmrpNode()

    // Cluster communication - run module method locally, and forward the response
    mmrpNode.on(`delivery.${REQUEST_EVENT_NAME}`, async (requestEnvelope) => {
      const request = requestEnvelope.messages
      const requestId = request.shift()

      let responseError
      let response

      try {
        response = await this.onRequest(request)
      } catch (e) {
        responseError = e
      } finally {
        const Envelope = msgServer.mmrp.Envelope
        const messages = [requestId, response, responseError]
        const responseEnvelope = new Envelope(this.RESPONSE_EVENT_NAME, messages, requestEnvelope.returnRoute)

        msgServer.getMmrpNode().send(responseEnvelope, 1, (error?: Error) => {
          if (error) {
            // Todo: log!!!!!!
          }
        })
      }
    })

    mmrpNode.on(`delivery.${RESPONSE_EVENT_NAME}`, async (envelope) => this.onResponse(envelope.messages))

    // Service information - trigger elections and rebalances when needed
    const service = serviceDiscovery.createService(name, 'tcp')

    service.on('up', (node: mage.core.IServiceNode) => this.onNodeAdded(node))
    service.on('down', (node: mage.core.IServiceNode) => this.onNodeRemoved(node))
    service.discover()

    this.service = service

    callback()
  }

  /**
   * Retrieve the current classes's name
   *
   * @returns {string}
   * @memberof AbstractShardedModule
   */
  public getClassName(): string {
    return this.toString().split ('(' || /s+/)[0].split (' ' || /s+/)[1]
  }

  /**
   * Schedule garbage collection
   *
   * Note that this will cancel any previously scheduled GC, the timeout
   * time value passed as an argument will be used for all future GC schedulings
   *
   * @private
   * @param {number} gcTimeoutTime
   * @memberof AbstractShardedModule
   */
  public scheduleGarbageCollection(gcTimeoutTime: number) {
    if (this.gcTimer) {
      clearTimeout(this.gcTimer)
    }

    this.gcTimer = setTimeout(() => {
      // Clean up the timer reference
      this.gcTimer = null

      const now = Date.now()
      const keys = this.pendingRequests.keys()

      for (const key of keys) {
        // All other requests are valid, cancel iteration
        if (key.timestamp >= now - gcTimeoutTime) {
          break
        }

        // Reject the request
        const request = this.getAndDeletePendingRequest(key.id)
        request.reject(new Error('Request timed out'))
      }

      // Schedule next GC
      this.scheduleGarbageCollection(gcTimeoutTime)
    }, gcTimeoutTime)
  }

  /**
   *
   *
   * @private
   * @param {mage.core.IServiceNode} node
   * @memberof AbstractShardedModule
   */
  private onNodeAdded(node: mage.core.IServiceNode) {
    // Update leader - if needed
    // Leader triggers rebalance - if needed
    //
  }

  /**
   *
   *
   * @private
   * @param {mage.core.IServiceNode} node
   * @memberof AbstractShardedModule
   */
  private onNodeRemoved(node: mage.core.IServiceNode) {
    // Update leader
    // Rebalance
  }

  /**
   *
   *
   * @private
   * @param {MmrpEnvelopeMessage[]} messages
   * @returns
   * @memberof AbstractShardedModule
   */
  private async onRequest(messages: MmrpEnvelopeMessage[]) {
    const methodNameBuffer = messages.shift()

    if (!methodNameBuffer) {
      throw new Error('Method name is missing')
    }

    const methodName = methodNameBuffer.toString()
    const method = this.shardedMethods[methodName]

    if (!method) {
      throw new Error('Method is not locally available: ' + methodName)
    }

    return method.apply(this, messages)
  }

  /**
   * Process a response
   *
   * @private
   * @param {MmrpEnvelopeMessage[]} messages
   * @returns
   * @memberof AbstractShardedModule
   */
  private async onResponse(messages: MmrpEnvelopeMessage[]) {
    const [
      requestId,
      error,
      data
    ] = messages

    const request = this.getAndDeletePendingRequest(requestId.toString())

    if (error) {
      return request.reject(error)
    }

    request.resolve(data)
  }

  /**
   * Create a request, and add it to our list of pending requests
   *
   * The request is returned so that the calling code may
   * call the request's `send` method and `await` a response.
   *
   * @private
   * @param {string[]} target
   * @param {string} method
   * @param {any[]} args
   * @returns
   * @memberof AbstractShardedModule
   */
  private addPendingRequest(target: string[], method: string, args: any[]) {
    const id = '1'
    const timestamp = Date.now()

    const key: IShardedRequestMeta = { id, timestamp }
    this.pendingRequestsKeyMap[id] = key

    const request = new ShardedRequest(this.REQUEST_EVENT_NAME, target, method, args)
    this.pendingRequests.set(key, request)

    return request
  }

  /**
   * Retrieve a pending response by request ID
   *
   * @private
   * @param {string} id
   * @returns
   * @memberof AbstractShardedModule
   */
  private getPendingRequest(id: string) {
    const key = this.pendingRequestsKeyMap[id]

    if (!key) {
      throw new Error(`Key not found in request key map (id: ${id})`)
    }

    const request = this.pendingRequests.get(key)

    if (!request) {
      throw new Error(`Pending request not found (id: ${key.id}, timestamp: ${key.timestamp})`)
    }

    return request
  }

  /**
   * Delete a pending response
   *
   * This is normally called once a request has been completed,
   * or when a request has timed out.
   *
   * @private
   * @param {string} id
   * @memberof AbstractShardedModule
   */
  private deletePendingRequest(id: string) {
    const key = this.pendingRequestsKeyMap[id]

    if (!key) {
      throw new Error(`Key not found in request key map (id: ${id})`)
    }

    delete this.pendingRequestsKeyMap[id]
    this.pendingRequests.delete(key)
  }

  /**
   * Retrieve a request, by ID, then delete it from the
   * list of pending requests
   *
   * @private
   * @param {string} id
   * @returns
   * @memberof AbstractShardedModule
   */
  private getAndDeletePendingRequest(id: string) {
    const request = this.getPendingRequest(id)
    this.deletePendingRequest(id)

    return request
  }
}

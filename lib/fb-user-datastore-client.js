const FBJWTClient = require('@ministryofjustice/fb-jwt-client-node')

// endpoint urls
const endpointUrlTemplate = '/service/:serviceSlug/user/:userId.json'
const endpoints = {
  get: endpointUrlTemplate,
  set: endpointUrlTemplate
}

/**
 * Creates user datastore client
 * @class
 */
class FBUserDataStoreClient extends FBJWTClient {
  /**
   * Initialise user datastore client
   *
   * @param {string} serviceToken
   * Service token
   *
   * @param {string} userDataStoreUrl
   * User datastore URL stub
   *
   * @param {string} serviceSlug
   * Service slug
   *
   * @return {undefined}
   *
   **/
  constructor (serviceToken, userDataStoreUrl, serviceSlug) {
    class FBUserDataStoreClientError extends FBJWTClient.prototype.ErrorClass {}
    super(serviceToken, FBUserDataStoreClientError)

    if (!userDataStoreUrl) {
      this.throwRequestError('ENOUSERDATASTOREURL', 'No user datastore url passed to client')
    }
    if (!serviceSlug) {
      this.throwRequestError('ENOSERVICESLUG', 'No service slug passed to client')
    }

    this.serviceSlug = serviceSlug
    const setEndpoint = url => userDataStoreUrl + url
    this.endpoints = {
      get: setEndpoint(endpoints.get),
      set: setEndpoint(endpoints.set)
    }
  }

  /**
   * Fetch user data
   *
   * @param {string} userId
   * User ID
   *
   * @param {string} userToken
   * User token
   *
   * @return {promise<object>}
   * Promise resolving to object containing unencrypted user data
   *
   **/
  getData (userId, userToken) {
    const urlPattern = this.endpoints.get
    const serviceSlug = this.serviceSlug

    return this.sendGet(urlPattern, {serviceSlug, userId})
      .then(json => {
        const {payload} = json
        return this.decrypt(userToken, payload)
      })
  }

  /**
   * Store user data
   *
   * @param {string} userId
   * User ID
   *
   * @param {string} userToken
   * User token
   *
   * @param {object} payload
   * User data
   *
   * @return {promise<undefined>}
   *
   **/
  setData (userId, userToken, payload) {
    const urlPattern = this.endpoints.set
    const serviceSlug = this.serviceSlug

    const encryptedPayload = this.encrypt(userToken, payload)

    return this.sendPost(urlPattern, {serviceSlug, userId}, {payload: encryptedPayload})
      .then(() => {})
  }
}

module.exports = FBUserDataStoreClient

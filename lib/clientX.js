const aes256 = require('aes256')
// To ensure encrypted content never produces the same output, use module that uses an Initialization Vector (IV)

const FBJWTClient = require('./fb-jwt-client-node/client')
const {FBError} = require('@ministryofjustice/fb-utils-node')

// endpoint urls
const endpointUrlTemplate = '/service/:serviceSlug/user/:userId.json'
const endpoints = {
  get: endpointUrlTemplate,
  set: endpointUrlTemplate
}

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
    class FBUserDataStoreClientError extends FBError {}
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
   * Encrypt user data with AES 256
   *
   * @param {string} userToken
   * User token
   *
   * @param {string} payload
   * Request payload
   *
   * @return {string}
   * Encrypted payload
   *
   **/
  encryptPayload (userToken, payload) {
    const payloadString = JSON.stringify(payload)
    const encryptedPayload = aes256.encrypt(userToken, payloadString)
    return encryptedPayload
  }

  /**
   * Decrypt user data
   *
   * @param {string} userToken
   * User token
   *
   * @param {string} encryptedPayload
   * Encrypted data
   *
   * @return {string}
   * Decrypted data
   *
   **/
  decryptPayload (userToken, encryptedPayload) {
    let payload
    try {
      payload = aes256.decrypt(userToken, encryptedPayload)
      payload = JSON.parse(payload)
    } catch (e) {
      this.throwRequestError(500, 'EINVALIDPAYLOAD')
    }
    return payload
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
    const serviceSlug = this.serviceSlug
    const encryptedPayload = this.encryptPayload(userToken, {})
    const requestOptions = this.getRequestOptions(this.endpoints.get, {serviceSlug, userId}, encryptedPayload)
    requestOptions.json = true

    return this.sendGet(requestOptions)
      .then(json => {
        const {payload} = json
        return this.decryptPayload(userToken, payload)
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
    const serviceSlug = this.serviceSlug
    const encryptedPayload = this.encryptPayload(userToken, payload)
    const requestOptions = this.getRequestOptions(this.endpoints.set, {serviceSlug, userId}, encryptedPayload)
    requestOptions.json = {
      payload: encryptedPayload
    }

    return this.sendPost(requestOptions)
      .then(() => {})
  }
}

module.exports = FBUserDataStoreClient

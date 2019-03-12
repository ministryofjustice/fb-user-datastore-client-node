const FBJWTClient = require('@ministryofjustice/fb-jwt-client-node')
class FBUserDataStoreClientError extends FBJWTClient.prototype.ErrorClass {}

// endpoint urls
const endpointUrlTemplate = '/service/:serviceSlug/user/:userId'
const endpoints = {
  getData: endpointUrlTemplate,
  setData: endpointUrlTemplate
}

/**
 * Creates user datastore client
 * @class
 */
class FBUserDataStoreClient extends FBJWTClient {
  /**
   * Initialise user datastore client
   *
   * @param {string} serviceSecret
   * Service secret
   *
   * @param {string} serviceToken
   * Service token
   *
   * @param {string} serviceSlug
   * Service slug
   *
   * @param {string} userDataStoreUrl
   * User datastore URL
   *
   * @return {object}
   *
   **/
  constructor (serviceSecret, serviceToken, serviceSlug, userDataStoreUrl) {
    super(serviceSecret, serviceToken, serviceSlug, userDataStoreUrl, FBUserDataStoreClientError)
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
    const urlPattern = endpoints.getData
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
    const urlPattern = endpoints.setData
    const serviceSlug = this.serviceSlug

    const encryptedPayload = this.encrypt(userToken, payload)

    return this.sendPost(urlPattern, {serviceSlug, userId}, {payload: encryptedPayload})
      .then(() => {})
  }
}

module.exports = FBUserDataStoreClient

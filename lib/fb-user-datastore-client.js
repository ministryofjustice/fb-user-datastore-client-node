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
   * @param {object} args
   * Fetch args
   *
   * @param {string} args.userId
   * User ID
   *
   * @param {string} args.userToken
   * User token
   *
   * @param {object} logger
   * Bunyan logger instance
   *
   * @return {promise<object>}
   * Promise resolving to object containing unencrypted user data
   *
   **/
  async getData (args, logger) {
    const {userId, userToken} = args
    const url = endpoints.getData
    const serviceSlug = this.serviceSlug

    const json = await this.sendGet({
      url,
      context: {serviceSlug, userId}
    }, logger)

    const {payload} = json

    return this.decrypt(userToken, payload)
  }

  /**
   * Store user data
   *
   * @param {object} args
   * Store args
   *
   * @param {string} args.userId
   * User ID
   *
   * @param {string} args.userToken
   * User token
   *
   * @param {object} args.payload
   * User data
   *
   * @param {object} logger
   * Bunyan logger instance
   *
   * @return {promise<undefined>}
   *
   **/
  async setData (args, logger) {
    const {userId, userToken, payload} = args
    const url = endpoints.setData
    const serviceSlug = this.serviceSlug

    const encryptedPayload = this.encrypt(userToken, payload)

    await this.sendPost({
      url,
      context: {serviceSlug, userId},
      payload: {payload: encryptedPayload}
    }, logger)
  }
}

module.exports = FBUserDataStoreClient

const FBJWTClient = require('./fb-jwt-client-node/client')

// endpoint urls
const endpoints = {
  submit: '/submission',
  getStatus: '/submission/:submissionId'
}

/**
 * Creates submitter client
 * @class
 */
class FBSubmitterClient extends FBJWTClient {
  /**
   * Initialise submitter client
   *
   * @param {string} serviceToken
   * Service token
   *
   * @param {string} submitterUrl
   * User datastore URL stub
   *
   * @param {string} serviceSlug
   * Service slug
   *
   * @return {undefined}
   *
   **/
  constructor (serviceToken, submitterUrl, serviceSlug) {
    class FBSubmitterClientError extends FBJWTClient.prototype.ErrorClass {}
    super(serviceToken, FBSubmitterClientError)

    if (!submitterUrl) {
      this.throwRequestError('ENOSUBMITTERURL', 'No submitter url passed to client')
    }
    if (!serviceSlug) {
      this.throwRequestError('ENOSERVICESLUG', 'No service slug passed to client')
    }

    this.serviceSlug = serviceSlug
    const setEndpoint = url => submitterUrl + url
    this.endpoints = {
      submit: setEndpoint(endpoints.submit),
      getStatus: setEndpoint(endpoints.getStatus)
    }
  }

  /**
   * Get status of submission
   *
   * @param {string} submissionId
   * Submission ID
   *
   * @return {promise<object>}
   * Promise resolving to object containing submission status
   *
   **/
  getStatus (submissionId) {
    const urlPattern = this.endpoints.getStatus
    // const serviceSlug = this.serviceSlug

    return this.sendGet(urlPattern, {submissionId})
  }

  /**
   * Encrypt user ID and token using service token
   *
   * @param {string} userId
   * User ID
   *
   * @param {string} userToken
   * User token
   *
   * @return {string}
   *
   **/
  encryptUserIdAndToken (userId, userToken) {
    const serviceToken = this.serviceToken
    return this.encrypt(serviceToken, {userId, userToken})
  }

  /**
   * Decrypt user ID and token using service token
   *
   * @param {string} encryptedData
   * Encrypted user ID and token
   *
   * @return {object}
   *
   **/
  decryptUserIdAndToken (encryptedData) {
    const serviceToken = this.serviceToken
    return this.decrypt(serviceToken, encryptedData)
  }

  /**
   * Submit user data
   *
   * @param {string} userId
   * User ID
   *
   * @param {string} userToken
   * User token
   *
   * @param {array} submissions
   * List of output instructions
   *
   * @return {promise<undefined>}
   *
   **/
  submit (userId, userToken, submissions) {
    const urlPattern = this.endpoints.submit

    /* eslint-disable camelcase */
    const service_slug = this.serviceSlug
    const encrypted_user_id_and_token = this.encryptUserIdAndToken(userId, userToken)
    /* eslint-enable camelcase */

    const instructions = Object.assign({
      service_slug,
      encrypted_user_id_and_token
    }, {
      submissions
    })

    return this.sendPost(urlPattern, {}, instructions)
      .then(() => {})
  }
}

module.exports = FBSubmitterClient

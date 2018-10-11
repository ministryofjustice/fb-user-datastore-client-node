const request = require('request-promise-native')
const jwt = require('jsonwebtoken')
const pathToRegexp = require('path-to-regexp')

const {FBError} = require('@ministryofjustice/fb-utils-node')
class FBJWTClientError extends FBError {}

// algo to encrypt user data with
const algorithm = 'HS256'

class FBJWTClient {
  constructor (errorClass) {
    this.ErrorClass = errorClass || FBJWTClientError
    this.vars = {}
    this.endpoints = {}
  }

  /**
 * Convenience function for throwing FBUserDataStoreClientError errors
 *
 * @param {number|string} code
 * Error code
 *
 * @param {string} [message]
 * Error message (defaults to code)
 *
 * @return {undefined}
 * Returns nothing as it should throw an error
 *
 **/
  throwRequestError (code, message) {
    message = message || code
    throw new this.ErrorClass({
      message,
      error: {
        code
      }
    })
  }

  /**
   * Generate access token
   *
   * Throws ENOSERVICETOKEN error if client has not been initialised with the service's service token
   *
   * @param {string} [payload]
   * Request payload
   *
   * @return {string}
   * Access token
   *
   **/
  generateAccessToken (payload) {
    if (!this.vars.serviceToken) {
      this.throwRequestError('ENOSERVICETOKEN', 'No service token passed to user datastore client')
    }
    // NB. jsonwebtoken helpfully sets ‘iat’ option by default
    const accessToken = jwt.sign({payload}, this.vars.serviceToken, {algorithm})
    return accessToken
  }

  /**
   * Create user-specific endpoint
   *
   * @param {string} type
   * endpoint type
   *
   * @param {object} keys
   * Object of values to substitute
   *
   * @return {string}
   * Endpoint URL
   *
   **/
  getEndpointUrl (type, keys) {
    const urlPattern = this.endpoints[type]
    const urlKeys = Object.assign({}, this.vars, keys)
    const toPath = pathToRegexp.compile(urlPattern)
    return toPath(urlKeys)
  }

  /**
   * Create request options
   *
   * @param {string} type
   * get or set
   *
   * @param {string} urlKeys
   * User ID
   *
   * @param {string} encryptedPayload
   * Encrypted payload
   *
   * @return {object}
   * Request options
   *
   **/
  getRequestOptions (type, urlKeys, encryptedPayload) {
    const accessToken = this.generateAccessToken(encryptedPayload)
    const url = this.getEndpointUrl(type, urlKeys)
    const requestOptions = {
      url,
      headers: {
        'x-access-token': accessToken
      }
    }
    return requestOptions
  }

  /**
   * Handle client get requests
   *
   * @param {object} options
   * Request options
   *
   * @return {object}
   * Returns JSON object or handles exception
   *
   **/
  sendGet (options) {
    const that = this
    return request.get(options)
      .catch(e => that.handleRequestError(e))
  }

  /**
   * Handle client post requests
   *
   * @param {object} options
   * Request options
   *
   * @return {object}
   * Returns JSON object or handles exception
   *
   **/
  sendPost (options) {
    const that = this
    return request.post(options)
      .catch(e => that.handleRequestError(e))
  }

  /**
   * Handle client response errors
   *
   * @param {object} err
   * Error returned by Request
   *
   * @return {undefined}
   * Returns nothing as it should throw an error
   *
   **/
  handleRequestError (err) {
    if (err.name === this.ErrorClass.name) {
      throw err
    }
    const {statusCode} = err
    if (statusCode) {
      if (statusCode === 404) {
        // Data does not exist - ie. expired
        this.throwRequestError(404)
      } else {
        this.throwRequestError(statusCode)
      }
    } else if (err.error) {
      const code = err.error.code || 'EUNSPECIFIED'
      let statusCode = 500
      if (code === 'ENOTFOUND') {
        // no dns resolution
        statusCode = 502
      } else if (code === 'ECONNREFUSED') {
        // connection rejected
        statusCode = 503
      }
      this.throwRequestError(statusCode, code)
      // Handle errors that have not been specified
    } else {
      // Handle errors which have no error object
      this.throwRequestError(500, 'ENOERROR')
    }
  }
}

module.exports = FBJWTClient

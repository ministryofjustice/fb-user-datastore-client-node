const request = require('request-promise-native')
const jwt = require('jsonwebtoken')
const pathToRegexp = require('path-to-regexp')
const aes256 = require('aes256')
// To ensure encrypted content never produces the same output, use module that uses an Initialization Vector (IV)

const {FBError} = require('@ministryofjustice/fb-utils-node')
class FBJWTClientError extends FBError {}

// algo to encrypt user data with
const algorithm = 'HS256'

/**
 * Creates client using JSON Web Tokens
 * @class
 */
class FBJWTClient {
  /**
   * Initialise client
   *
   * @param {string} serviceToken
   * Service token
   *
   * @param {error} [errorClass]
   * Error class (defaults to FBJWTClientError)
   *
   * @return {object}
   **/
  constructor (serviceToken, errorClass) {
    if (errorClass) {
      this.ErrorClass = errorClass
    }
    if (!serviceToken) {
      this.throwRequestError('ENOSERVICETOKEN', 'No service token passed to client')
    }

    this.serviceToken = serviceToken
  }

  /**
   * Convenience function for throwing errors
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
   * @param {string} [payload]
   * Request payload
   *
   * @return {string}
   * Access token
   *
   **/
  generateAccessToken (payload) {
    // NB. jsonwebtoken helpfully sets ‘iat’ option by default
    const accessToken = jwt.sign(payload, this.serviceToken, {algorithm})
    return accessToken
  }

  /**
   * Encrypt data with AES 256
   *
   * @param {string} token
   * Token
   *
   * @param {string} data
   * Request data
   *
   * @return {string}
   * Encrypted data
   *
   **/
  encrypt (token, data) {
    const dataString = JSON.stringify(data)
    const encryptedData = aes256.encrypt(token, dataString)
    return encryptedData
  }

  /**
   * Decrypt` data
   *
   * @param {string} token
   * Token
   *
   * @param {string} encryptedData
   * Encrypted data
   *
   * @return {string}
   * Decrypted data
   *
   **/
  decrypt (token, encryptedData) {
    let data
    try {
      data = aes256.decrypt(token, encryptedData)
      data = JSON.parse(data)
    } catch (e) {
      this.throwRequestError(500, 'EINVALIDPAYLOAD')
    }
    return data
  }

  /**
   * Create user-specific endpoint
   *
   * @param {string} urlPattern
   * Uncompiled pathToRegexp url pattern
   *
   * @param {object} urlKeys
   * Object of values to substitute
   *
   * @return {string}
   * Endpoint URL
   *
   **/
  getEndpointUrl (urlPattern, urlKeys = {}) {
    const toPath = pathToRegexp.compile(urlPattern)
    return toPath(urlKeys)
  }

  /**
   * Create request options
   *
   * @param {string} urlPattern
   * Uncompiled pathToRegexp url pattern
   *
   * @param {string} urlKeys
   * User ID
   *
   * @param {object} [payload]
   * Payload
   *
   * @return {object}
   * Request options
   *
   **/
  createRequestOptions (urlPattern, urlKeys, payload = {}) {
    const accessToken = this.generateAccessToken(payload)
    const url = this.getEndpointUrl(urlPattern, urlKeys)
    const json = Object.keys(payload).length ? payload : true
    const requestOptions = {
      url,
      headers: {
        'x-access-token': accessToken
      },
      json
    }
    return requestOptions
  }

  /**
   * Handle client get requests
   *
   * @param {string} urlPattern
   * Url pattern for request
   *
   * @param {object} urlKeys
   * Keys for url pattern substitution
   *
   * @return {object}
   * Returns JSON object or handles exception
   *
   **/
  sendGet (urlPattern, urlKeys) {
    const client = this
    const options = this.createRequestOptions(urlPattern, urlKeys)
    return request.get(options)
      .catch(e => client.handleRequestError(e))
  }

  /**
   * Handle client post requests
   *
   * @param {string} urlPattern
   * Url pattern for request
   *
   * @param {object} urlKeys
   * Keys for url pattern substitution
   *
   * @param {object} payload
   * Payload to post to endpoint
   *
   * @return {object}
   * Returns JSON object or handles exception
   *
   **/
  sendPost (urlPattern, urlKeys, payload) {
    const client = this
    const options = this.createRequestOptions(urlPattern, urlKeys, payload)
    return request.post(options)
      .catch(e => client.handleRequestError(e))
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
    // rethrow error if already client error
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

// default client error class
FBJWTClient.prototype.ErrorClass = FBJWTClientError

module.exports = FBJWTClient

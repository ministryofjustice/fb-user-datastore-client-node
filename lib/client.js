const request = require('request-promise-native')
const jwt = require('jsonwebtoken')
const aes256 = require('aes256')
// To ensure encrypted content never produces the same output, use module that uses an Initialization Vector (IV)

const {FBError} = require('@ministryofjustice/fb-utils-node')
class FBUserDataStoreClientError extends FBError {}

// algo to encrypt user data with
const algorithm = 'HS256'

// endpoint urls
const endpointUrlTemplate = '/service/{serviceSlug}/user/{userId}.json'
const endpoints = {
  get: endpointUrlTemplate,
  set: endpointUrlTemplate
}

// service token is set via init method
let serviceToken

// object to export
const external = {}

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
const throwRequestError = (code, message) => {
  message = message || code
  throw new FBUserDataStoreClientError({
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
external.generateAccessToken = (payload) => {
  if (!serviceToken) {
    throwRequestError('ENOSERVICETOKEN', 'No service token passed to user datastore client')
  }
  // NB. jsonwebtoken helpfully sets ‘iat’ option by default
  const accessToken = jwt.sign({payload}, serviceToken, {algorithm})
  return accessToken
}

/**
 * Encrypt user data with AES 256
 *
 * @param {string} payload
 * Request payload
 *
 * @param {string} userToken
 * User token
 *
 * @return {string}
 * Encrypted payload
 *
 **/
external.encryptPayload = (payload, userToken) => {
  const payloadString = JSON.stringify(payload)
  const encryptedPayload = aes256.encrypt(userToken, payloadString)
  return encryptedPayload
}

/**
 * Decrypt user data
 *
 * @param {string} encryptedPayload
 * Encrypted data
 *
 * @param {string} userToken
 * User token
 *
 * @return {string}
 * Decrypted data
 *
 **/
external.decryptPayload = (encryptedPayload, userToken) => {
  let payload
  try {
    payload = aes256.decrypt(userToken, encryptedPayload)
    payload = JSON.parse(payload)
  } catch (e) {
    //
  }
  return payload
}

/**
 * Create user-specific endpoint
 *
 * @param {string} type
 * get or set
 *
 * @param {string} userId
 * User ID
 *
 * @return {string}
 * Endpoint URL
 *
 **/
external.getUserEndpointUrl = (type, userId) => {
  const url = endpoints[type]
  return url.replace(/\{userId\}/, userId)
}

/**
 * Create request options
 *
 * @param {string} type
 * get or set
 *
 * @param {string} userId
 * User ID
 *
 * @param {string} encryptedPayload
 * Encrypted payload
 *
 * @return {object}
 * Request options
 *
 **/
const getRequestOptions = (type, userId, encryptedPayload) => {
  const accessToken = external.generateAccessToken(encryptedPayload)
  const url = external.getUserEndpointUrl(type, userId)
  const requestOptions = {
    url,
    headers: {
      'x-access-token': accessToken
    }
  }
  return requestOptions
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
const handleRequestError = (err) => {
  const {statusCode} = err
  if (statusCode) {
    if (statusCode === 404) {
      // Data does not exist - ie. expired
      throwRequestError(404)
    } else {
      throwRequestError(statusCode)
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
    throwRequestError(statusCode, code)
    // Handle errors that have not been specified
  } else {
    // Handle errors which have no error object
    throwRequestError(500, 'ENOERROR')
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
external.get = async (userId, userToken) => {
  const encryptedPayload = external.encryptPayload({}, userToken)
  const requestOptions = getRequestOptions('get', userId, encryptedPayload)

  return request.get(requestOptions)
    .then(body => {
      const {payload} = body
      return external.decryptPayload(payload, userToken)
    })
    .catch(handleRequestError)
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
external.set = (userId, userToken, payload) => {
  const encryptedPayload = external.encryptPayload(payload, userToken)
  const requestOptions = getRequestOptions('set', userId, encryptedPayload)
  requestOptions.form = {
    payload: encryptedPayload
  }

  return request.post(requestOptions)
    .then(() => {})
    .catch(handleRequestError)
}

/**
 * Initialise user datastore client
 *
 * @param {string} serviceSlug
 * Service slug
 *
 * @param {string} sToken
 * Service token
 *
 * @param {string} userDataStoreUrl
 * User datastore URL stub
 *
 * @return {undefined}
 *
 **/
external.init = (serviceSlug, sToken, userDataStoreUrl) => {
  serviceToken = sToken
  const setEndpoint = (url) => {
    url = url.replace(/\{serviceSlug\}/, serviceSlug)
    url = userDataStoreUrl + url
    return url
  }
  endpoints.get = setEndpoint(endpoints.get)
  endpoints.set = setEndpoint(endpoints.set)
}

module.exports = external

/* eslint-disable prefer-promise-reject-errors */

const test = require('tape')
const {stub, useFakeTimers} = require('sinon')

const jwt = require('jsonwebtoken')

const request = require('request-promise-native')

const FBJWTClient = require('./client')

/* test values */
const userId = 'testUserId'
const userToken = 'testUserToken'
const serviceSlug = 'testServiceSlug'
const serviceToken = 'testServiceToken'
const microserviceUrl = 'https://microservice'
const getEndpointUrl = `${microserviceUrl}/service/${serviceSlug}/user/${userId}`
const data = {foo: 'bar'}
const encryptedData = 'RRqDeJRQlZULKx1NYql/imRmDsy9AZshKozgLuY='

// Ensure that client is properly instantiated

/**
 * Convenience function for testing client instantiation
 *
 * @param {object} t
 *  Object containing tape methods
 *
 * @param {array} params
 *  Arguments to pass to client constructor
 *
 * @param {string} expectedCode
 *  Error code expected to be returned by client
 *
 * @param {string} expectedMessage
 *  Error message expected to be returned by client
 *
 * @return {undefined}
 *
 **/
const testInstantiation = (t, params, expectedCode, expectedMessage) => {
  t.plan(4)

  let failedClient
  try {
    failedClient = new FBJWTClient(...params)
  } catch (e) {
    t.equal(e.name, 'FBJWTClientError', 'it should return an error of the correct type')
    t.equal(e.code, expectedCode, 'it should return the correct error code')
    t.equal(e.message, expectedMessage, 'it should return the correct error message')
  }
  t.equal(failedClient, undefined, 'it should not return an instantiated client')
}

test('When instantiating client without a service token', t => {
  testInstantiation(t, [], 'ENOSERVICETOKEN', 'No service token passed to client')
})

// Set up a client to test the methods
const jwtClient = new FBJWTClient(serviceToken)

// Endpoint URLs
test('When asking for endpoint urls', t => {
  const getUrl =
  jwtClient.getEndpointUrl(`${microserviceUrl}/service/:serviceSlug/user/:userId`, {serviceSlug, userId})
  t.equal(getUrl, getEndpointUrl, 'it should return the correct value for the get endpoint')

  t.end()
})

// JWT
test('When generating json web token', async t => {
  const clock = useFakeTimers({
    now: 1483228800000
  })
  const accessToken = jwtClient.generateAccessToken({data: 'testData'})
  const decodedAccessToken = jwt.verify(accessToken, serviceToken)
  t.equal(decodedAccessToken.data, 'testData', 'it should output a token containing the data')
  t.equal(decodedAccessToken.iat, 1483228800, 'it should output a token containing the iat property')

  clock.restore()
  t.end()
})

// Decrypting user data
test('When decrypting data', async t => {
  const decryptedData = jwtClient.decrypt(userToken, encryptedData)
  t.deepEqual(data, decryptedData, 'it should return the correct data from valid encrypted input')

  t.end()
})

test('When decrypting invalid data', async t => {
  t.plan(4)
  let invalidData
  try {
    invalidData = jwtClient.decrypt(userToken, 'invalid')
  } catch (e) {
    t.equal(e.name, 'FBJWTClientError', 'it should return an error object of the correct type')
    t.equal(e.code, 500, 'it should return correct error code')
    t.equal(e.message, 'EINVALIDPAYLOAD', 'it should return the correct error message')
  }
  t.equal(invalidData, undefined, 'it should not return anything if data is invalid')

  t.end()
})

// Encrypting data
test('When encrypting data', async t => {
  const encryptedData = jwtClient.encrypt(userToken, data)
  const decryptedData = jwtClient.decrypt(userToken, encryptedData)
  t.deepEqual(data, decryptedData, 'it should encrypt the data correctly')
  // NB. have to decrypt the encryptedData to check
  // since the Initialization Vector guarantees the output will be different each time

  const encryptedDataAgain = jwtClient.encrypt(userToken, data)
  t.notEqual(encryptedDataAgain, encryptedData, 'it should not return the same value for the same input')

  t.end()
})

// Sending gets
test('When sending gets', async t => {
  t.plan(3)

  const stubAccessToken = stub(jwtClient, 'generateAccessToken')
  stubAccessToken.callsFake(() => 'testAccessToken')
  const stubRequest = stub(request, 'get')
  stubRequest.callsFake(options => {
    return Promise.resolve(data)
  })

  const fetchedData = await jwtClient.sendGet('/user/:userId', {userId})

  const callArgs = stubRequest.getCall(0).args[0]

  t.equal(callArgs.url, '/user/testUserId', 'it should call the correct url')
  t.equal(callArgs.headers['x-access-token'], 'testAccessToken', 'it should add the correct x-access-token header')
  t.deepEqual(fetchedData, data, 'it should return the unencrypted data')

  stubAccessToken.restore()
  stubRequest.restore()
  t.end()
})

// Sending posts
test('When sending posts', async t => {
  t.plan(4)

  const stubRequest = stub(request, 'post')
  stubRequest.callsFake(options => {
    return Promise.resolve({
      response: 'body'
    })
  })

  const generateAccessTokenStub = stub(jwtClient, 'generateAccessToken')
  generateAccessTokenStub.callsFake(() => 'accessToken')

  const responseBody = await jwtClient.sendPost('/user/:userId', {userId}, data)
  // jwtClient.setData(userId, userToken, data)

  const callArgs = stubRequest.getCall(0).args[0]
  t.equal(callArgs.url, '/user/testUserId', 'it should call the correct url')
  t.deepEqual(callArgs.json, data, 'it should post the correct data')
  t.equal(callArgs.headers['x-access-token'], 'accessToken', 'it should add the x-access-token header')

  t.deepEqual(responseBody, {response: 'body'}, 'it should return the response’s content')

  stubRequest.restore()
  generateAccessTokenStub.restore()
  t.end()
})

/**
 * Convenience function for testing client error handling
 *
 * Stubs request[stubMethod], creates error object response and tests
 * - error name
 * - error code
 * - error message
 * - data is undefined
 *
 * @param {function} clientMethod
 *  Function providing call to client method to execute with args pre-populated
 *
 * @param {string} stubMethod
 *  Request method to stub
 *
 * @param {object} t
 *  Object containing tape methods
 *
 * @param {number|string} requestErrorCode
 *  Error code or status code returned by request
 *
 * @param {number} [applicationErrorCode]
 *  Error code expoected to be thrown by client (defaults to requestErrorCode)
 *
 * @param {number} [expectedRequestErrorCode]
 *  Error code expoected to be thrown if no code is returned by client (defaults to requestErrorCode)
 *
 * @return {undefined}
 *
 **/
const testError = async (clientMethod, stubMethod, t, requestErrorCode, applicationErrorCode, expectedRequestErrorCode) => {
  applicationErrorCode = applicationErrorCode || requestErrorCode

  const error = {}

  if (typeof requestErrorCode === 'string') {
    error.error = {
      code: requestErrorCode
    }
  } else {
    error.statusCode = requestErrorCode
  }

  expectedRequestErrorCode = expectedRequestErrorCode || requestErrorCode

  const stubRequest = stub(request, stubMethod)
  stubRequest.callsFake(options => {
    return Promise.reject(error)
  })

  t.plan(4)
  let decryptedData
  try {
    decryptedData = await clientMethod()
  } catch (e) {
    t.equal(e.name, 'FBJWTClientError', 'it should return an error object of the correct type')
    t.equal(e.code, applicationErrorCode, `it should return correct error code (${applicationErrorCode})`)
    t.equal(e.message, expectedRequestErrorCode, `it should return the correct error message (${expectedRequestErrorCode})`)
  }
  t.equal(decryptedData, undefined, 'it should not return a value for the data')

  stubRequest.restore()
}

// Convenience function for testing client's sendGet method - calls generic testError function
// Params same as for testError, minus the clientMethod and stubMethod ones
const testGetError = async (t, requestErrorCode, applicationErrorCode, expectedRequestErrorCode) => {
  const clientMethod = async () => {
    return jwtClient.sendGet('/url', {})
  }
  testError(clientMethod, 'get', t, requestErrorCode, applicationErrorCode, expectedRequestErrorCode)
}

// Convenience function for testing client's sendPost method - calls generic testError function
// Params same as for testError, minus the clientMethod and stubMethod one
const testPostError = async (t, requestErrorCode, applicationErrorCode, expectedRequestErrorCode) => {
  const clientMethod = async () => {
    return jwtClient.sendPost('/url', {}, data)
  }
  testError(clientMethod, 'post', t, requestErrorCode, applicationErrorCode, expectedRequestErrorCode)
}

// Test all the errors for jwtClient.sendGet

test('When requesting a resource that does not exist', async t => {
  testGetError(t, 404)
})

test('When making an unauthorized get request', async t => {
  testGetError(t, 401)
})

test('When making an invalid get request', async t => {
  testGetError(t, 403)
})

test('When get endpoint cannot be reached', async t => {
  testGetError(t, 'ECONNREFUSED', 503)
})

test('When dns resolution for get endpoint fails', async t => {
  testGetError(t, 'ENOTFOUND', 502)
})

test('When making a get request and an unspecified error code is returned', async t => {
  testGetError(t, 'EMADEUP', 500)
})

test('When making a get request and an error object without error code is returned', async t => {
  testGetError(t, '', 500, 'EUNSPECIFIED')
})

test('When making a get request and an error occurs but no error code is present', async t => {
  testGetError(t, undefined, 500, 'ENOERROR')
})

// Test all the errors for jwtClient.sendPost

test('When making an unauthorized post request', async t => {
  testPostError(t, 401)
})

test('When making an invalid post request', async t => {
  testPostError(t, 403)
})

test('When post endpoint cannot be reached', async t => {
  testPostError(t, 'ECONNREFUSED', 503)
})

test('When dns resolution for post endpoint fails', async t => {
  testPostError(t, 'ENOTFOUND', 502)
})

test('When making a post request and an unspecified error code is returned', async t => {
  testPostError(t, 'EMADEUP', 500)
})

test('When making a post request and an error object without error code is returned', async t => {
  testPostError(t, '', 500, 'EUNSPECIFIED')
})

test('When making a post request and an error occurs but no error code is present', async t => {
  testPostError(t, undefined, 500, 'ENOERROR')
})

// Rethrow errors

test('When client handles an error that it created', async t => {
  const thrown = new jwtClient.ErrorClass('Boom', {error: {code: 'EBOOM'}})
  try {
    jwtClient.handleRequestError(thrown)
  } catch (e) {
    t.equal(e, thrown, 'it should rethrow the error as is')
  }
  t.end()
})

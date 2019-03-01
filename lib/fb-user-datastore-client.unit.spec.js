/* eslint-disable prefer-promise-reject-errors */

const test = require('tape')
const {stub, useFakeTimers} = require('sinon')

const jwt = require('jsonwebtoken')

const request = require('request-promise-native')

const FBUserDataStoreClient = require('./fb-user-datastore-client')

/* test values */
const userId = 'testUserId'
const userToken = 'testUserToken'
const serviceSlug = 'testServiceSlug'
const serviceToken = 'testServiceToken'
const serviceSecret = 'testServiceSecret'
const userDataStoreUrl = 'https://userdatastore'
const createEndpointUrl = `${userDataStoreUrl}/service/${serviceSlug}/user/${userId}`
const setEndpointUrl = createEndpointUrl
const payload = {foo: 'bar'}
const encryptedPayload = 'RRqDeJRQlZULKx1NYql/imRmDsy9AZshKozgLuY='

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
    failedClient = new FBUserDataStoreClient(...params)
  } catch (e) {
    t.equal(e.name, 'FBUserDataStoreClientError', 'it should return an error of the correct type')
    t.equal(e.code, expectedCode, 'it should return the correct error code')
    t.equal(e.message, expectedMessage, 'it should return the correct error message')
  }
  t.equal(failedClient, undefined, 'it should not return an instantiated client')
}

test('When instantiating user datastore client without a service token', t => {
  testInstantiation(t, [], 'ENOSERVICETOKEN', 'No service token passed to client')
})

test('When instantiating user datastore client without a service slug', t => {
  testInstantiation(t, [serviceToken], 'ENOSERVICESLUG', 'No service slug passed to client')
})

test('When instantiating user datastore client without a user datastore url', t => {
  testInstantiation(t, [serviceToken, serviceSlug], 'ENOMICROSERVICEURL', 'No microservice url passed to client')
})

test('When instantiating user datastore client without a service secret', t => {
  testInstantiation(t, [serviceToken, serviceSlug, userDataStoreUrl], 'ENOSERVICESECRET', 'No service secret passed to client')
})

// Set up a client to test the methods
const userDataStoreClient = new FBUserDataStoreClient(serviceToken, serviceSlug, userDataStoreUrl, serviceSecret)

// Endpoint URLs
test('When asking for endpoint urls', t => {
  const getUrl =
  userDataStoreClient.createEndpointUrl('/service/:serviceSlug/user/:userId', {serviceSlug, userId})
  t.equal(getUrl, createEndpointUrl, 'it should return the correct value for the get endpoint')
  const setUrl =
  userDataStoreClient.createEndpointUrl('/service/:serviceSlug/user/:userId', {serviceSlug, userId})
  t.equal(setUrl, setEndpointUrl, 'it should return the correct value for the set endpoint')

  t.end()
})

// JWT
test('When generating json web token', async t => {
  const clock = useFakeTimers({
    now: 1483228800000
  })
  const accessToken = userDataStoreClient.generateAccessToken({payload: 'testPayload'})
  const decodedAccessToken = jwt.verify(accessToken, serviceToken)
  t.equal(decodedAccessToken.payload, 'testPayload', 'it should output a token containing the payload')
  t.equal(decodedAccessToken.iat, 1483228800, 'it should output a token containing the iat property')

  clock.restore()
  t.end()
})

// Decrypting user data
test('When decrypting the user’s data', async t => {
  const decryptedPayload = userDataStoreClient.decrypt(userToken, encryptedPayload)
  t.deepEqual(payload, decryptedPayload, 'it should return the correct payload from valid encrypted input')

  t.end()
})

test('When decrypting invalid data', async t => {
  t.plan(4)
  let invalidPayload
  try {
    invalidPayload = userDataStoreClient.decrypt(userToken, 'invalid')
  } catch (e) {
    t.equal(e.name, 'FBUserDataStoreClientError', 'it should return an error object of the correct type')
    t.equal(e.code, 500, 'it should return correct error code')
    t.equal(e.message, 'EINVALIDPAYLOAD', 'it should return the correct error message')
  }
  t.equal(invalidPayload, undefined, 'it should not return anything if payload is invalid')

  t.end()
})

// Encrypting user data
test('When encrypting the user’s data', async t => {
  const encryptedPayload = userDataStoreClient.encrypt(userToken, payload)
  const decryptedPayload = userDataStoreClient.decrypt(userToken, encryptedPayload)
  t.deepEqual(payload, decryptedPayload, 'it should encrypt the payload correctly')
  // NB. have to decrypt the encryptedPayload to check
  // since the Initialization Vector guarantees the output will be different each time

  const encryptedPayloadAgain = userDataStoreClient.encrypt(userToken, payload)
  t.notEqual(encryptedPayloadAgain, encryptedPayload, 'it should not return the same value for the same input')

  t.end()
})

// Fetching user data
test('When requesting user data that exists with a valid key', async t => {
  t.plan(3)

  const stubRequest = stub(request, 'get')
  stubRequest.callsFake(options => {
    return Promise.resolve({
      iat: 23232323,
      payload: encryptedPayload
    })
  })

  const decryptedPayload = await userDataStoreClient.getData(userId, userToken)

  const callArgs = stubRequest.getCall(0).args[0]
  t.equal(callArgs.url, createEndpointUrl, 'it should call the correct url')
  t.ok(callArgs.headers['x-access-token'], 'it should add the x-access-token header')

  t.deepEqual(decryptedPayload, payload, 'it should return the unencrypted data')

  stubRequest.restore()
  t.end()
})

// Storing user data
test('When updating user data', async t => {
  t.plan(4)

  const stubRequest = stub(request, 'post')
  stubRequest.callsFake(options => {
    return Promise.resolve('')
  })
  const encryptStub = stub(userDataStoreClient, 'encrypt')
  encryptStub.callsFake(() => encryptedPayload)
  const generateAccessTokenStub = stub(userDataStoreClient, 'generateAccessToken')
  generateAccessTokenStub.callsFake(() => 'accessToken')

  const responseBody = await userDataStoreClient.setData(userId, userToken, payload)

  const callArgs = stubRequest.getCall(0).args[0]
  t.equal(callArgs.url, setEndpointUrl, 'it should call the correct url')
  t.equal(callArgs.json.payload, encryptedPayload, 'it should post the correct payload')
  t.equal(callArgs.headers['x-access-token'], 'accessToken', 'it should add the x-access-token header')

  t.equal(responseBody, undefined, 'it should return no content')

  stubRequest.restore()
  encryptStub.restore()
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
 * - payload is undefined
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
  let decryptedPayload
  try {
    decryptedPayload = await clientMethod()
  } catch (e) {
    t.equal(e.name, 'FBUserDataStoreClientError', 'it should return an error object of the correct type')
    t.equal(e.code, applicationErrorCode, `it should return correct error code (${applicationErrorCode})`)
    t.equal(e.message, expectedRequestErrorCode, `it should return the correct error message (${expectedRequestErrorCode})`)
  }
  t.equal(decryptedPayload, undefined, 'it should not return a value for the payload')

  stubRequest.restore()
}

// Convenience function for testing client's getData method - calls generic testError function
// Params same as for testError, minus the clientMethod and stubMethod ones
const testGetError = async (t, requestErrorCode, applicationErrorCode, expectedRequestErrorCode) => {
  const clientMethod = async () => {
    return userDataStoreClient.getData(userId, userToken)
  }
  testError(clientMethod, 'get', t, requestErrorCode, applicationErrorCode, expectedRequestErrorCode)
}

// Convenience function for testing client's setData method - calls generic testError function
// Params same as for testError, minus the clientMethod and stubMethod one
const testSetError = async (t, requestErrorCode, applicationErrorCode, expectedRequestErrorCode) => {
  const clientMethod = async () => {
    return userDataStoreClient.setData(userId, userToken, payload)
  }
  testError(clientMethod, 'post', t, requestErrorCode, applicationErrorCode, expectedRequestErrorCode)
}

// Test all the errors for userDataStoreClient.getData

test('When requesting user data that does not exist', async t => {
  testGetError(t, 404)
})

test('When making an unauthorized request for user data', async t => {
  testGetError(t, 401)
})

test('When making an invalid request for user data', async t => {
  testGetError(t, 403)
})

test('When requesting user data but the user datastore cannot be reached', async t => {
  testGetError(t, 'ECONNREFUSED', 503)
})

test('When requesting user data but dns resolution for user datastore fails', async t => {
  testGetError(t, 'ENOTFOUND', 502)
})

test('When an unspecified error code is returned', async t => {
  testGetError(t, 'EMADEUP', 500)
})

test('When an an error object without error code is returned', async t => {
  testGetError(t, '', 500, 'EUNSPECIFIED')
})

test('When an error occurs but not error code is present', async t => {
  testGetError(t, undefined, 500, 'ENOERROR')
})

// Test all the errors for userDataStoreClient.setData

test('When making an unauthorized attempt to update user data', async t => {
  testSetError(t, 401)
})

test('When making an invalid attemp to update user data', async t => {
  testSetError(t, 403)
})

test('When updating user data but the datastore cannot be reached', async t => {
  testSetError(t, 'ECONNREFUSED', 503)
})

test('When updating user data but dns resolution for user datastore fails', async t => {
  testSetError(t, 'ENOTFOUND', 502)
})

test('When updating user data and an unspecified error code is returned', async t => {
  testSetError(t, 'EMADEUP', 500)
})

test('When updating user data and an error object without error code is returned', async t => {
  testSetError(t, '', 500, 'EUNSPECIFIED')
})

test('When updating user data and an error occurs but not error code is present', async t => {
  testSetError(t, undefined, 500, 'ENOERROR')
})

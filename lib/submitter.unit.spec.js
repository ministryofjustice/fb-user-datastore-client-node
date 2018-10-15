/* eslint-disable prefer-promise-reject-errors */

const test = require('tape')
const {stub, useFakeTimers} = require('sinon')

const jwt = require('jsonwebtoken')

const request = require('request-promise-native')

const FBSubmitterClient = require('./submitter')

/* test values */
const userId = 'testUserId'
const submissionId = 'testSubmissionId'
const userToken = 'testUserToken'
const serviceSlug = 'testServiceSlug'
const serviceToken = 'testServiceToken'
const submitterUrl = 'https://submitter'
const submissionEndpointUrl = `${submitterUrl}/submission`
const statusEndpointUrl = `${submitterUrl}/submission/testSubmissionId`
const userIdTokenData = {userId, userToken}
const encryptedUserIdTokenData = 'OkwkDtpmItpQVfreeQqdYGf3XPKs1M5mftF1IgJnNH5Eq+xRALHE+tNPa8doa8nGZ1xKgDGKag1HL0Luh5i22zAuSw=='

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
    failedClient = new FBSubmitterClient(...params)
  } catch (e) {
    t.equal(e.name, 'FBSubmitterClientError', 'it should return an error of the correct type')
    t.equal(e.code, expectedCode, 'it should return the correct error code')
    t.equal(e.message, expectedMessage, 'it should return the correct error message')
  }
  t.equal(failedClient, undefined, 'it should not return an instantiated client')
}

test('When instantiating submitter client without a service token', t => {
  testInstantiation(t, [], 'ENOSERVICETOKEN', 'No service token passed to client')
})

test('When instantiating submitter client without a submitter url', t => {
  testInstantiation(t, [serviceToken], 'ENOSUBMITTERURL', 'No submitter url passed to client')
})

test('When instantiating submitter client without a service slug', t => {
  testInstantiation(t, [serviceToken, submitterUrl], 'ENOSERVICESLUG', 'No service slug passed to client')
})

// Set up a client to test the methods
const submitterClient = new FBSubmitterClient(serviceToken, submitterUrl, serviceSlug)

// Endpoint URLs
test('When asking for endpoint urls', t => {
  const getUrl =
  submitterClient.getEndpointUrl(`${submitterUrl}/submission`)
  t.equal(getUrl, submissionEndpointUrl, 'it should return the correct value for the get endpoint')
  const setUrl =
  submitterClient.getEndpointUrl(`${submitterUrl}/submission/:submissionId`, {submissionId})
  t.equal(setUrl, statusEndpointUrl, 'it should return the correct value for the set endpoint')

  t.end()
})

// JWT
test('When generating json web token', async t => {
  const clock = useFakeTimers({
    now: 1483228800000
  })
  const accessToken = submitterClient.generateAccessToken({data: 'testData'})
  const decodedAccessToken = jwt.verify(accessToken, serviceToken)
  t.equal(decodedAccessToken.data, 'testData', 'it should output a token containing the data')
  t.equal(decodedAccessToken.iat, 1483228800, 'it should output a token containing the iat property')

  clock.restore()
  t.end()
})

// Decrypting user ID and token
test('When decrypting the user’s ID and token', async t => {
  const decryptedData = submitterClient.decryptUserIdAndToken(encryptedUserIdTokenData)
  t.deepEqual(userIdTokenData, decryptedData, 'it should return the correct data from valid encrypted input')

  t.end()
})

test('When decrypting invalid user ID and token', async t => {
  t.plan(4)
  let invalidData
  try {
    invalidData = submitterClient.decryptUserIdAndToken(userToken, 'invalid')
  } catch (e) {
    t.equal(e.name, 'FBSubmitterClientError', 'it should return an error object of the correct type')
    t.equal(e.code, 500, 'it should return correct error code')
    t.equal(e.message, 'EINVALIDPAYLOAD', 'it should return the correct error message')
  }
  t.equal(invalidData, undefined, 'it should not return anything if data is invalid')

  t.end()
})

// Encrypting user ID and token
test('When encrypting the user ID and token', async t => {
  const encryptedData = submitterClient.encryptUserIdAndToken(userId, userToken)
  const decryptedData = submitterClient.decryptUserIdAndToken(encryptedData)
  t.deepEqual(userIdTokenData, decryptedData, 'it should encrypt the data correctly')
  // NB. have to decrypt the encryptedData to check
  // since the Initialization Vector guarantees the output will be different each time

  const encryptedDataAgain = submitterClient.encryptUserIdAndToken(userId, userToken)
  t.notEqual(encryptedDataAgain, encryptedData, 'it should not return the same value for the same input')

  t.end()
})

// Getting submission status
test('When requesting submission status', async t => {
  t.plan(3)

  const statusData = {
    id: submissionId,
    created_at: '2018-10-15T10:13:35Z',
    updated_at: '2018-10-15T10:13:35Z',
    status: 'queued'
  }
  const stubRequest = stub(request, 'get')
  stubRequest.callsFake(options => {
    return Promise.resolve(statusData)
  })

  const decryptedData = await submitterClient.getStatus(submissionId)

  const callArgs = stubRequest.getCall(0).args[0]
  t.equal(callArgs.url, statusEndpointUrl, 'it should call the correct url')
  t.ok(callArgs.headers['x-access-token'], 'it should add the x-access-token header')

  t.deepEqual(decryptedData, statusData, 'it should return the unencrypted data')

  stubRequest.restore()
  t.end()
})

// Submitting user instructions
test('When sending user instructions to submitter', async t => {
  t.plan(4)

  const stubRequest = stub(request, 'post')
  stubRequest.callsFake(options => {
    return Promise.resolve('')
  })
  const encryptStub = stub(submitterClient, 'encryptUserIdAndToken')
  encryptStub.callsFake(() => encryptedUserIdTokenData)
  const generateAccessTokenStub = stub(submitterClient, 'generateAccessToken')
  generateAccessTokenStub.callsFake(() => 'accessToken')

  const submissions = [{
    type: 'email'
  }]

  const expectedJSON = {
    service_slug: serviceSlug,
    encrypted_user_id_and_token: encryptedUserIdTokenData,
    submissions
  }

  const responseBody = await submitterClient.submit(userId, userToken, submissions)

  const callArgs = stubRequest.getCall(0).args[0]
  t.equal(callArgs.url, submissionEndpointUrl, 'it should call the correct url')
  t.deepEqual(callArgs.json, expectedJSON, 'it should post the correct data')
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
    t.equal(e.name, 'FBSubmitterClientError', 'it should return an error object of the correct type')
    t.equal(e.code, applicationErrorCode, `it should return correct error code (${applicationErrorCode})`)
    t.equal(e.message, expectedRequestErrorCode, `it should return the correct error message (${expectedRequestErrorCode})`)
  }
  t.equal(decryptedData, undefined, 'it should not return a value for the data')

  stubRequest.restore()
}

// Convenience function for testing client's getStatus method - calls generic testError function
// Params same as for testError, minus the clientMethod and stubMethod ones
const testStatusError = async (t, requestErrorCode, applicationErrorCode, expectedRequestErrorCode) => {
  const clientMethod = async () => {
    return submitterClient.getStatus(submissionId)
  }
  testError(clientMethod, 'get', t, requestErrorCode, applicationErrorCode, expectedRequestErrorCode)
}

// Convenience function for testing client's submit method - calls generic testError function
// Params same as for testError, minus the clientMethod and stubMethod one
const testSetError = async (t, requestErrorCode, applicationErrorCode, expectedRequestErrorCode) => {
  const clientMethod = async () => {
    return submitterClient.submit(userId, userToken, {})
  }
  testError(clientMethod, 'post', t, requestErrorCode, applicationErrorCode, expectedRequestErrorCode)
}

// Test all the errors for submitterClient.getStatus

test('When requesting status for submission that does not exist', async t => {
  testStatusError(t, 404)
})

test('When making an unauthorized request for submission status', async t => {
  testStatusError(t, 401)
})

test('When making an invalid request for submission status', async t => {
  testStatusError(t, 403)
})

test('When requesting submission status but the submitter cannot be reached', async t => {
  testStatusError(t, 'ECONNREFUSED', 503)
})

test('When requesting submission status but dns resolution for submitter fails', async t => {
  testStatusError(t, 'ENOTFOUND', 502)
})

test('When requesting submission status and an unspecified error code is returned', async t => {
  testStatusError(t, 'EMADEUP', 500)
})

test('When requesting submission status and an error object without error code is returned', async t => {
  testStatusError(t, '', 500, 'EUNSPECIFIED')
})

test('When requesting submission status and an error occurs but not error code is present', async t => {
  testStatusError(t, undefined, 500, 'ENOERROR')
})

// Test all the errors for submitterClient.submit

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

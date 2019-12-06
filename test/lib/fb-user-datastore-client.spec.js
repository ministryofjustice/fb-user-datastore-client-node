require('@ministryofjustice/module-alias/register')

const chai = require('chai')
const sinon = require('sinon')
const sinonChai = require('sinon-chai')

const {
  expect
} = chai

chai.use(sinonChai)

const FBUserDataStoreClient = require('~/fb-user-datastore-client-node/fb-user-datastore-client')

const serviceSlug = 'testServiceSlug'
const serviceToken = 'testServiceToken'
const serviceSecret = 'testServiceSecret'
const userDataStoreUrl = 'https://userdatastore'

describe('~/fb-user-datastore-client-node/fb-user-datastore-client', () => {
  describe('Always', () => it('exports the class', () => expect(FBUserDataStoreClient).to.be.a('function')))

  describe('Instantiating a client', () => {
    describe('With required parameters', () => {
      let client

      beforeEach(() => {
        client = new FBUserDataStoreClient(serviceSecret, serviceToken, serviceSlug, userDataStoreUrl)
      })

      it('assigns the service secret to a field of the instance', () => expect(client.serviceSecret).to.equal(serviceSecret))

      it('assigns the service token to a field of the instance', () => expect(client.serviceToken).to.equal(serviceToken))

      it('assigns the service slug to a field of the instance', () => expect(client.serviceSlug).to.equal(serviceSlug))

      it('assigns a default metrics object to the field `apiMetrics`', () => {
        expect(client.apiMetrics).to.be.an('object')

        const {
          startTimer
        } = client.apiMetrics

        expect(startTimer).to.be.a('function')
      })

      it('assigns a default metrics object to the field `requestMetrics`', () => {
        expect(client.requestMetrics).to.be.an('object')

        const {
          startTimer
        } = client.requestMetrics

        expect(startTimer).to.be.a('function')
      })
    })

    describe('Without a service secret parameter', () => {
      it('throws an error', () => expect(() => new FBUserDataStoreClient()).to.throw(Error, 'No service secret passed to client'))

      describe('The error', () => {
        it('has the expected name', () => {
          try {
            new FBUserDataStoreClient()
          } catch ({name}) {
            expect(name).to.equal('FBUserDataStoreClientError')
          }
        })

        it('has the expected code', () => {
          try {
            new FBUserDataStoreClient()
          } catch ({code}) {
            expect(code).to.equal('ENOSERVICESECRET')
          }
        })
      })
    })

    describe('Without a service token parameter', () => {
      it('throws an error', () => expect(() => new FBUserDataStoreClient(serviceSecret)).to.throw(Error, 'No service token passed to client'))

      describe('The error', () => {
        it('has the expected name', () => {
          try {
            new FBUserDataStoreClient(serviceSecret)
          } catch ({name}) {
            expect(name).to.equal('FBUserDataStoreClientError')
          }
        })

        it('has the expected code', () => {
          try {
            new FBUserDataStoreClient(serviceSecret)
          } catch ({code}) {
            expect(code).to.equal('ENOSERVICETOKEN')
          }
        })
      })
    })

    describe('Without a service slug parameter', () => {
      it('throws an error', () => expect(() => new FBUserDataStoreClient(serviceSecret, serviceToken)).to.throw(Error, 'No service slug passed to client'))

      describe('The error', () => {
        it('has the expected name', () => {
          try {
            new FBUserDataStoreClient(serviceSecret, serviceToken)
          } catch ({name}) {
            expect(name).to.equal('FBUserDataStoreClientError')
          }
        })

        it('has the expected code', () => {
          try {
            new FBUserDataStoreClient(serviceSecret, serviceToken)
          } catch ({code}) {
            expect(code).to.equal('ENOSERVICESLUG')
          }
        })
      })
    })

    describe('Without a service url parameter', () => {
      it('throws an error', () => expect(() => new FBUserDataStoreClient(serviceSecret, serviceToken, serviceSlug)).to.throw(Error, 'No microservice url passed to client'))

      describe('The error', () => {
        it('has the expected name', () => {
          try {
            new FBUserDataStoreClient(serviceSecret, serviceToken, serviceSlug)
          } catch ({name}) {
            expect(name).to.equal('FBUserDataStoreClientError')
          }
        })

        it('has the expected code', () => {
          try {
            new FBUserDataStoreClient(serviceSecret, serviceToken, serviceSlug)
          } catch ({code}) {
            expect(code).to.equal('ENOMICROSERVICEURL')
          }
        })
      })
    })
  })

  describe('`getData()`', () => {
    let client
    let sendGetStub
    let decryptStub

    let mockDecryptedData
    let mockArgs
    let mockLogger

    let returnValue

    beforeEach(async () => {
      client = new FBUserDataStoreClient(serviceSecret, serviceToken, serviceSlug, userDataStoreUrl)

      mockDecryptedData = {}

      sendGetStub = sinon.stub(client, 'sendGet').returns({payload: 'mock payload'})
      decryptStub = sinon.stub(client, 'decrypt').returns(mockDecryptedData)

      mockArgs = {userId: 'mock user id', userToken: 'mock user token'}
      mockLogger = {}

      returnValue = await client.getData(mockArgs, mockLogger)
    })

    afterEach(() => {
      sendGetStub.restore()
      decryptStub.restore()
    })

    it('calls `sendGet`', () => {
      expect(sendGetStub).to.be.calledWith({url: '/service/:serviceSlug/user/:userId', context: {serviceSlug, userId: 'mock user id'}}, mockLogger)
    })

    it('calls `decrypt`', () => {
      expect(decryptStub).to.be.calledWith('mock user token', 'mock payload')
    })

    it('returns a `Promise` which resolves to an object', () => {
      expect(returnValue).to.equal(mockDecryptedData)
    })
  })

  describe('`setData()`', () => {
    let client
    let sendPostStub
    let encryptStub

    let mockArgs
    let mockLogger

    let returnValue

    beforeEach(async () => {
      client = new FBUserDataStoreClient(serviceSecret, serviceToken, serviceSlug, userDataStoreUrl)
      sendPostStub = sinon.stub(client, 'sendPost').returns({payload: 'mock payload'})
      encryptStub = sinon.stub(client, 'encrypt').returns('mock encrypted payload')

      mockArgs = {userId: 'mock user id', userToken: 'mock user token', payload: 'mock payload'}
      mockLogger = {}

      returnValue = await client.setData(mockArgs, mockLogger)
    })

    afterEach(() => {
      sendPostStub.restore()
      encryptStub.restore()
    })

    it('calls `encrypt`', () => {
      expect(encryptStub).to.be.calledWith('mock user token', 'mock payload')
    })

    it('calls `sendPost`', () => {
      expect(sendPostStub).to.be.calledWith({url: '/service/:serviceSlug/user/:userId', context: {serviceSlug, userId: 'mock user id'}, payload: {payload: 'mock encrypted payload'}}, mockLogger)
    })

    it('returns a `Promise` which resolves to undefined', () => {
      return expect(returnValue).to.be.undefined
    })
  })
})

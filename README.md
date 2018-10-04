# Form Builder User Data Store client (Node)

Client for making requests to Form Builder platform user datastore endpoints

## Requirements

Node

Valid values for serviceSlug, serviceToken, userDataStoreUrl

## Installation

`npm install @ministryofjustice/fb-user-datastore-client-node`

## Usage

### Loading and initialising

``` javascript
// load client
const userDataStoreClient = require('@ministryofjustice/fb-user-datastore-client-node')

// initialise client
userDataStoreClient.get(serviceSlug, serviceToken, userDataStoreUrl)
```

### Fetching and storing

``` javascript
// fetch user data
const userData = await userDataStoreClient.get(userId, userToken)

// store user data
await userDataStoreClient.set(userId, userToken, userData)
```


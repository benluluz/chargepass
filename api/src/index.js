'use strict'

// Explicitly import all HTTP function modules so managed SWA API runtime
// always discovers and registers routes in Node programming model v4.
require('./functions/user')
require('./functions/push')
require('./functions/departures')
require('./functions/departureActions')

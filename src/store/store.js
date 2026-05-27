import { configureStore } from '@reduxjs/toolkit'

import provider from './reducers/provider'
// import tokens from './reducers/tokens'
// import nmn from './reducers/nmn'

export const store = configureStore({
  reducer: {
    provider
    // ,
    // tokens,
    // nmn
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false
    })
})

self.addEventListener('push', event => {
  let payload = { title: 'ChargePass', body: 'You have a new notification.', url: '/?view=my-activity', tag: 'chargepass' }
  try {
    payload = { ...payload, ...(event.data ? event.data.json() : {}) }
  } catch {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url || '/?view=my-activity' },
      tag: payload.tag || 'chargepass'
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification?.data?.url || '/?view=my-activity'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

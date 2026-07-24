const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeOrigin,
  isSharedUrl,
  isBlankUrl,
  matchesHomeUrl,
  createPersonalSessionCleaner,
} = require('../src/content-workspace')

describe('content-workspace URL helpers', () => {
  const sharedOrigins = [
    'https://jira.htpl.internal',
    'https://jira.example.com:8443/path-ignored',
    'https://ht365.atlassian.net',
    'https://id.atlassian.com',
  ]

  it('normalizeOrigin zwraca protocol+host+port', () => {
    assert.equal(normalizeOrigin('https://jira.htpl.internal/browse/X'), 'https://jira.htpl.internal')
    assert.equal(normalizeOrigin('https://jira.example.com:8443/foo'), 'https://jira.example.com:8443')
    assert.equal(normalizeOrigin('not a url'), null)
  })

  it('isSharedUrl rozpoznaje Jirę po origin', () => {
    assert.equal(isSharedUrl('https://jira.htpl.internal/secure/Dashboard.jspa', sharedOrigins), true)
    assert.equal(isSharedUrl('https://jira.example.com:8443/browse/ABC-1', sharedOrigins), true)
    assert.equal(
      isSharedUrl('https://ht365.atlassian.net/servicedesk/customer/portals', sharedOrigins),
      true
    )
    assert.equal(isSharedUrl('https://id.atlassian.com/login', sharedOrigins), true)
  })

  it('isSharedUrl odrzuca hub i Enovę', () => {
    assert.equal(isSharedUrl('http://kiosk.htpl.internal', sharedOrigins), false)
    assert.equal(isSharedUrl('https://enova.example.com/app', sharedOrigins), false)
  })

  it('isBlankUrl rozpoznaje about:blank', () => {
    assert.equal(isBlankUrl('about:blank'), true)
    assert.equal(isBlankUrl('https://jira.htpl.internal'), false)
  })

  it('matchesHomeUrl — z shared wychodzimy tylko na hub, nie na SSO Atlassian', () => {
    const home = 'http://kiosk.htpl.internal'
    assert.equal(matchesHomeUrl('http://kiosk.htpl.internal/apps', home), true)
    assert.equal(matchesHomeUrl('https://id.atlassian.com/login', home), false)
    assert.equal(matchesHomeUrl('https://ht365.atlassian.net/servicedesk', home), false)
  })
})

describe('createPersonalSessionCleaner', () => {
  it('czyści tylko personal session, nie shared', async () => {
    const calls = []
    const downloads = new Map()
    const cancelable = { cancel: () => calls.push('download-cancel') }
    downloads.set('x', cancelable)

    const personal = {
      clearStorageData: async () => {
        calls.push('personal-storage')
      },
      clearCache: async () => {
        calls.push('personal-cache')
      },
      clearAuthCache: () => {
        calls.push('personal-auth')
      },
    }

    const shared = {
      clearStorageData: async () => {
        calls.push('shared-storage')
      },
      clearCache: async () => {
        calls.push('shared-cache')
      },
      clearAuthCache: () => {
        calls.push('shared-auth')
      },
    }

    const clearPersonal = createPersonalSessionCleaner({
      getPersonalSession: () => personal,
      getActiveDownloads: () => downloads,
      withTimeoutResolve: async (promise) => promise,
    })

    await clearPersonal()

    assert.deepEqual(calls, [
      'download-cancel',
      'personal-storage',
      'personal-cache',
      'personal-auth',
    ])
    assert.equal(downloads.size, 0)
    assert.ok(!calls.includes('shared-storage'))
    assert.ok(!calls.some((c) => c.startsWith('shared')))
    // shared mock unused on purpose — cleaner must not receive it
    assert.equal(typeof shared.clearStorageData, 'function')
  })
})

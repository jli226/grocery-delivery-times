import log from 'loglevel'
import { fillForm, click, getNewPage } from '../util/browser'
import { isValidZip } from '../util/index'

const ACCOUNT = process.env.COSTCO_ACCOUNT
const PASSWORD = process.env.COSTCO_PASSWORD

const COSTCO_LINK = 'https://www.costco.com/logon-instacart'

const $changeZipButton =
  'div[style="height: 100%; position: relative;"][data-radium="true"] button[data-radium="true"]'
const $postalCodeInput = 'input[name="postal_code"]'
const $seeTimes = '*[type="button"][href="/costco/info?tab=delivery"]'
const $postalCodeSubmit = '.addressPickerModal div button'

const hasTimeSlot = (text) => !text.includes('No delivery times available')

const isNearZip = (zip1, zip2) => {
  return Math.abs(Number(zip1) - Number(zip2)) < 10
}

export default async (
  browser,
  zip,
  { account = ACCOUNT, password = PASSWORD, saveScreenshot = false }
) => {
  if (!browser || !zip) {
    log.error('Invalid costco calls:', { browser, zip })
  }
  if (!isValidZip(zip)) {
    log.error(`Invalid zip code: "${zip}`)
    throw new Error(`Invalid zip code: "${zip}`)
  }
  log.info('Costco: check delivery time for zip:', zip)
  const page = await getNewPage(browser)
  log.debug('Open costco instacart page')
  await page.goto(COSTCO_LINK)
  await fillForm(page, '#logonId', account)
  await fillForm(page, '#logonPassword', password)

  await Promise.all([
    page.waitForNavigation(),
    click(page, 'input[value="Sign In"]'),
  ])

  while (true) {
    try {
      await click(page, $changeZipButton)
      log.debug('wait for 1 second')
      await page.waitFor(1000)
      const postalCodeInput = await page.$($postalCodeInput)
      const buttons = await page.$$($postalCodeSubmit)
      if (postalCodeInput && buttons && buttons.length === 3) {
        break
      }
    } catch (e) {
      log.error(e)
    }
  }

  await fillForm(page, $postalCodeInput, zip, 5)
  const submitButton = (await page.$$($postalCodeSubmit))[2]
  await submitButton.click()

  await page.waitFor(1000)

  while (true) {
    try {
      if (await page.$($seeTimes)) {
        break
      }
      await Promise.all([page.waitForNavigation(), page.reload()])
      await page.waitFor(1000)
    } catch (e) {
      log.error(e)
    }
  }

  const zipButton = await page.$($changeZipButton)
  if (zipButton) {
    const text = await zipButton.evaluate((node) => node.innerText)
    if (text !== zip && !isNearZip(94103, zip)) {
      await page.close()
      return {
        hasSlot: false,
        text: `Costco doesn't support this zip: '${zip}'.`,
        link: COSTCO_LINK,
      }
    }
  }

  // Dismiss the existing order
  const toast = await page.$('#toast-container')
  if (toast) {
    await toast.evaluate((node) => (node.style.display = 'none'))
  }
  await click(page, $seeTimes)

  const path = `Costco - ${zip} - ${new Date().toISOString()}.png`
  const popup = await page.waitForSelector(
    '.react-tabs__tab-panel.react-tabs__tab-panel--selected > .module-renderer'
  )
  let text = await popup.evaluate((node) => node.innerText)
  let innerHTML = await popup.evaluate((node) => node.innerHTML)
  while (text === '') {
    log.debug('wait 1 second')
    await page.waitFor(1000)
    text = await popup.evaluate((node) => node.innerText)
  }
  log.debug({ text, innerHTML })
  log.debug('Save screenshot')
  const screenshot = await popup.screenshot({
    path: saveScreenshot && path,
    type: 'png',
    encoding: 'base64',
  })
  await page.close()
  const hasSlot = hasTimeSlot(text)
  return { hasSlot, text, screenshot, link: COSTCO_LINK }
}

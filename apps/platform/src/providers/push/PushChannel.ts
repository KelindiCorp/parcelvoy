import { PushTemplate } from '../../render/Template'
import { Variables } from '../../render'
import { PushProvider } from './PushProvider'
import { PushResponse } from './Push'
import { logger } from "../../config/logger"

export default class PushChannel {
    readonly provider: PushProvider
    constructor(provider?: PushProvider) {
        if (provider) {
            this.provider = provider
            this.provider.boot?.()
        } else {
            throw new Error('A valid push notification provider must be defined!')
        }
    }

    async send(template: PushTemplate, variables: Variables): Promise<PushResponse | unknown> {

        // Find tokens from active devices with push enabled
        const tokens = variables.user.pushEnabledDevices.map(device => device.token)

        // If no tokens, don't send
        if (tokens?.length <= 0) return

        const push = {
            tokens,
            ...template.compile(variables),
            uri: template.url,
        }

        logger.info({}, `KELINDI - PushChannel.send - ${Object.entries(template)}` )
        return await this.provider.send(push)
    }
}

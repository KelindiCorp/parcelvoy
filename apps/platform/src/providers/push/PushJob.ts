import { EncodedJob, Job } from '../../queue'
import { PushTemplate } from '../../render/Template'
import { createEvent } from '../../users/UserEventRepository'
import { MessageTrigger } from '../MessageTrigger'
import PushError from './PushError'
import { disableNotifications } from '../../users/UserRepository'
import { updateSendState } from '../../campaigns/CampaignService'
import { finalizeSend, loadSendJob, messageLock, prepareSend } from '../MessageTriggerService'
import { loadPushChannel } from '.'
import App from '../../app'
import { releaseLock } from '../../core/Lock'
import { logger } from '../../config/logger'
import { paramsToEncodedLink } from '../../render/LinkService'

export default class PushJob extends Job {
    static $name = 'push'

    static from(data: MessageTrigger): PushJob {
        return new this(data)
    }

    static async handler(trigger: MessageTrigger, raw: EncodedJob) {
        const data = await loadSendJob<PushTemplate>(trigger)
        if (!data) return

        const { campaign, template, user, project, context } = data

        try {
            template.url = paramsToEncodedLink(
              {
                userId: user.id,
                campaignId: campaign.id,
                path: 'c',
                redirect: template.url,
              }
            )

            // Load email channel so its ready to send
            const channel = await loadPushChannel(campaign.provider_id, project.id)
            if (!channel) {
                await updateSendState({
                    campaign,
                    user,
                    reference_id: trigger.reference_id,
                    state: 'aborted',
                })
                return
            }

            logger.info({}, `KELINDI - PushJob.handler - ${data}` )

            // Check current send rate and if the send is locked
            const isReady = await prepareSend(channel, data, raw)
            if (!isReady) return

            // Send the push and update the send record
            const result = await channel.send(template, data)
            await finalizeSend(data, result)

        } catch (error: any) {
            if (error instanceof PushError) {

                // If the push is unable to send, find invalidated tokens
                // and disable those devices
                await disableNotifications(user.id, error.invalidTokens)

                // Update send record
                await updateSendState({
                    campaign,
                    user,
                    reference_id: trigger.reference_id,
                    state: 'failed',
                })

                // Create an event about the disabling
                await createEvent(user, {
                    name: 'notifications_disabled',
                    data: {
                        ...context,
                        tokens: error.invalidTokens,
                    },
                })
            } else {
                App.main.error.notify(error)
            }
        } finally {
            await releaseLock(messageLock(campaign, user))
        }
    }
}
